/**
 * ap mcp sync — 将中央 MCP 服务器定义同步到目标工具配置文件。
 * 核心操作是 readConfig -> merge entry -> writeConfig。
 */
import fs from 'node:fs/promises';
import {
  listCentralMcpServers,
  readCentralMcpServer,
  computeMcpHash,
  computeMcpSerializedSize,
  getCentralMcpPath,
} from '../../core/mcp-store.js';
import { loadConfig } from '../../core/config.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { getAdapters, getColoredLabel, type Scope, type TargetAdapter } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { resolveTargetContext } from '../../util/scope.js';
import { readMcpServers, writeMcpServer } from '../../util/mcp-config-io.js';
import { promptMultiSelect } from '../../util/prompt.js';
import { createConflictResolver } from '../../util/sync-conflict.js';
import { classifySyncStatus, type SyncStatus } from '../../util/sync-status.js';
import { ANSI } from '../../util/ansi.js';
import { getCentralMcpDir } from '../../util/apg-paths.js';
import { filterMcpAdapters } from './manage-utils.js';
import { formatTargetReviewLine, formatTargetScopeLabel } from '../../util/review-display.js';
import {
  computeCanonicalMcpHash,
  parseMcpToCanonical,
  serializeCanonicalMcpForTarget,
} from '../../util/mcp-transform.js';
import {
  countByStatus,
  formatCountSummary,
  formatSyncPromptOption,
  formatScopeTitle,
  formatStatusLabel,
  groupEntriesByName,
  type SyncItemMetadata,
  type StatusStyle,
} from '../../util/sync-preview.js';
import type { McpConfigSpec, McpServerDef } from '../../core/mcp-types.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

type SyncEntry = {
  name: string;
  targetDef: McpServerDef;
  targetHash: string;
  /** Direction-independent canonical hash — the baseline space shared with collect. */
  canonicalHash: string;
  lossy: boolean;
  lossyReasons: string[];
  mcpSpec: McpConfigSpec;
  adapter: TargetAdapter;
  scope: Scope;
  projectRoot: string;
};

type EntryStatus = SyncStatus;
const ENTRY_STATUS_ORDER = ['new', 'replace', 'dest-ahead', 'conflict', 'same'] as const;
const ENTRY_STATUS_STYLES: StatusStyle<EntryStatus> = {
  new: { color: 'green' },
  replace: { color: 'yellow' },
  'dest-ahead': { color: 'red', label: 'target newer' },
  conflict: { color: 'red' },
  same: { color: 'dim' },
};

async function computeMcpMetadata(configPath: string, def: McpServerDef): Promise<SyncItemMetadata | null> {
  const stat = await fs.stat(configPath).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });
  if (!stat) return null;
  return {
    sizeBytes: computeMcpSerializedSize(def),
    changedAtMs: stat.mtimeMs,
  };
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
  const syncState = await loadSyncState();
  let incompatibleCount = 0;
  let lossyCount = 0;
  let skippedCount = 0;

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
      const parsed = parseMcpToCanonical(centralDef);
      if (!parsed.canonical) {
        incompatibleCount++;
        process.stderr.write(
          `${ANSI.yellow}Skipped ${name} for ${adapter.label}:${ANSI.reset} ${parsed.error ?? 'invalid central definition'}\n`,
        );
        continue;
      }
      const transformed = serializeCanonicalMcpForTarget(parsed.canonical, adapter.id);
      if (!transformed.def) {
        incompatibleCount++;
        process.stderr.write(
          `${ANSI.yellow}Skipped ${name} for ${adapter.label}:${ANSI.reset} ${transformed.incompatibleReason ?? 'incompatible definition'}\n`,
        );
        continue;
      }
      if (transformed.lossy) lossyCount++;

      allEntries.push({
        name,
        targetDef: transformed.def,
        targetHash: computeMcpHash(transformed.def),
        canonicalHash: computeCanonicalMcpHash(parsed.canonical),
        lossy: transformed.lossy,
        lossyReasons: transformed.lossyReasons,
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
  type EntryWithStatus = SyncEntry & {
    existingDef: McpServerDef | null;
    status: EntryStatus;
    sourceMeta?: SyncItemMetadata | null;
    targetMeta?: SyncItemMetadata | null;
  };
  const targetServersCache = new Map<string, Promise<Record<string, McpServerDef>>>();
  const getTargetServers = (spec: McpConfigSpec) => {
    let cached = targetServersCache.get(spec.configPath);
    if (!cached) {
      cached = readMcpServers(spec);
      targetServersCache.set(spec.configPath, cached);
    }
    return cached;
  };

  const sourceMetaCache = new Map<string, Promise<SyncItemMetadata | null>>();
  const getSourceMeta = (entry: SyncEntry) => {
    const cacheKey = `${entry.adapter.id}:${entry.name}`;
    let cached = sourceMetaCache.get(cacheKey);
    if (!cached) {
      cached = computeMcpMetadata(getCentralMcpPath(entry.name), entry.targetDef);
      sourceMetaCache.set(cacheKey, cached);
    }
    return cached;
  };
  const entriesWithStatus: EntryWithStatus[] = await Promise.all(
    allEntries.map(async (entry) => {
      const targetServers = await getTargetServers(entry.mcpSpec);
      const existingDef = targetServers[entry.name] ?? null;
      if (!existingDef) {
        return {
          ...entry,
          existingDef,
          status: 'new' as const,
          sourceMeta: await getSourceMeta(entry),
        };
      }
      const existingHash = computeMcpHash(existingDef);
      if (existingHash === entry.targetHash) {
        return { ...entry, existingDef, status: 'same' as const };
      }

      const contextId = makeContextId({
        target: entry.adapter.id,
        scope: entry.scope,
        projectRoot: entry.scope === 'local' ? entry.projectRoot : undefined,
      });
      const lastSync = syncState.contexts[contextId]?.mcp?.[entry.name];
      const parsedExisting = parseMcpToCanonical(existingDef);
      const canonicalExistingHash = parsedExisting.canonical
        ? computeCanonicalMcpHash(parsedExisting.canonical)
        : undefined;
      const status = classifySyncStatus({
        destExists: true,
        srcHash: entry.canonicalHash,
        destHash: canonicalExistingHash,
        baselineHash: lastSync?.hash,
      });

      return {
        ...entry,
        existingDef,
        status,
        sourceMeta: await getSourceMeta(entry),
        targetMeta: await computeMcpMetadata(entry.mcpSpec.configPath, existingDef),
      };
    }),
  );

  // Phase 3: 交互选择（按服务器名去重）
  let finalEntries: EntryWithStatus[];
  if (positionals.length > 0) {
    finalEntries = entriesWithStatus;
  } else if (interactive && !force) {
    const previewCounts = countByStatus(entriesWithStatus, ENTRY_STATUS_ORDER);
    process.stdout.write(`\nPreview: ${formatCountSummary(previewCounts, ENTRY_STATUS_ORDER, ENTRY_STATUS_STYLES)}\n`);
    if (entriesWithStatus.some((e) => e.status === 'dest-ahead')) {
      process.stdout.write(
        `${ANSI.dim}  ↳ "target newer": the target changed since last sync; syncing overwrites it. Use "ap mcp collect" to pull those edits instead.${ANSI.reset}\n`,
      );
    }

    const grouped = groupEntriesByName(entriesWithStatus);
    const groupedItems = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
    const selectedNames = await promptMultiSelect({
      message: `Confirm MCP servers to sync (${scopeTitle}, source: ${srcBaseDir}):`,
      options: groupedItems.map(([name, entries]) => {
        const promptOption = formatSyncPromptOption({
          name,
          entries: entries.map((entry) => ({
            targetLabel: formatTargetScopeLabel(getColoredLabel(entry.adapter), entry.scope),
            status: entry.status,
            sourceMeta: entry.sourceMeta,
            targetMeta: entry.targetMeta,
          })),
          orderedStatuses: ENTRY_STATUS_ORDER,
          styles: ENTRY_STATUS_STYLES,
          unchangedStatus: 'same',
        });
        return {
          label: promptOption.label,
          detailLines: promptOption.detailLines,
          value: name,
        };
      }),
      defaultSelected: groupedItems
        .filter(([, entries]) => entries.some((e) => e.status === 'replace'))
        .map(([name]) => name),
      sortDefaultSelectedToTop: true,
    });

    if (selectedNames.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
    const selectedNameSet = new Set(selectedNames);
    finalEntries = entriesWithStatus.filter((entry) => selectedNameSet.has(entry.name));
  } else {
    process.stdout.write(
      `\nSync ${entriesWithStatus.length} MCP server target(s) from ${srcBaseDir} (${scopeTitle}):\n`,
    );
    for (const s of entriesWithStatus) {
      process.stdout.write(
        `  ${formatTargetReviewLine(s.name, getColoredLabel(s.adapter), s.scope)} [${formatStatusLabel(s.status, ENTRY_STATUS_STYLES)}]\n`,
      );
    }
    finalEntries = entriesWithStatus;
  }

  // Phase 4: 执行同步
  const conflictResolver = createConflictResolver({ interactive, force, supportBackup: false });

  for (const entry of finalEntries) {
    const {
      name,
      targetDef,
      targetHash,
      canonicalHash,
      lossy,
      lossyReasons,
      mcpSpec,
      adapter,
      scope,
      projectRoot,
      existingDef,
    } = entry;

    const contextId = makeContextId({
      target: adapter.id,
      scope,
      projectRoot: scope === 'local' ? projectRoot : undefined,
    });
    const context = syncState.contexts[contextId] ?? { skills: {} };
    if (!context.mcp) context.mcp = {};
    syncState.contexts[contextId] = context;

    if (lossy && !force) {
      skippedCount++;
      process.stderr.write(
        `Skipped: ${name} -> ${getColoredLabel(adapter)} requires lossy conversion (${lossyReasons.join(', ')}) (use --force)\n`,
      );
      continue;
    }

    // 目标不存在该服务器 -> 直接写入
    if (!existingDef) {
      if (dryRun) {
        process.stdout.write(`[dry-run] add ${name} -> ${getColoredLabel(adapter)}\n`);
        continue;
      }
      await writeMcpServer(mcpSpec, name, targetDef);
      context.mcp[name] = { hash: canonicalHash, syncedAt: new Date().toISOString() };
      process.stdout.write(`Synced: ${name} -> ${getColoredLabel(adapter)}\n`);
      continue;
    }

    // 对比 hash（format 空间用于 same 短路；canonical 空间用于 baseline / 冲突判定）
    const existingHash = computeMcpHash(existingDef);
    if (existingHash === targetHash) {
      context.mcp[name] = { hash: canonicalHash, syncedAt: context.mcp[name]?.syncedAt ?? new Date().toISOString() };
      process.stdout.write(`Up-to-date: ${name} (${getColoredLabel(adapter)})\n`);
      continue;
    }

    // 冲突处理（在 canonical 空间比较 baseline，与 collect 保持一致）
    const lastSync = context.mcp[name];
    const parsedExisting = parseMcpToCanonical(existingDef);
    const canonicalExistingHash = parsedExisting.canonical
      ? computeCanonicalMcpHash(parsedExisting.canonical)
      : existingHash;
    const action = await conflictResolver.resolve(name, adapter, lastSync?.hash, canonicalExistingHash);
    if (action === 'quit') return 1;

    if (action === 'skip') {
      process.stdout.write(`Skipped: ${name}\n`);
      continue;
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] overwrite ${name} -> ${getColoredLabel(adapter)}\n`);
      continue;
    }

    await writeMcpServer(mcpSpec, name, targetDef);
    context.mcp[name] = { hash: canonicalHash, syncedAt: new Date().toISOString() };
    process.stdout.write(`Synced: ${name} -> ${getColoredLabel(adapter)}\n`);
  }

  if (!dryRun) await saveSyncState(syncState);
  const summaryParts: string[] = [];
  if (incompatibleCount > 0) summaryParts.push(`${ANSI.red}${incompatibleCount} incompatible${ANSI.reset}`);
  if (lossyCount > 0) summaryParts.push(`${ANSI.magenta}${lossyCount} lossy${ANSI.reset}`);
  if (skippedCount > 0) summaryParts.push(`${ANSI.gray}${skippedCount} skipped${ANSI.reset}`);
  if (summaryParts.length > 0)
    process.stdout.write(`\n${ANSI.dim}MCP transform:${ANSI.reset} ${summaryParts.join(', ')}\n`);

  return 0;
}
