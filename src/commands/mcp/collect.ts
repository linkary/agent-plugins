/**
 * ap mcp collect — 从目标工具配置文件中提取 MCP 服务器定义到中央存储。
 * 核心操作是 readConfig -> extract entries -> writeJson to central。
 */
import {
  readCentralMcpServer,
  writeCentralMcpServer,
  computeMcpHash,
  computeMcpSerializedSize,
  ensureCentralMcpStore,
  getCentralMcpPath,
} from '../../core/mcp-store.js';
import { loadConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { type Scope, getAdapters, getColoredLabel, type TargetAdapter } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { resolveTargetContext } from '../../util/scope.js';
import { readMcpServers } from '../../util/mcp-config-io.js';
import { promptChoice, promptMultiSelect } from '../../util/prompt.js';
import { ANSI } from '../../util/ansi.js';
import { filterMcpAdapters } from './manage-utils.js';
import { normalizeCentralMcpDef, parseMcpToCanonical } from '../../util/mcp-transform.js';
import { formatCollectReviewLine } from '../../util/review-display.js';
import {
  formatSize,
  formatSyncMetadata,
  formatSyncMetadataChange,
  type SyncItemMetadata,
} from '../../util/sync-preview.js';
import { classifySyncStatus, isAutoApplyStatus, isGatedStatus, type SyncStatus } from '../../util/sync-status.js';
import fs from 'node:fs/promises';
import type { McpServerDef } from '../../core/mcp-types.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

type CollectStatus = SyncStatus;

type CollectEntry = {
  name: string;
  def: McpServerDef;
  hash: string;
  adapter: TargetAdapter;
  scope: Scope;
  projectRoot: string;
  status: CollectStatus;
  sourceMeta: SyncItemMetadata;
  centralMeta?: SyncItemMetadata | null;
};

const STATUS_LABELS: Record<CollectStatus, string> = {
  new: `${ANSI.green}new${ANSI.reset}`,
  same: `${ANSI.gray}same${ANSI.reset}`,
  replace: `${ANSI.yellow}replace${ANSI.reset}`,
  'dest-ahead': `${ANSI.red}central newer${ANSI.reset}`,
  conflict: `${ANSI.red}conflict${ANSI.reset}`,
};

export async function cmdMcpCollect(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
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
    promptMessage: 'Select collect source(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const config = await loadConfig();
  await ensureCentralMcpStore();
  const syncState = await loadSyncState();
  let incompatibleCount = 0;
  let duplicateConflictCount = 0;

  // Phase 1: 收集所有目标中的 MCP 服务器定义
  const allEntries: CollectEntry[] = [];
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

    const servers = await readMcpServers(mcpSpec);
    for (const [name, def] of Object.entries(servers)) {
      if (positionals.length > 0 && !positionals.includes(name)) continue;

      const parsed = parseMcpToCanonical(def);
      if (!parsed.canonical) {
        incompatibleCount++;
        process.stderr.write(
          `${ANSI.yellow}Skipped ${name} from ${adapter.label}:${ANSI.reset} ${parsed.error ?? 'invalid definition'}\n`,
        );
        continue;
      }

      const normalizedDef = normalizeCentralMcpDef(def);
      if (!normalizedDef.def) {
        incompatibleCount++;
        process.stderr.write(
          `${ANSI.yellow}Skipped ${name} from ${adapter.label}:${ANSI.reset} ${normalizedDef.error ?? 'invalid definition'}\n`,
        );
        continue;
      }

      const hash = computeMcpHash(normalizedDef.def);
      const sourceSize = computeMcpSerializedSize(normalizedDef.def);
      const configStat = await fs.stat(mcpSpec.configPath).catch(() => null);
      const sourceMeta: SyncItemMetadata = { sizeBytes: sourceSize, changedAtMs: configStat?.mtimeMs ?? Date.now() };
      const centralDef = await readCentralMcpServer(name);
      let status: CollectStatus;
      let centralMeta: SyncItemMetadata | null = null;

      const contextId = makeContextId({
        target: adapter.id,
        scope,
        projectRoot: scope === 'local' ? projectRoot : undefined,
      });
      const baselineHash = syncState.contexts[contextId]?.mcp?.[name]?.hash;

      if (!centralDef) {
        status = 'new';
      } else {
        const normalizedCentral = normalizeCentralMcpDef(centralDef);
        if (!normalizedCentral.def) {
          status = 'conflict';
        } else {
          const centralSize = computeMcpSerializedSize(normalizedCentral.def);
          const centralPath = getCentralMcpPath(name);
          const centralStat = await fs.stat(centralPath).catch(() => null);
          centralMeta = { sizeBytes: centralSize, changedAtMs: centralStat?.mtimeMs ?? Date.now() };
          const centralHash = computeMcpHash(normalizedCentral.def);
          status = classifySyncStatus({ destExists: true, srcHash: hash, destHash: centralHash, baselineHash });
        }
      }

      allEntries.push({
        name,
        def: normalizedDef.def,
        hash,
        adapter,
        scope,
        projectRoot,
        status,
        sourceMeta,
        centralMeta,
      });
    }
  }

  if (allEntries.length === 0) {
    process.stdout.write('No MCP servers found in target configs.\n');
    return 0;
  }

  // 去重：同名服务器默认保留第一个（来自最先选择的 adapter），不同 hash 计为 source 冲突
  const byName = new Map<string, CollectEntry>();
  for (const entry of allEntries) {
    const existing = byName.get(entry.name);
    if (!existing) {
      byName.set(entry.name, entry);
      continue;
    }
    if (existing.hash !== entry.hash) {
      duplicateConflictCount++;
      process.stderr.write(
        `${ANSI.yellow}Duplicate source conflict:${ANSI.reset} ${entry.name} differs between ${existing.adapter.label} and ${entry.adapter.label}; keeping first.\n`,
      );
    }
  }
  const uniqueEntries = [...byName.values()];

  // Phase 2: 交互选择
  let selectedEntries: CollectEntry[];
  if (positionals.length > 0 || !interactive) {
    selectedEntries = uniqueEntries.filter((e) => e.status !== 'same');
  } else {
    const options = uniqueEntries.map((e, i) => {
      const statusLabel = STATUS_LABELS[e.status];
      let meta = '';
      if (e.status === 'same') {
        meta = ` ${formatSize(e.sourceMeta.sizeBytes)}`;
      } else if (e.centralMeta) {
        meta = ` ${formatSyncMetadataChange(e.sourceMeta, e.centralMeta)}`;
      } else {
        meta = ` ${formatSyncMetadata(e.sourceMeta)}`;
      }
      return {
        label: `${formatCollectReviewLine(e.name, getColoredLabel(e.adapter), e.scope)} [${statusLabel}]${meta}`,
        value: String(i),
      };
    });

    if (uniqueEntries.some((e) => e.status === 'dest-ahead')) {
      process.stderr.write(
        `${ANSI.dim}  ↳ "central newer": the hub changed since last sync; collecting overwrites it. Use "ap mcp sync" to push instead.${ANSI.reset}\n`,
      );
    }

    // Default: select safe pulls only ('new' + 'replace')
    const defaultSelected = uniqueEntries
      .map((e, i) => (isAutoApplyStatus(e.status) ? String(i) : null))
      .filter((v): v is string => v !== null);

    const selectedKeys = await promptMultiSelect({
      message: 'Select MCP servers to collect:',
      options,
      defaultSelected,
      sortDefaultSelectedToTop: true,
    });

    if (selectedKeys.length === 0) {
      process.stdout.write('No servers selected.\n');
      return 0;
    }
    selectedEntries = selectedKeys.map((i) => uniqueEntries[Number(i)]!);
  }

  // Phase 3: 处理需确认条目并执行
  const registry = await loadRegistry();
  if (!registry.mcp) registry.mcp = {};
  let conflictMode: 'ask' | 'overwrite' | 'skip' = force ? 'overwrite' : 'ask';

  for (const entry of selectedEntries) {
    const { name, def, hash, adapter, scope, projectRoot, status } = entry;

    if (status === 'same') {
      process.stdout.write(`Up-to-date: ${name}\n`);
      continue;
    }

    if (isGatedStatus(status)) {
      const detail = status === 'dest-ahead' ? 'central is newer than' : 'central differs from';
      let mode = conflictMode;
      if (mode === 'ask') {
        if (!interactive) {
          process.stderr.write(
            `${name} needs review (${status}). Re-run with --force or in an interactive terminal.\n`,
          );
          return 1;
        }
        const choice = await promptChoice({
          message: `Review ${name}: ${detail} ${getColoredLabel(adapter)} (${scope}).`,
          options: [
            { key: 'o', label: 'Overwrite central' },
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
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] collect ${name} from ${getColoredLabel(adapter)}\n`);
      continue;
    }

    // 写入中央存储
    await writeCentralMcpServer(name, def);

    // 更新 registry
    const now = new Date().toISOString();
    registry.mcp[name] = {
      name,
      addedAt: registry.mcp[name]?.addedAt ?? now,
      updatedAt: now,
      source: { type: 'collected', from: { target: adapter.id, scope } },
    };

    // 更新 sync-state
    const contextId = makeContextId({
      target: adapter.id,
      scope,
      projectRoot: scope === 'local' ? projectRoot : undefined,
    });
    const context = syncState.contexts[contextId] ?? { skills: {} };
    if (!context.mcp) context.mcp = {};
    context.mcp[name] = { hash, syncedAt: now };
    syncState.contexts[contextId] = context;

    process.stdout.write(`Collected: ${name} from ${getColoredLabel(adapter)}\n`);
  }

  if (!dryRun) {
    await saveRegistry(registry);
    await saveSyncState(syncState);
  }
  const summaryParts: string[] = [];
  if (incompatibleCount > 0) summaryParts.push(`${ANSI.red}${incompatibleCount} incompatible${ANSI.reset}`);
  if (duplicateConflictCount > 0)
    summaryParts.push(`${ANSI.yellow}${duplicateConflictCount} source-conflict${ANSI.reset}`);
  if (summaryParts.length > 0)
    process.stdout.write(`\n${ANSI.dim}MCP transform:${ANSI.reset} ${summaryParts.join(', ')}\n`);

  return 0;
}
