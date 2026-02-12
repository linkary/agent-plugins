/**
 * ap mcp rm — 从中央存储移除 MCP 服务器定义。
 * 可选级联删除：同时从目标工具的配置文件中移除。
 */
import { listCentralMcpServers, removeCentralMcpServer } from '../../core/mcp-store.js';
import { loadConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import { loadSyncState, saveSyncState } from '../../core/sync-state.js';
import { removeMcpServer } from '../../util/mcp-config-io.js';
import { getAdapters, getColoredLabel } from '../../targets/adapters.js';
import { resolveTargetContext } from '../../util/scope.js';
import { promptConfirm, promptMultiSelect } from '../../util/prompt.js';
import { ANSI } from '../../util/ansi.js';
import { findSyncedMcpCopies, type SyncedMcpCopy } from './manage-utils.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdMcpRemove(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  const dryRun = flags['dry-run'] === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  // 无参数 + TTY → 交互选择
  if (positionals.length === 0 && interactive) {
    return await interactiveRemove(dryRun, ctx);
  }

  if (positionals.length === 0) {
    process.stderr.write('Usage: ap mcp rm <server...>\n');
    return 1;
  }

  return await removeServers(positionals, dryRun, interactive, ctx);
}

// ─── 交互式移除 ─────────────────────────────────────────────────────────

async function interactiveRemove(dryRun: boolean, ctx: CliRunContext): Promise<number> {
  const servers = await listCentralMcpServers();
  if (servers.length === 0) {
    process.stdout.write('(no MCP servers installed)\n');
    return 0;
  }

  const selected = await promptMultiSelect({
    message: 'Select MCP server(s) to remove:',
    options: servers.map((name) => ({ label: name, value: name })),
    defaultSelected: [],
  });

  if (selected.length === 0) {
    process.stdout.write('No servers selected.\n');
    return 0;
  }

  return await removeServers(selected, dryRun, true, ctx);
}

// ─── 核心移除逻辑 ───────────────────────────────────────────────────────

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

  // 扫描已同步的副本
  const config = await loadConfig();
  const copies = await findSyncedMcpCopies({
    serverNames: valid,
    config,
    currentCwd: ctx.cwd,
  });

  // 询问是否级联删除
  let cascadeDelete = false;
  if (copies.length > 0 && interactive) {
    process.stdout.write(`\nFound ${copies.length} synced copy(s) across target tools:\n`);
    for (const c of copies) {
      process.stdout.write(`  ${c.serverName} in ${c.adapterLabel} (${c.scope})\n`);
    }
    cascadeDelete = await promptConfirm('Also remove from target tool configs?');
  }

  if (dryRun) {
    for (const name of valid) {
      process.stdout.write(`[dry-run] Would remove MCP server: ${name}\n`);
    }
    if (cascadeDelete) {
      for (const c of copies) {
        process.stdout.write(`[dry-run] Would remove ${c.serverName} from ${c.adapterLabel}\n`);
      }
    }
    return 0;
  }

  // 级联删除
  if (cascadeDelete) {
    const adapters = getAdapters();
    for (const copy of copies) {
      const adapter = adapters.find((a) => a.id === copy.adapterId);
      if (!adapter?.resolveMcpConfig) continue;

      const targetConfig = config.targets[adapter.id];
      const { scope, projectRoot, homeDir } = await resolveTargetContext({
        defaultScope: targetConfig?.defaultScope ?? 'global',
        currentCwd: ctx.cwd,
      });
      const mcpSpec = adapter.resolveMcpConfig({ scope, projectRoot, homeDir });
      if (!mcpSpec) continue;

      const removed = await removeMcpServer(mcpSpec, copy.serverName);
      if (removed) {
        process.stdout.write(`Removed ${copy.serverName} from ${copy.adapterLabel}\n`);
      }
    }
  }

  // 从中央存储删除
  const registry = await loadRegistry();
  const syncState = await loadSyncState();

  for (const name of valid) {
    await removeCentralMcpServer(name);
    if (registry.mcp) delete registry.mcp[name];

    // 清理 sync-state 中的 mcp 记录
    for (const context of Object.values(syncState.contexts)) {
      if (context.mcp) delete context.mcp[name];
    }

    process.stdout.write(`${ANSI.red}Removed: ${name}${ANSI.reset}\n`);
  }

  await saveRegistry(registry);
  await saveSyncState(syncState);

  return 0;
}
