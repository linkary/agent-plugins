/**
 * ap mcp rm — 从中央存储和/或目标工具移除 MCP 服务器定义。
 * 支持交互式多目标选择（Central + targets）、级联删除、--target 直接移除。
 */
import { listCentralMcpServers, removeCentralMcpServer } from '../../core/mcp-store.js';
import { loadConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { removeMcpServer } from '../../util/mcp-config-io.js';
import { getAdapters, getColoredLabel, resolveAdapter } from '../../targets/adapters.js';
import { resolveTargetContext } from '../../util/scope.js';
import { promptMultiSelect, promptReviewConfirm, promptSelect } from '../../util/prompt.js';
import { ANSI } from '../../util/ansi.js';
import {
  findSyncedMcpCopies,
  filterMcpAdapters,
  gatherTargetMcpServers,
  type SyncedMcpCopy,
  type TargetMcpServer,
} from './manage-utils.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import type { ConfigV1 } from '../../core/config.js';
import type { McpConfigSpec } from '../../core/mcp-types.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';
import { formatTargetReviewLine, formatTargetSummaryLines } from '../../util/review-display.js';

// ─── 常量 ────────────────────────────────────────────────────────────────

const CENTRAL_VALUE = '__central__';

// ─── Entry point ────────────────────────────────────────────────────────

export async function cmdMcpRemove(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  const args = positionals;
  const dryRun = flags['dry-run'] === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  // 无参数 + 无 --target + TTY → 全交互模式
  if (args.length === 0 && !flags.target && interactive) {
    return await interactiveRemove(flags, ctx);
  }

  // 有 --target 但无参数 + TTY → 交互选择 MCP 服务器
  if (args.length === 0 && flags.target && interactive) {
    return await interactiveRemoveFromTarget(flags, ctx);
  }

  // 无参数 + 非交互 → 报错
  if (args.length === 0) {
    process.stderr.write('Usage: ap mcp rm <server...>\n');
    return 1;
  }

  // ── 以下为有参数的逻辑 ──

  const targetRaw = flags.target;
  const targetFlag =
    typeof targetRaw === 'string'
      ? targetRaw
      : Array.isArray(targetRaw)
        ? targetRaw[0]
        : undefined;
  if (Array.isArray(targetRaw) && targetRaw.length > 1) {
    process.stderr.write('rm only supports a single --target. Use separate commands for multiple targets.\n');
    return 1;
  }

  if (targetFlag) {
    return await removeFromTargetDirect(args, targetFlag, flags, ctx, dryRun);
  }

  return await removeServers(args, dryRun, interactive, ctx);
}

// ─── 全交互模式：多选目标（含 Central）──────────────────────────────────

async function interactiveRemove(flags: ParsedFlags, ctx: CliRunContext): Promise<number> {
  const mcpAdapters = filterMcpAdapters(getAdapters());

  const targetOptions = [
    { label: 'Central', value: CENTRAL_VALUE },
    ...mcpAdapters.map((a) => ({ label: getColoredLabel(a), value: a.id })),
  ];

  const selectedTargets = await promptMultiSelect({
    message: 'Select where to remove from:',
    options: targetOptions,
  });

  if (selectedTargets.length === 0) {
    process.stdout.write('Cancelled.\n');
    return 0;
  }

  const hasCentral = selectedTargets.includes(CENTRAL_VALUE);
  const toolTargetIds = selectedTargets.filter((t) => t !== CENTRAL_VALUE);

  if (hasCentral) {
    await interactiveRemoveCentral(ctx, toolTargetIds);
  }

  if (toolTargetIds.length > 0) {
    await interactiveRemoveFromTools(toolTargetIds, flags, ctx);
  }

  return 0;
}

// ─── Phase A: 交互式中央删除（含级联提示）─────────────────────────────────

async function interactiveRemoveCentral(ctx: CliRunContext, pendingToolTargets: string[]): Promise<void> {
  const servers = await listCentralMcpServers();
  if (servers.length === 0) {
    process.stdout.write('(no central MCP servers installed)\n');
    return;
  }

  const selected = await promptMultiSelect({
    message: `Select central MCP servers to remove (${servers.length} available):`,
    options: servers.map((n) => ({ label: n, value: n })),
  });
  if (selected.length === 0) return;

  const confirmed = await promptReviewConfirm({
    message: `Remove ${selected.length} central MCP server(s)?`,
    summaryLines: ['Source: central MCP servers', `Selected: ${selected.length}`],
    detailLines: selected,
    default: false,
  });
  if (!confirmed) return;

  const registry = await loadRegistry();
  const syncState = await loadSyncState();

  for (const name of selected) {
    await removeCentralMcpServer(name);
    if (registry.mcp) delete registry.mcp[name];

    for (const context of Object.values(syncState.contexts)) {
      if (context.mcp) delete context.mcp[name];
    }

    process.stdout.write(`Removed: ${name}\n`);
  }

  await saveRegistry(registry);
  await saveSyncState(syncState);

  await promptCascadeDelete(selected, ctx, pendingToolTargets);
}

// ─── 级联删除：3 选项（all / select / keep）─────────────────────────────

/**
 * 扫描目标工具中的同步副本，提示用户选择删除策略。
 * excludeTargets: Phase B 中将手动处理的目标 ID，级联提示中跳过。
 */
async function promptCascadeDelete(
  serverNames: string[],
  ctx: CliRunContext,
  excludeTargets: string[],
): Promise<void> {
  const config = await loadConfig();
  const allCopies = await findSyncedMcpCopies({
    serverNames,
    config,
    currentCwd: ctx.cwd,
  });

  const copies = allCopies.filter((c) => !excludeTargets.includes(c.adapterId));
  if (copies.length === 0) return;

  process.stdout.write(`\n${ANSI.yellow}Synced copies found in other targets:${ANSI.reset}\n`);
  for (const c of copies) {
    process.stdout.write(`  ${c.serverName} -> ${c.adapterLabel} (${c.scope})\n`);
  }
  process.stdout.write('\n');

  const action = await promptSelect({
    message: 'Remove synced copies too?',
    options: [
      { label: 'Yes, remove all synced copies', value: 'all' as const },
      { label: 'Select which to remove', value: 'select' as const },
      { label: 'No, keep synced copies', value: 'no' as const },
    ],
  });

  if (action === 'no') return;

  let toRemove: SyncedMcpCopy[];
  if (action === 'all') {
    toRemove = copies;
  } else {
    const selectedIndices = await promptMultiSelect({
      message: 'Select synced copies to remove:',
      options: copies.map((c, i) => ({
        label: `${c.serverName} -> ${c.adapterLabel} (${c.scope})`,
        value: String(i),
      })),
      defaultSelected: 'all',
    });
    if (selectedIndices.length === 0) return;
    toRemove = selectedIndices.map((i) => copies[Number(i)]!);
  }

  const syncState = await loadSyncState();
  for (const copy of toRemove) {
    const mcpSpec = await resolveCascadeCopyMcpSpec(copy, config, ctx.cwd);
    if (!mcpSpec) continue;

    const removed = await removeMcpServer(mcpSpec, copy.serverName);
    if (!removed) continue;

    const contextId = makeContextId({
      target: copy.adapterId,
      scope: copy.scope,
      projectRoot: copy.projectRoot,
    });
    const context = syncState.contexts[contextId];
    if (context?.mcp) delete context.mcp[copy.serverName];

    process.stdout.write(`Removed: ${copy.serverName} (${copy.adapterLabel})\n`);
  }
  await saveSyncState(syncState);
}

// ─── Phase B: 交互式工具目标删除 ────────────────────────────────────────

async function interactiveRemoveFromTools(
  toolTargetIds: string[],
  flags: ParsedFlags,
  ctx: CliRunContext,
): Promise<void> {
  const mcpAdapters = filterMcpAdapters(getAdapters());
  const selectedAdapters = mcpAdapters.filter((a) => toolTargetIds.includes(a.id));

  const config = await loadConfig();
  const scopeFlag = typeof flags.scope === 'string' ? flags.scope : undefined;
  const cwdFlag = typeof flags.cwd === 'string' ? flags.cwd : undefined;

  const allServers = await gatherTargetMcpServers({
    adapters: selectedAdapters,
    config,
    scopeFlag,
    cwdFlag,
    currentCwd: ctx.cwd,
  });

  if (allServers.length === 0) {
    const targetLabels = selectedAdapters.map((a) => getColoredLabel(a)).join(', ');
    process.stdout.write(`(no MCP servers found in ${targetLabels})\n`);
    return;
  }

  const selected = await promptMultiSelect({
    message: `Select target MCP servers to remove (${allServers.length} available):`,
    options: allServers.map((s, i) => ({
      label: `${s.name} (${s.adapterLabel} - ${s.scope})`,
      value: String(i),
    })),
  });
  if (selected.length === 0) return;

  const selectedServers = selected.map((idx) => allServers[Number(idx)]!);
  const confirmed = await promptReviewConfirm({
    message: `Remove ${selectedServers.length} MCP server(s) from targets?`,
    summaryLines: [
      `Selected: ${selectedServers.length}`,
      ...formatTargetSummaryLines(
        selectedServers.map((server) => ({
          targetLabel: server.adapterLabel,
          scope: server.scope,
        })),
      ),
    ],
    detailLines: selectedServers.map((server) => formatTargetReviewLine(server.name, server.adapterLabel, server.scope)),
    default: false,
  });
  if (!confirmed) return;

  await removeTargetServers(
    selectedServers,
    selectedAdapters,
    config,
    { scopeFlag, cwdFlag, currentCwd: ctx.cwd },
  );
}

// ─── --target + TTY（无参数时交互选择 MCP 服务器）────────────────────────

async function interactiveRemoveFromTarget(flags: ParsedFlags, ctx: CliRunContext): Promise<number> {
  const mcpAdapters = filterMcpAdapters(getAdapters());
  const config = await loadConfig();

  const selectedAdapters = await selectTargetAdapters({
    adapters: mcpAdapters,
    flags,
    interactive: true,
    mode: 'multi',
    promptMessage: 'Select target(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const scopeFlag = typeof flags.scope === 'string' ? flags.scope : undefined;
  const cwdFlag = typeof flags.cwd === 'string' ? flags.cwd : undefined;

  const allServers = await gatherTargetMcpServers({
    adapters: selectedAdapters,
    config,
    scopeFlag,
    cwdFlag,
    currentCwd: ctx.cwd,
  });

  if (allServers.length === 0) {
    process.stdout.write('(no MCP servers found in selected targets)\n');
    return 0;
  }

  const selected = await promptMultiSelect({
    message: `Select MCP servers to remove (${allServers.length} available):`,
    options: allServers.map((s, i) => ({
      label: `${s.name} (${s.adapterLabel} - ${s.scope})`,
      value: String(i),
    })),
  });
  if (selected.length === 0) return 0;

  const selectedServers = selected.map((idx) => allServers[Number(idx)]!);
  const confirmed = await promptReviewConfirm({
    message: `Remove ${selectedServers.length} MCP server(s) from targets?`,
    summaryLines: [
      `Selected: ${selectedServers.length}`,
      ...formatTargetSummaryLines(
        selectedServers.map((server) => ({
          targetLabel: server.adapterLabel,
          scope: server.scope,
        })),
      ),
    ],
    detailLines: selectedServers.map((server) => formatTargetReviewLine(server.name, server.adapterLabel, server.scope)),
    default: false,
  });
  if (!confirmed) return 0;

  await removeTargetServers(
    selectedServers,
    selectedAdapters,
    config,
    { scopeFlag, cwdFlag, currentCwd: ctx.cwd },
  );
  return 0;
}

// ─── 中央存储移除（非交互 / 半交互路径）─────────────────────────────────

async function removeServers(
  names: string[],
  dryRun: boolean,
  interactive: boolean,
  ctx: CliRunContext,
): Promise<number> {
  const centralServers = await listCentralMcpServers();
  const valid = names.filter((n) => centralServers.includes(n));
  const unknown = names.filter((n) => !centralServers.includes(n));

  if (unknown.length > 0) {
    process.stderr.write(`Unknown MCP server(s): ${unknown.join(', ')}\n`);
  }
  if (valid.length === 0) return 1;

  if (dryRun) {
    for (const name of valid) {
      process.stdout.write(`[dry-run] Would remove MCP server: ${name}\n`);
    }
    return 0;
  }

  const registry = await loadRegistry();
  const syncState = await loadSyncState();

  for (const name of valid) {
    await removeCentralMcpServer(name);
    if (registry.mcp) delete registry.mcp[name];

    for (const context of Object.values(syncState.contexts)) {
      if (context.mcp) delete context.mcp[name];
    }

    process.stdout.write(`${ANSI.red}Removed: ${name}${ANSI.reset}\n`);
  }

  await saveRegistry(registry);
  await saveSyncState(syncState);

  if (interactive) {
    await promptCascadeDelete(valid, ctx, []);
  }

  return 0;
}

// ─── Direct target removal (non-interactive path) ───────────────────────

async function removeFromTargetDirect(
  servers: string[],
  targetFlag: string,
  flags: ParsedFlags,
  ctx: CliRunContext,
  dryRun: boolean,
): Promise<number> {
  const adapter = resolveAdapter(targetFlag);
  if (!adapter) {
    const adapters = getAdapters();
    process.stderr.write(`Unknown target: ${targetFlag}\n`);
    process.stderr.write(`Known targets: ${adapters.map((a) => a.id).join(', ')}\n`);
    return 1;
  }

  if (!adapter.resolveMcpConfig) {
    process.stderr.write(`Target ${adapter.id} does not support MCP configuration.\n`);
    return 1;
  }

  const config = await loadConfig();
  const targetConfig = config.targets[adapter.id];

  const { scope, projectRoot, homeDir } = await resolveTargetContext({
    scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
    cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
    defaultScope: targetConfig?.defaultScope,
    currentCwd: ctx.cwd,
  });

  const mcpSpec = adapter.resolveMcpConfig({ scope, projectRoot, homeDir });
  if (!mcpSpec) {
    process.stderr.write(`Target ${adapter.id} does not support MCP in ${scope} scope.\n`);
    return 1;
  }

  const syncState = await loadSyncState();
  const contextId = makeContextId({
    target: adapter.id,
    scope,
    projectRoot: scope === 'local' ? projectRoot : undefined,
  });
  const context = syncState.contexts[contextId];

  let removed = 0;
  for (const name of servers) {
    if (dryRun) {
      process.stdout.write(`[dry-run] rm ${name} from ${getColoredLabel(adapter)} (${scope})\n`);
      removed++;
      continue;
    }
    const ok = await removeMcpServer(mcpSpec, name);
    if (!ok) {
      process.stderr.write(`Not found in target: ${name}\n`);
      continue;
    }
    if (context?.mcp) delete context.mcp[name];
    removed++;
    process.stdout.write(`Removed from ${getColoredLabel(adapter)} (${scope}): ${name}\n`);
  }

  if (!dryRun) await saveSyncState(syncState);
  return removed > 0 ? 0 : 1;
}

// ─── 共享：批量移除目标 MCP 服务器 ──────────────────────────────────────

/**
 * 从目标工具 MCP 配置文件中移除指定服务器并更新 sync-state。
 * 供 interactiveRemoveFromTools 和 interactiveRemoveFromTarget 复用。
 */
async function removeTargetServers(
  servers: TargetMcpServer[],
  adapters: import('../../targets/adapters.js').TargetAdapter[],
  config: ConfigV1,
  resolveParams: { scopeFlag?: string; cwdFlag?: string; currentCwd: string },
): Promise<void> {
  // 按 adapterId 预构建 McpConfigSpec，避免重复解析
  const specMap = new Map<string, McpConfigSpec>();
  for (const adapter of adapters) {
    if (!adapter.resolveMcpConfig) continue;
    const targetConfig = config.targets[adapter.id];
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag: resolveParams.scopeFlag,
      cwdFlag: resolveParams.cwdFlag,
      defaultScope: targetConfig?.defaultScope,
      currentCwd: resolveParams.currentCwd,
    });
    const mcpSpec = adapter.resolveMcpConfig({ scope, projectRoot, homeDir });
    if (mcpSpec) specMap.set(adapter.id, mcpSpec);
  }

  const syncState = await loadSyncState();

  for (const server of servers) {
    const mcpSpec = specMap.get(server.adapterId);
    if (!mcpSpec) continue;

    const removed = await removeMcpServer(mcpSpec, server.name);
    if (!removed) continue;

    const contextId = makeContextId({
      target: server.adapterId,
      scope: server.scope,
      projectRoot: server.projectRoot,
    });
    const context = syncState.contexts[contextId];
    if (context?.mcp) delete context.mcp[server.name];

    process.stdout.write(`Removed: ${server.name} (${server.adapterLabel})\n`);
  }

  await saveSyncState(syncState);
}

// ─── 辅助：为级联删除解析 MCP 配置路径 ──────────────────────────────────

/**
 * Resolve MCP config path for a discovered synced copy.
 * Uses the copy's discovered scope/projectRoot instead of target defaults.
 */
export async function resolveCascadeCopyMcpSpec(
  copy: SyncedMcpCopy,
  config: ConfigV1,
  currentCwd: string,
): Promise<McpConfigSpec | null> {
  const adapter = getAdapters().find((a) => a.id === copy.adapterId);
  if (!adapter?.resolveMcpConfig) return null;

  const targetConfig = config.targets[adapter.id];
  const { scope, projectRoot, homeDir } = await resolveTargetContext({
    scopeFlag: copy.scope,
    cwdFlag: copy.scope === 'local' ? copy.projectRoot : undefined,
    defaultScope: targetConfig?.defaultScope ?? 'global',
    currentCwd,
  });
  return adapter.resolveMcpConfig({ scope, projectRoot, homeDir });
}
