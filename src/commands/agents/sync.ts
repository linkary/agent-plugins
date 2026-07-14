import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';
import path from 'node:path';
import { listCentralAgentItems, readCentralAgentSpec } from '../../core/agent-store.js';
import { ensureDir, pathExists } from '../../util/fs-utils.js';
import { promptMultiSelect } from '../../util/prompt.js';
import { createConflictResolver } from '../../util/sync-conflict.js';
import {
  filterAgentAdapters,
  getAdapters,
  getColoredLabel,
  type Scope,
  type TargetAdapter,
} from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { getCentralAgentsDir } from '../../util/apg-paths.js';
import { resolveTargetContext } from '../../util/scope.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { loadConfig } from '../../core/config.js';
import { computeItemHash, computeItemStats, removeItem } from '../../util/item-utils.js';
import { formatTargetReviewLine, formatTargetScopeLabel } from '../../util/review-display.js';
import { fsRenameOrCopy, timestampId } from '../../util/sync-utils.js';
import {
  countByStatus,
  formatCountSummary,
  formatSyncPromptOption,
  formatScopeTitle,
  formatStatusLabel,
  groupEntriesByName,
  type StatusStyle,
} from '../../util/sync-preview.js';
import {
  classifyFilesystemAgentPath,
  computeAgentHashForTarget,
  compareAgentEntries,
  resolveTargetAgentPaths,
  writeAgentToTarget,
} from '../../util/agent-transform.js';

type SyncEntry = {
  name: string;
  sourceEntry: Awaited<ReturnType<typeof classifyFilesystemAgentPath>> extends infer T
    ? T extends null
      ? never
      : T
    : never;
  destAgentsDir: string;
  destPath: string;
  adapter: TargetAdapter;
  scope: Scope;
  projectRoot: string;
  altDestPaths: string[];
};

type EntryStatus = 'new' | 'replace' | 'conflict' | 'same';
const ENTRY_STATUS_ORDER = ['new', 'replace', 'conflict', 'same'] as const;
const ENTRY_STATUS_STYLES: StatusStyle<EntryStatus> = {
  new: { color: 'green' },
  replace: { color: 'yellow' },
  conflict: { color: 'red' },
  same: { color: 'dim' },
};

async function resolveExistingPath(destPath: string, altDestPaths: string[]): Promise<string | null> {
  const candidates = [destPath, ...altDestPaths];
  const results = await Promise.all(candidates.map((candidate) => pathExists(candidate)));
  const existingIndex = results.findIndex(Boolean);
  if (existingIndex >= 0) return candidates[existingIndex]!;
  return null;
}

export async function cmdAgentsSync(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const scopeFlag = typeof flags.scope === 'string' ? flags.scope : undefined;
  const cwdFlag = typeof flags.cwd === 'string' ? flags.cwd : undefined;

  const adapters = filterAgentAdapters(getAdapters());
  const selectedAdapters = await selectTargetAdapters({
    adapters,
    flags,
    interactive,
    mode: 'multi',
    promptMessage: 'Select sync target(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const config = await loadConfig();
  const syncState = await loadSyncState();
  const availableAgentItems = await listCentralAgentItems();
  const availableAgentNames = availableAgentItems.map((agent) => agent.name);
  const availableAgentNamesSet = new Set(availableAgentNames);
  const availableAgentByName = new Map(availableAgentItems.map((agent) => [agent.name, agent]));
  if (availableAgentNames.length === 0) {
    process.stdout.write('(no agents to sync)\n');
    return 0;
  }

  const allEntries: SyncEntry[] = [];
  for (const adapter of selectedAdapters) {
    const targetConfig = config.targets[adapter.id];
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag,
      cwdFlag,
      defaultScope: targetConfig?.defaultScope,
      currentCwd: ctx.cwd,
    });
    const destAgentsDir = adapter.resolveAgentsDir({ scope, projectRoot, homeDir });

    const defaultAgents =
      targetConfig?.includeAgents && !targetConfig.includeAgents.includes('*')
        ? targetConfig.includeAgents.filter((name) => availableAgentNamesSet.has(name))
        : availableAgentNames;

    for (const name of defaultAgents) {
      if (name.startsWith('.') && !positionals.includes(name)) continue;
      if (positionals.length > 0 && !positionals.includes(name)) continue;
      const item = availableAgentByName.get(name);
      if (!item) continue;
      const sourceEntry = await classifyFilesystemAgentPath(item.path, name);
      if (!sourceEntry) continue;
      const { destPath, altDestPaths } = await resolveTargetAgentPaths(adapter, destAgentsDir, sourceEntry);

      allEntries.push({
        name,
        sourceEntry,
        destAgentsDir,
        destPath,
        altDestPaths,
        adapter,
        scope,
        projectRoot,
      });
    }
  }

  if (allEntries.length === 0) {
    process.stdout.write('No agents available to sync.\n');
    return 0;
  }
  const scopeTitle = formatScopeTitle(allEntries.map((entry) => entry.scope));
  const srcBaseDir = getCentralAgentsDir();

  type EntryWithStatus = SyncEntry & {
    status: EntryStatus;
    sourceMeta?: Awaited<ReturnType<typeof computeItemStats>>;
    targetMeta?: Awaited<ReturnType<typeof computeItemStats>>;
  };

  const sourceStatsCache = new Map<string, Promise<Awaited<ReturnType<typeof computeItemStats>>>>();
  const getSourceMeta = (srcPath: string) => {
    let cached = sourceStatsCache.get(srcPath);
    if (!cached) {
      cached = computeItemStats(srcPath);
      sourceStatsCache.set(srcPath, cached);
    }
    return cached;
  };

  const entriesWithStatus: EntryWithStatus[] = await Promise.all(
    allEntries.map(async (entry) => {
      const existingPath = await resolveExistingPath(entry.destPath, entry.altDestPaths);
      if (!existingPath) {
        return {
          ...entry,
          status: 'new' as const,
          sourceMeta: await getSourceMeta(entry.sourceEntry.path),
        };
      }

      const targetEntry = await classifyFilesystemAgentPath(existingPath, entry.name);
      const comparison =
        targetEntry ? await compareAgentEntries(entry.sourceEntry, targetEntry, entry.adapter) : 'different';
      if (comparison === 'same') return { ...entry, status: 'same' as const };

      const contextId = makeContextId({
        target: entry.adapter.id,
        scope: entry.scope,
        projectRoot: entry.scope === 'local' ? entry.projectRoot : undefined,
      });
      const lastSync = syncState.contexts[contextId]?.agents?.[entry.name];
      let status: EntryStatus = 'conflict';
      if (lastSync && targetEntry) {
        const currentTargetHash = await computeAgentHashForTarget(targetEntry, entry.adapter);
        if (currentTargetHash && lastSync.hash === currentTargetHash) status = 'replace';
      }

      const [sourceMeta, targetMeta] = await Promise.all([
        getSourceMeta(entry.sourceEntry.path),
        computeItemStats(existingPath),
      ]);
      return { ...entry, status, sourceMeta, targetMeta };
    }),
  );

  let finalEntries: EntryWithStatus[];
  if (positionals.length > 0) {
    finalEntries = entriesWithStatus;
  } else if (interactive && !force) {
    const previewCounts = countByStatus(entriesWithStatus, ENTRY_STATUS_ORDER);
    process.stdout.write(`\nPreview: ${formatCountSummary(previewCounts, ENTRY_STATUS_ORDER, ENTRY_STATUS_STYLES)}\n`);

    const grouped = groupEntriesByName(entriesWithStatus);
    const groupedItems = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
    const selectedNames = await promptMultiSelect({
      message: `Confirm agents to sync (${scopeTitle}, source: ${srcBaseDir}):`,
      options: groupedItems.map(([name, entries]) => {
        const promptOption = formatSyncPromptOption({
          name,
          entries: entries.map((item) => ({
            targetLabel: formatTargetScopeLabel(getColoredLabel(item.adapter), item.scope),
            status: item.status,
            sourceMeta: item.sourceMeta,
            targetMeta: item.targetMeta,
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
        .filter(([, entries]) => entries.some((item) => item.status === 'replace'))
        .map(([name]) => name),
      sortDefaultSelectedToTop: true,
      searchable: true,
    });

    if (selectedNames.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
    const selectedNameSet = new Set(selectedNames);
    finalEntries = entriesWithStatus.filter((entry) => selectedNameSet.has(entry.name));
  } else {
    process.stdout.write(`\nSync ${entriesWithStatus.length} agent(s) from ${srcBaseDir} (${scopeTitle}):\n`);
    for (const entry of entriesWithStatus) {
      const status = formatStatusLabel(entry.status, ENTRY_STATUS_STYLES);
      process.stdout.write(`  ${formatTargetReviewLine(entry.name, getColoredLabel(entry.adapter), entry.scope)} [${status}]\n`);
    }
    finalEntries = entriesWithStatus;
  }

  const conflictResolver = createConflictResolver({ interactive, force });

  if (!dryRun) {
    for (const dir of new Set(finalEntries.map((entry) => entry.destAgentsDir))) {
      await ensureDir(dir);
    }
  }

  for (const entry of finalEntries) {
    const { name, sourceEntry, destPath, altDestPaths, destAgentsDir, adapter, scope, projectRoot } = entry;
    if (!(await pathExists(sourceEntry.path))) {
      process.stderr.write(`Missing central agent: ${name}\n`);
      continue;
    }

    const sourceRead = await readCentralAgentSpec(name);
    if (!sourceRead) {
      process.stderr.write(`Unreadable central agent: ${name}\n`);
      continue;
    }
    const sourceHash = await computeAgentHashForTarget(sourceEntry, adapter);
    if (!sourceHash) {
      process.stderr.write(`Could not hash central agent: ${name}\n`);
      continue;
    }

    const contextId = makeContextId({
      target: adapter.id,
      scope,
      projectRoot: scope === 'local' ? projectRoot : undefined,
    });
    const context =
      syncState.contexts[contextId] ??
      ({ skills: {}, agents: {} as Record<string, { hash: string; syncedAt: string }> } as const);
    context.agents ??= {};
    syncState.contexts[contextId] = context;

    const existingPath = await resolveExistingPath(destPath, altDestPaths);
    if (!existingPath) {
      if (dryRun) {
        process.stdout.write(`[dry-run] write ${name} -> ${destPath}\n`);
        continue;
      }
      await writeAgentToTarget({
        adapter,
        spec: sourceRead.spec,
        sourceEntry,
        targetDir: destAgentsDir,
      });
      context.agents[name] = { hash: sourceHash, syncedAt: new Date().toISOString() };
      process.stdout.write(`Synced: ${name} -> ${getColoredLabel(adapter)}\n`);
      continue;
    }

    const existingEntry = await classifyFilesystemAgentPath(existingPath, name);
    const existingHash = existingEntry ? await computeAgentHashForTarget(existingEntry, adapter) : null;
    if (existingHash === sourceHash) {
      context.agents[name] = { hash: sourceHash, syncedAt: context.agents[name]?.syncedAt ?? new Date().toISOString() };
      process.stdout.write(`Up-to-date: ${name} (${getColoredLabel(adapter)})\n`);
      continue;
    }

    const fallbackHash = existingHash ?? (await computeItemHash(existingPath));
    const last = context.agents[name];
    const action = await conflictResolver.resolve(name, adapter, last?.hash, fallbackHash);
    if (action === 'quit') return 1;

    if (action === 'skip') {
      process.stdout.write(`Skipped: ${name}\n`);
      continue;
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] ${action} ${name} -> ${destPath}\n`);
      continue;
    }

    if (action === 'backup') {
      const baseName = path.basename(existingPath);
      const backupPath = path.join(path.dirname(existingPath), `${baseName}.bak-${timestampId()}`);
      await fsRenameOrCopy(existingPath, backupPath);
      await removeItem(existingPath);
    } else {
      await removeItem(existingPath);
    }

    await writeAgentToTarget({
      adapter,
      spec: sourceRead.spec,
      sourceEntry,
      targetDir: destAgentsDir,
    });
    context.agents[name] = { hash: sourceHash, syncedAt: new Date().toISOString() };
    process.stdout.write(`Synced: ${name} -> ${getColoredLabel(adapter)}\n`);
  }

  if (!dryRun) await saveSyncState(syncState);
  return 0;
}
