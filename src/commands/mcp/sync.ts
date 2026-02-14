/**
 * ap mcp sync — 将中央 MCP 服务器定义同步到目标工具配置文件。
 * 核心操作是 readConfig -> merge entry -> writeConfig。
 */
import { listCentralMcpServers, readCentralMcpServer, computeMcpHash } from '../../core/mcp-store.js';
import { loadConfig } from '../../core/config.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { getAdapters, getColoredLabel, type Scope, type TargetAdapter } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { resolveTargetContext } from '../../util/scope.js';
import { readMcpServers, writeMcpServer } from '../../util/mcp-config-io.js';
import { promptChoice, promptMultiSelect } from '../../util/prompt.js';
import { ANSI } from '../../util/ansi.js';
import { getCentralMcpDir } from '../../util/apg-paths.js';
import { filterMcpAdapters } from './manage-utils.js';
import type { McpConfigSpec, McpServerDef } from '../../core/mcp-types.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

type SyncEntry = {
  name: string;
  centralDef: McpServerDef;
  centralHash: string;
  mcpSpec: McpConfigSpec;
  adapter: TargetAdapter;
  scope: Scope;
  projectRoot: string;
};

type EntryStatus = 'new' | 'replace' | 'same';

function groupEntriesByName<T extends { name: string }>(entries: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const entry of entries) {
    const list = map.get(entry.name);
    if (list) list.push(entry);
    else map.set(entry.name, [entry]);
  }
  return map;
}

function formatStatusLabel(status: EntryStatus): string {
  if (status === 'new') return `${ANSI.green}new${ANSI.reset}`;
  if (status === 'replace') return `${ANSI.yellow}replace${ANSI.reset}`;
  return `${ANSI.dim}same${ANSI.reset}`;
}

function formatCountSummary(counts: { newCount: number; replaceCount: number; sameCount: number }): string {
  const parts: string[] = [];
  if (counts.newCount > 0) parts.push(`${ANSI.green}${counts.newCount} new${ANSI.reset}`);
  if (counts.replaceCount > 0) parts.push(`${ANSI.yellow}${counts.replaceCount} replace${ANSI.reset}`);
  if (counts.sameCount > 0) parts.push(`${ANSI.dim}${counts.sameCount} same${ANSI.reset}`);
  return parts.join(', ');
}

function formatScopeTitle(scopes: Scope[]): string {
  const uniqueScopes = [...new Set(scopes)];
  if (uniqueScopes.length === 1) {
    if (uniqueScopes[0] === 'global') return `${ANSI.bold}${ANSI.brightBlue}global${ANSI.reset}`;
    return `${ANSI.bold}${ANSI.brightMagenta}local${ANSI.reset}`;
  }
  return `${ANSI.bold}${ANSI.yellow}mixed${ANSI.reset}`;
}

export async function cmdMcpSync(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const scopeFlag = typeof flags.scope === 'string' ? flags.scope : undefined;
  const cwdFlag = typeof flags.cwd === 'string' ? flags.cwd : undefined;

  const allAdapters = getAdapters();
  const mcpAdapters = filterMcpAdapters(allAdapters);
  if (mcpAdapters.length === 0) {
    process.stderr.write('No target tools with MCP support found.\n');
    return 1;
  }

  const selectedAdapters = await selectTargetAdapters({
    adapters: mcpAdapters,
    flags,
    interactive,
    mode: 'multi',
    promptMessage: 'Select sync target(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const config = await loadConfig();

  const availableServers = await listCentralMcpServers();
  if (availableServers.length === 0) {
    process.stdout.write('(no MCP servers to sync)\n');
    return 0;
  }

  // Phase 1: 构建所有同步条目
  const allEntries: SyncEntry[] = [];
  for (const adapter of selectedAdapters) {
    if (!adapter.resolveMcpConfig) continue;
    const targetConfig = config.targets[adapter.id];
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag,
      cwdFlag,
      defaultScope: targetConfig?.defaultScope,
      currentCwd: ctx.cwd,
    });

    const mcpSpec = adapter.resolveMcpConfig({ scope, projectRoot, homeDir });
    if (!mcpSpec) continue;

    // 确定要同步哪些 MCP 服务器
    const defaultServers =
      targetConfig?.includeMcp && !targetConfig.includeMcp.includes('*')
        ? targetConfig.includeMcp.filter((s) => availableServers.includes(s))
        : availableServers;

    for (const name of defaultServers) {
      if (positionals.length > 0 && !positionals.includes(name)) continue;

      const centralDef = await readCentralMcpServer(name);
      if (!centralDef) continue;

      allEntries.push({
        name,
        centralDef,
        centralHash: computeMcpHash(centralDef),
        mcpSpec,
        adapter,
        scope,
        projectRoot,
      });
    }
  }

  if (allEntries.length === 0) {
    process.stdout.write('No MCP servers available to sync.\n');
    return 0;
  }
  const srcBaseDir = getCentralMcpDir();
  const scopeTitle = formatScopeTitle(allEntries.map((entry) => entry.scope));

  // Phase 2: 检查目标状态并分类
  type EntryWithStatus = SyncEntry & { existingDef: McpServerDef | null; status: EntryStatus };
  const entriesWithStatus: EntryWithStatus[] = await Promise.all(
    allEntries.map(async (entry) => {
      const targetServers = await readMcpServers(entry.mcpSpec);
      const existingDef = targetServers[entry.name] ?? null;
      const existingHash = existingDef ? computeMcpHash(existingDef) : '';
      return {
        ...entry,
        existingDef,
        status: !existingDef ? ('new' as const) : existingHash === entry.centralHash ? ('same' as const) : ('replace' as const),
      };
    }),
  );

  // Phase 3: 交互选择（按服务器名去重）
  let finalEntries: EntryWithStatus[];
  if (positionals.length > 0) {
    finalEntries = entriesWithStatus;
  } else if (interactive && !force) {
    const replaceCount = entriesWithStatus.filter((e) => e.status === 'replace').length;
    const newCount = entriesWithStatus.filter((e) => e.status === 'new').length;
    const sameCount = entriesWithStatus.filter((e) => e.status === 'same').length;
    process.stdout.write(`\nPreview: ${formatCountSummary({ newCount, replaceCount, sameCount })}\n`);

    const grouped = groupEntriesByName(entriesWithStatus);
    const groupedItems = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
    const defaultSelected = groupedItems
      .filter(([, entries]) => entries.some((entry) => entry.status === 'new'))
      .map(([name]) => name);

    const selectedNames = await promptMultiSelect({
      message: `Confirm MCP servers to sync (${scopeTitle}, source: ${srcBaseDir}):`,
      options: groupedItems.map(([name, entries]) => {
        const replace = entries.filter((entry) => entry.status === 'replace').length;
        const fresh = entries.filter((entry) => entry.status === 'new').length;
        const same = entries.filter((entry) => entry.status === 'same').length;
        const status = formatCountSummary({ newCount: fresh, replaceCount: replace, sameCount: same });
        return {
          label: `${name} -> ${entries
            .map((entry) => `${getColoredLabel(entry.adapter)} (${formatStatusLabel(entry.status)})`)
            .join(', ')} [${status}]`,
          value: name,
        };
      }),
      defaultSelected,
    });

    if (selectedNames.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
    const selectedNameSet = new Set(selectedNames);
    finalEntries = entriesWithStatus.filter((entry) => selectedNameSet.has(entry.name));
  } else {
    process.stdout.write(`\nSync ${entriesWithStatus.length} MCP server target(s) from ${srcBaseDir} (${scopeTitle}):\n`);
    for (const s of entriesWithStatus) {
      process.stdout.write(`  ${s.name} -> ${getColoredLabel(s.adapter)} (${formatStatusLabel(s.status)})\n`);
    }
    finalEntries = entriesWithStatus;
  }

  // Phase 4: 执行同步
  const syncState = await loadSyncState();
  let conflictMode: 'ask' | 'overwrite' | 'skip' = force ? 'overwrite' : 'ask';

  for (const entry of finalEntries) {
    const { name, centralDef, centralHash, mcpSpec, adapter, scope, projectRoot, existingDef } = entry;

    const contextId = makeContextId({
      target: adapter.id,
      scope,
      projectRoot: scope === 'local' ? projectRoot : undefined,
    });
    const context = syncState.contexts[contextId] ?? { skills: {} };
    if (!context.mcp) context.mcp = {};
    syncState.contexts[contextId] = context;

    // 目标不存在该服务器 -> 直接写入
    if (!existingDef) {
      if (dryRun) {
        process.stdout.write(`[dry-run] add ${name} -> ${getColoredLabel(adapter)}\n`);
        continue;
      }
      await writeMcpServer(mcpSpec, name, centralDef);
      context.mcp[name] = { hash: centralHash, syncedAt: new Date().toISOString() };
      process.stdout.write(`Synced: ${name} -> ${getColoredLabel(adapter)}\n`);
      continue;
    }

    // 对比 hash
    const existingHash = computeMcpHash(existingDef);
    if (existingHash === centralHash) {
      context.mcp[name] = { hash: centralHash, syncedAt: context.mcp[name]?.syncedAt ?? new Date().toISOString() };
      process.stdout.write(`Up-to-date: ${name} (${getColoredLabel(adapter)})\n`);
      continue;
    }

    // 冲突处理
    const lastSync = context.mcp[name];
    const isManagedClean = lastSync?.hash === existingHash;
    let mode = conflictMode;
    if (mode === 'ask' && isManagedClean) {
      mode = 'overwrite';
    }

    if (mode === 'ask') {
      if (!interactive) {
        process.stderr.write(`Conflict for ${name}. Re-run with --force or in an interactive terminal.\n`);
        return 1;
      }
      const choice = await promptChoice({
        message: `Conflict for ${name} in ${getColoredLabel(adapter)}.`,
        options: [
          { key: 'o', label: 'Overwrite' },
          { key: 's', label: 'Skip' },
          { key: 'O', label: 'Overwrite all' },
          { key: 'S', label: 'Skip all' },
          { key: 'q', label: 'Quit' },
        ],
      });
      if (choice === 'q') return 1;
      if (choice === 'O') conflictMode = 'overwrite';
      if (choice === 'S') conflictMode = 'skip';
      mode = choice === 'o' || choice === 'O' ? 'overwrite' : 'skip';
    }

    if (mode === 'skip') {
      process.stdout.write(`Skipped: ${name}\n`);
      continue;
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] overwrite ${name} -> ${getColoredLabel(adapter)}\n`);
      continue;
    }

    await writeMcpServer(mcpSpec, name, centralDef);
    context.mcp[name] = { hash: centralHash, syncedAt: new Date().toISOString() };
    process.stdout.write(`Synced: ${name} -> ${getColoredLabel(adapter)}\n`);
  }

  if (!dryRun) await saveSyncState(syncState);

  return 0;
}
