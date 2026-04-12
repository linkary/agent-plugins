import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';
import path from 'node:path';
import { listCentralSkills, getCentralSkillPath } from '../../core/skill-store.js';
import { ANSI } from '../../util/ansi.js';
import { ensureDir, pathExists, removeDir } from '../../util/fs-utils.js';
import { computeDirHash } from '../../util/hash-dir.js';
import { promptMultiSelect } from '../../util/prompt.js';
import { createConflictResolver } from '../../util/sync-conflict.js';
import { getAdapters, getColoredLabel, type Scope, type TargetAdapter } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { getCentralSkillsDir } from '../../util/apg-paths.js';
import { resolveTargetContext } from '../../util/scope.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { loadConfig } from '../../core/config.js';
import { copyDir } from '../../util/copy-dir.js';
import { computeItemStats } from '../../util/item-utils.js';
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

type SyncEntry = {
  name: string;
  srcDir: string;
  destDir: string;
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

export async function cmdSkillsSync(_positionals: string[], _flags: ParsedFlags, _ctx: CliRunContext) {
  const positionals = _positionals;
  const flags = _flags;
  const ctx = _ctx;

  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const scopeFlag = typeof flags.scope === 'string' ? flags.scope : undefined;

  const cwdFlag = typeof flags.cwd === 'string' ? flags.cwd : undefined;

  const adapters = getAdapters();
  const selectedAdapters = await selectTargetAdapters({
    adapters,
    flags,
    interactive,
    mode: 'multi',
    promptMessage: 'Select sync target(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const config = await loadConfig();

  const availableSkills = await listCentralSkills();
  if (availableSkills.length === 0) {
    process.stdout.write('(no skills to sync)\n');
    return 0;
  }

  // Phase 1: Gather all sync entries (skill + target combinations)
  const allEntries: SyncEntry[] = [];
  for (const adapter of selectedAdapters) {
    const targetConfig = config.targets[adapter.id];
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag,
      cwdFlag,
      defaultScope: targetConfig?.defaultScope,
      currentCwd: ctx.cwd,
    });
    const destSkillsDir = adapter.resolveSkillsDir({ scope, projectRoot, homeDir });

    // Determine which skills to sync for this target
    const defaultSkills =
      targetConfig?.include && !targetConfig.include.includes('*')
        ? targetConfig.include.filter((s) => availableSkills.includes(s))
        : availableSkills;

    for (const name of defaultSkills) {
      // Skip hidden skills (starting with .) unless explicitly specified
      if (name.startsWith('.') && !positionals.includes(name)) continue;
      // Filter by positionals if provided
      if (positionals.length > 0 && !positionals.includes(name)) continue;

      allEntries.push({
        name,
        srcDir: getCentralSkillPath(name),
        destDir: path.join(destSkillsDir, name),
        adapter: adapter,
        scope,
        projectRoot,
      });
    }
  }

  if (allEntries.length === 0) {
    process.stdout.write('No skills available to sync.\n');
    return 0;
  }
  const scopeTitle = formatScopeTitle(allEntries.map((entry) => entry.scope));

  // Phase 2: Check overwrite status and show multi-select preview
  type EntryWithStatus = SyncEntry & {
    status: EntryStatus;
    sourceMeta?: Awaited<ReturnType<typeof computeItemStats>>;
    targetMeta?: Awaited<ReturnType<typeof computeItemStats>>;
  };
  const sourceStatsCache = new Map<string, Promise<Awaited<ReturnType<typeof computeItemStats>>>>();
  const getSourceMeta = (srcDir: string) => {
    let cached = sourceStatsCache.get(srcDir);
    if (!cached) {
      cached = computeItemStats(srcDir, { ignoreNames: ['.git'] });
      sourceStatsCache.set(srcDir, cached);
    }
    return cached;
  };
  const entriesWithStatus: EntryWithStatus[] = await Promise.all(
    allEntries.map(async (s) => {
      const destExists = await pathExists(s.destDir);
      if (!destExists) {
        return {
          ...s,
          status: 'new' as const,
          sourceMeta: await getSourceMeta(s.srcDir),
        };
      }
      const [srcHash, destHash] = await Promise.all([
        computeDirHash(s.srcDir, { ignoreNames: ['.git'] }),
        computeDirHash(s.destDir, { ignoreNames: ['.git'] }),
      ]);
      if (destHash === srcHash) return { ...s, status: 'same' as const };
      const [sourceMeta, targetMeta] = await Promise.all([
        getSourceMeta(s.srcDir),
        computeItemStats(s.destDir, { ignoreNames: ['.git'] }),
      ]);
      return { ...s, status: 'replace' as const, sourceMeta, targetMeta };
    }),
  );

  const srcBaseDir = getCentralSkillsDir();
  let finalEntries: EntryWithStatus[];

  if (positionals.length > 0) {
    finalEntries = entriesWithStatus;
  } else if (interactive && !force) {
    const previewCounts = countByStatus(entriesWithStatus, ENTRY_STATUS_ORDER);
    process.stdout.write(`\nPreview: ${formatCountSummary(previewCounts, ENTRY_STATUS_ORDER, ENTRY_STATUS_STYLES)}\n`);

    const grouped = groupEntriesByName(entriesWithStatus);
    const groupedItems = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
    const selectedNames = await promptMultiSelect({
      message: `Confirm skills to sync (${scopeTitle}, source: ${srcBaseDir}):`,
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
      searchable: true,
    });

    if (selectedNames.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
    const selectedNameSet = new Set(selectedNames);
    finalEntries = entriesWithStatus.filter((entry) => selectedNameSet.has(entry.name));
  } else {
    // Non-interactive: show preview
    process.stdout.write(`\nSync ${entriesWithStatus.length} skill(s) from ${srcBaseDir} (${scopeTitle}):\n`);
    for (const s of entriesWithStatus) {
      const status = formatStatusLabel(s.status, ENTRY_STATUS_STYLES);
      process.stdout.write(`  ${formatTargetReviewLine(s.name, getColoredLabel(s.adapter), s.scope)} [${status}]\n`);
    }
    finalEntries = entriesWithStatus;
  }

  const entriesToExecute = finalEntries;

  // Phase 4: Execute sync
  const syncState = await loadSyncState();
  const conflictResolver = createConflictResolver({ interactive, force });

  // Ensure all destination directories exist
  const destDirs = new Set(entriesToExecute.map((e) => path.dirname(e.destDir)));
  if (!dryRun) {
    for (const dir of destDirs) {
      await ensureDir(dir);
    }
  }

  for (const entry of entriesToExecute) {
    const { name, srcDir, destDir, adapter, scope, projectRoot } = entry;

    if (!(await pathExists(srcDir))) {
      process.stderr.write(`Missing central skill: ${name}\n`);
      continue;
    }

    const contextId = makeContextId({
      target: adapter.id,
      scope,
      projectRoot: scope === 'local' ? projectRoot : undefined,
    });
    const context =
      syncState.contexts[contextId] ?? ({ skills: {} as Record<string, { hash: string; syncedAt: string }> });
    if (!context.skills) context.skills = {};
    syncState.contexts[contextId] = context;

    const srcHash = await computeDirHash(srcDir, { ignoreNames: ['.git'] });
    const destExists = await pathExists(destDir);

    if (!destExists) {
      if (dryRun) {
        process.stdout.write(`[dry-run] copy ${name} -> ${destDir}\n`);
        continue;
      }
      await copyDir(srcDir, destDir, { ignoreNames: ['.git'] });
      context.skills[name] = { hash: srcHash, syncedAt: new Date().toISOString() };
      process.stdout.write(`Synced: ${name} -> ${getColoredLabel(adapter)}\n`);
      continue;
    }

    const destHash = await computeDirHash(destDir, { ignoreNames: ['.git'] });
    if (destHash === srcHash) {
      context.skills[name] = { hash: srcHash, syncedAt: context.skills[name]?.syncedAt ?? new Date().toISOString() };
      process.stdout.write(`Up-to-date: ${name} (${getColoredLabel(adapter)})\n`);
      continue;
    }

    const last = context.skills[name];
    const action = await conflictResolver.resolve(name, adapter, last?.hash, destHash);
    if (action === 'quit') return 1;

    if (action === 'skip') {
      process.stdout.write(`Skipped: ${name}\n`);
      continue;
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] ${action} ${name} -> ${destDir}\n`);
      continue;
    }

    if (action === 'backup') {
      const backupDir = path.join(path.dirname(destDir), `${name}.bak-${timestampId()}`);
      await fsRenameOrCopy(destDir, backupDir);
    } else {
      await removeDir(destDir);
    }

    await copyDir(srcDir, destDir, { ignoreNames: ['.git'] });
    context.skills[name] = { hash: srcHash, syncedAt: new Date().toISOString() };
    process.stdout.write(`Synced: ${name} -> ${getColoredLabel(adapter)}\n`);
  }

  if (!dryRun) await saveSyncState(syncState);

  return 0;
}
