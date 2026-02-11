import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';
import path from 'node:path';
import { listCentralSkills, getCentralSkillPath } from '../../core/skill-store.js';
import { ANSI } from '../../util/ansi.js';
import { ensureDir, pathExists, removeDir } from '../../util/fs-utils.js';
import { computeDirHash } from '../../util/hash-dir.js';
import { promptChoice, promptMultiSelect } from '../../util/prompt.js';
import { getAdapters, getColoredLabel, type Scope, type TargetAdapter } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { getCentralSkillsDir, getHomeDir } from '../../util/apg-paths.js';
import { resolveTargetContext } from '../../util/scope.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { loadConfig } from '../../core/config.js';
import { copyDir } from '../../util/copy-dir.js';
import { fsRenameOrCopy, timestampId } from '../../util/sync-utils.js';

type SyncEntry = {
  name: string;
  srcDir: string;
  destDir: string;
  adapter: TargetAdapter;
  scope: Scope;
  projectRoot: string;
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
  const homeDir = getHomeDir();

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

  // Phase 2: Show unified selection list
  let selectedEntries: SyncEntry[];
  if (positionals.length > 0) {
    selectedEntries = allEntries;
  } else if (interactive && !force) {
    const selectedKeys = await promptMultiSelect({
      message: 'Select skills to sync:',
      options: allEntries.map((s, i) => ({
        label: `${s.name} -> ${getColoredLabel(s.adapter)} (${s.scope})`,
        value: String(i),
      })),
      defaultSelected: [], // Don't select all by default
      searchable: true, // Enable real-time filter for large lists
    });
    if (selectedKeys.length === 0) {
      process.stdout.write('No skills selected.\n');
      return 0;
    }
    selectedEntries = selectedKeys.map((i) => allEntries[Number(i)]!);
  } else {
    selectedEntries = allEntries;
  }

  // Phase 3: Check overwrite status and show multi-select preview
  type EntryWithStatus = SyncEntry & { willOverwrite: boolean };
  const entriesWithStatus: EntryWithStatus[] = await Promise.all(
    selectedEntries.map(async (s) => ({
      ...s,
      // destDir 已包含 skill name，直接检查目标是否存在
      willOverwrite: await pathExists(s.destDir),
    })),
  );

  const srcBaseDir = getCentralSkillsDir();
  let finalEntries: EntryWithStatus[];

  if (interactive && !force) {
    const replaceCount = entriesWithStatus.filter((s) => s.willOverwrite).length;
    const newCount = entriesWithStatus.length - replaceCount;
    process.stdout.write(`\nPreview: ${ANSI.green}${newCount} new${ANSI.reset}, ${ANSI.yellow}${replaceCount} replace${ANSI.reset}\n`);

    // Default: select only 'new' items (exclude 'replace')
    const defaultSelected = entriesWithStatus
      .map((s, i) => (!s.willOverwrite ? String(i) : null))
      .filter((v): v is string => v !== null);

    const selectedKeys = await promptMultiSelect({
      message: `Confirm skills to sync (source: ${srcBaseDir}):`,
      options: entriesWithStatus.map((s, i) => {
        const status = s.willOverwrite ? `${ANSI.yellow}replace${ANSI.reset}` : `${ANSI.green}new${ANSI.reset}`;
        return {
          label: `${s.name} -> ${getColoredLabel(s.adapter)} (${s.scope}) [${status}]`,
          value: String(i),
        };
      }),
      defaultSelected,
    });

    if (selectedKeys.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
    finalEntries = selectedKeys.map((i) => entriesWithStatus[Number(i)]!);
  } else {
    // Non-interactive: show preview
    process.stdout.write(`\nSync ${entriesWithStatus.length} skill(s) from ${srcBaseDir}:\n`);
    for (const s of entriesWithStatus) {
      const status = s.willOverwrite ? `${ANSI.yellow}replace${ANSI.reset}` : `${ANSI.green}new${ANSI.reset}`;
      process.stdout.write(`  ${s.name} -> ${getColoredLabel(s.adapter)} (${s.scope}) [${status}]\n`);
    }
    finalEntries = entriesWithStatus;
  }

  const entriesToExecute = finalEntries;

  // Phase 4: Execute sync
  const syncState = await loadSyncState();
  let conflictMode: 'ask' | 'overwrite' | 'backup' | 'skip' = force ? 'overwrite' : 'ask';

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
      syncState.contexts[contextId] ?? ({ skills: {} as Record<string, { hash: string; syncedAt: string }> } as const);
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
    const isManagedClean = last?.hash === destHash;
    let mode = conflictMode;
    if (mode === 'ask' && isManagedClean) {
      mode = 'overwrite';
    }

    if (mode === 'ask') {
      if (!interactive) {
        process.stderr.write(`Conflict detected for ${name}. Re-run with --force or in an interactive terminal.\n`);
        return 1;
      }
      const choice = await promptChoice({
        message: `Conflict for ${name} in ${getColoredLabel(adapter)} (${scope}).`,
        options: [
          { key: 'o', label: 'Overwrite' },
          { key: 'b', label: 'Backup & overwrite' },
          { key: 's', label: 'Skip' },
          { key: 'O', label: 'Overwrite all' },
          { key: 'B', label: 'Backup all' },
          { key: 'S', label: 'Skip all' },
          { key: 'q', label: 'Quit' },
        ],
      });
      if (choice === 'q') return 1;
      if (choice === 'O') conflictMode = 'overwrite';
      if (choice === 'B') conflictMode = 'backup';
      if (choice === 'S') conflictMode = 'skip';
      mode = choice === 'o' || choice === 'O' ? 'overwrite' : choice === 'b' || choice === 'B' ? 'backup' : 'skip';
    }

    if (mode === 'skip') {
      process.stdout.write(`Skipped: ${name}\n`);
      continue;
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] ${mode} ${name} -> ${destDir}\n`);
      continue;
    }

    if (mode === 'backup') {
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
