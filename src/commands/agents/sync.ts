import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';
import path from 'node:path';
import { listCentralAgentItems, type CentralAgentItem } from '../../core/agent-store.js';
import { ANSI } from '../../util/ansi.js';
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
import { computeItemHash, copyItem, removeItem } from '../../util/item-utils.js';
import { fsRenameOrCopy, timestampId } from '../../util/sync-utils.js';
import {
  countByStatus,
  formatCountSummary,
  formatScopeTitle,
  formatStatusLabel,
  groupEntriesByName,
  type StatusStyle,
} from '../../util/sync-preview.js';

type SyncEntry = {
  name: string;
  srcPath: string;
  destPath: string;
  altDestPath: string;
  adapter: TargetAdapter;
  scope: Scope;
  projectRoot: string;
};

type EntryStatus = 'new' | 'replace' | 'same';
const ENTRY_STATUS_ORDER = ['new', 'replace', 'same'] as const;
const ENTRY_STATUS_STYLES: StatusStyle<EntryStatus> = {
  new: { color: 'green' },
  replace: { color: 'yellow' },
  same: { color: 'dim' },
};

async function resolveExistingPath(destPath: string, altDestPath: string): Promise<string | null> {
  const [destExists, altExists] = await Promise.all([pathExists(destPath), pathExists(altDestPath)]);
  if (destExists) return destPath;
  if (altExists) return altDestPath;
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
  const availableAgentItems = await listCentralAgentItems();
  const availableAgentNames = availableAgentItems.map((agent) => agent.name);
  const availableAgentNamesSet = new Set(availableAgentNames);
  const availableAgentByName = new Map<string, CentralAgentItem>(availableAgentItems.map((agent) => [agent.name, agent]));
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
      const destPath =
        item.form === 'directory' ? path.join(destAgentsDir, name) : path.join(destAgentsDir, `${name}.md`);
      const altDestPath =
        item.form === 'directory' ? path.join(destAgentsDir, `${name}.md`) : path.join(destAgentsDir, name);

      allEntries.push({
        name,
        srcPath: item.path,
        destPath,
        altDestPath,
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

  type EntryWithStatus = SyncEntry & { status: EntryStatus };
  const entriesWithStatus: EntryWithStatus[] = await Promise.all(
    allEntries.map(async (s) => {
      const existingPath = await resolveExistingPath(s.destPath, s.altDestPath);
      if (!existingPath) return { ...s, status: 'new' as const };
      const srcHash = await computeItemHash(s.srcPath);
      const existingHash = await computeItemHash(existingPath);
      return { ...s, status: existingHash === srcHash ? ('same' as const) : ('replace' as const) };
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
        const status = formatCountSummary(
          countByStatus(entries, ENTRY_STATUS_ORDER),
          ENTRY_STATUS_ORDER,
          ENTRY_STATUS_STYLES,
        );
        return {
          label: `${name} -> ${entries
            .map((entry) => `${getColoredLabel(entry.adapter)} (${formatStatusLabel(entry.status, ENTRY_STATUS_STYLES)})`)
            .join(', ')} [${status}]`,
          value: name,
        };
      }),
      defaultSelected: groupedItems
        .filter(([, entries]) => entries.some((e) => e.status === 'replace'))
        .map(([name]) => name),
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
    for (const s of entriesWithStatus) {
      const status = formatStatusLabel(s.status, ENTRY_STATUS_STYLES);
      process.stdout.write(`  ${s.name} -> ${getColoredLabel(s.adapter)} [${status}]\n`);
    }
    finalEntries = entriesWithStatus;
  }

  const syncState = await loadSyncState();
  const conflictResolver = createConflictResolver({ interactive, force });

  const destDirs = new Set(finalEntries.map((e) => path.dirname(e.destPath)));
  if (!dryRun) {
    for (const dir of destDirs) await ensureDir(dir);
  }

  for (const entry of finalEntries) {
    const { name, srcPath, destPath, altDestPath, adapter, scope, projectRoot } = entry;
    if (!(await pathExists(srcPath))) {
      process.stderr.write(`Missing central agent: ${name}\n`);
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

    const srcHash = await computeItemHash(srcPath);
    const existingPath = await resolveExistingPath(destPath, altDestPath);

    if (!existingPath) {
      if (dryRun) {
        process.stdout.write(`[dry-run] copy ${name} -> ${destPath}\n`);
        continue;
      }
      await copyItem(srcPath, destPath);
      context.agents[name] = { hash: srcHash, syncedAt: new Date().toISOString() };
      process.stdout.write(`Synced: ${name} -> ${getColoredLabel(adapter)}\n`);
      continue;
    }

    const destHash = await computeItemHash(existingPath);
    if (destHash === srcHash) {
      context.agents[name] = { hash: srcHash, syncedAt: context.agents[name]?.syncedAt ?? new Date().toISOString() };
      process.stdout.write(`Up-to-date: ${name} (${getColoredLabel(adapter)})\n`);
      continue;
    }

    const last = context.agents[name];
    const action = await conflictResolver.resolve(name, adapter, last?.hash, destHash);
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
    } else {
      await removeItem(existingPath);
    }

    if (existingPath !== destPath && (await pathExists(destPath))) {
      await removeItem(destPath);
    }
    await copyItem(srcPath, destPath);
    context.agents[name] = { hash: srcHash, syncedAt: new Date().toISOString() };
    process.stdout.write(`Synced: ${name} -> ${getColoredLabel(adapter)}\n`);
  }

  if (!dryRun) await saveSyncState(syncState);
  return 0;
}
