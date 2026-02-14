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
import { getCentralSkillsDir } from '../../util/apg-paths.js';
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
  type EntryWithStatus = SyncEntry & { status: EntryStatus };
  const entriesWithStatus: EntryWithStatus[] = await Promise.all(
    allEntries.map(async (s) => {
      const destExists = await pathExists(s.destDir);
      if (!destExists) {
        return { ...s, status: 'new' as const };
      }
      const [srcHash, destHash] = await Promise.all([
        computeDirHash(s.srcDir, { ignoreNames: ['.git'] }),
        computeDirHash(s.destDir, { ignoreNames: ['.git'] }),
      ]);
      return { ...s, status: destHash === srcHash ? ('same' as const) : ('replace' as const) };
    }),
  );

  const srcBaseDir = getCentralSkillsDir();
  let finalEntries: EntryWithStatus[];

  if (positionals.length > 0) {
    finalEntries = entriesWithStatus;
  } else if (interactive && !force) {
    const replaceCount = entriesWithStatus.filter((s) => s.status === 'replace').length;
    const newCount = entriesWithStatus.filter((s) => s.status === 'new').length;
    const sameCount = entriesWithStatus.filter((s) => s.status === 'same').length;
    process.stdout.write(`\nPreview: ${formatCountSummary({ newCount, replaceCount, sameCount })}\n`);

    const grouped = groupEntriesByName(entriesWithStatus);
    const groupedItems = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
    const defaultSelected = groupedItems
      .filter(([, entries]) => entries.some((entry) => entry.status === 'new'))
      .map(([name]) => name);

    const selectedNames = await promptMultiSelect({
      message: `Confirm skills to sync (${scopeTitle}, source: ${srcBaseDir}):`,
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
      const status = formatStatusLabel(s.status);
      process.stdout.write(`  ${s.name} -> ${getColoredLabel(s.adapter)} [${status}]\n`);
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
        message: `Conflict for ${name} in ${getColoredLabel(adapter)}.`,
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
