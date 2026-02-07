import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';
import path from 'node:path';
import { listCentralSkills, getCentralSkillPath } from '../../core/skill-store.js';
import fs from 'node:fs/promises';
import { ensureDir, pathExists, removeDir } from '../../util/fs-utils.js';
import { computeDirHash } from '../../util/hash-dir.js';
import { findProjectRoot } from '../../util/project-root.js';
import { promptChoice, promptConfirm, promptMultiSelect } from '../../util/prompt.js';
import { getAdapters, type Scope } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { getCentralSkillsDir, getHomeDir } from '../../util/apg-paths.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { loadConfig } from '../../core/config.js';
import { copyDir } from '../../util/copy-dir.js';

type SyncEntry = {
  name: string;
  srcDir: string;
  destDir: string;
  adapter: { id: string; label: string };
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
  const startCwd = cwdFlag ? path.resolve(cwdFlag) : ctx.cwd;

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
    const scope = resolveScope(scopeFlag, targetConfig?.defaultScope);
    const projectRoot = scope === 'local' ? await findProjectRoot(startCwd) : startCwd;
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
        adapter: { id: adapter.id, label: adapter.label },
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
        label: `${s.name} -> ${s.adapter.label} (${s.scope})`,
        value: String(i),
      })),
      defaultSelected: 'all',
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
      willOverwrite: await pathExists(s.destDir),
    })),
  );

  // ANSI color codes
  const yellow = '\x1b[33m';
  const green = '\x1b[32m';
  const cyan = '\x1b[36m';
  const reset = '\x1b[0m';

  const srcBaseDir = getCentralSkillsDir();
  let finalEntries: EntryWithStatus[];

  if (interactive && !force) {
    const replaceCount = entriesWithStatus.filter((s) => s.willOverwrite).length;
    const newCount = entriesWithStatus.length - replaceCount;
    process.stdout.write(
      `\nPreview: ${green}${newCount} new${reset}, ${yellow}${replaceCount} replace${reset}\n`,
    );

    // Default: select only 'new' items (exclude 'replace')
    const defaultSelected = entriesWithStatus
      .map((s, i) => (!s.willOverwrite ? String(i) : null))
      .filter((v): v is string => v !== null);

    const selectedKeys = await promptMultiSelect({
      message: `Confirm skills to sync (source: ${srcBaseDir}):`,
      options: entriesWithStatus.map((s, i) => {
        const status = s.willOverwrite ? `${yellow}replace${reset}` : `${green}new${reset}`;
        return {
          label: `${s.name} -> ${s.adapter.label} (${s.scope}) [${status}]`,
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
      const status = s.willOverwrite ? `${yellow}replace${reset}` : `${green}new${reset}`;
      process.stdout.write(`  ${s.name} -> ${s.adapter.label} (${s.scope}) [${status}]\n`);
    }
    finalEntries = entriesWithStatus;
  }

  const entriesToExecute = finalEntries;

  // Phase 5: Execute sync
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
      process.stdout.write(`Synced: ${name} -> ${adapter.label}\n`);
      continue;
    }

    const destHash = await computeDirHash(destDir, { ignoreNames: ['.git'] });
    if (destHash === srcHash) {
      context.skills[name] = { hash: srcHash, syncedAt: context.skills[name]?.syncedAt ?? new Date().toISOString() };
      process.stdout.write(`Up-to-date: ${name} (${adapter.label})\n`);
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
        message: `Conflict for ${name} in ${adapter.label} (${scope}).`,
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
      mode =
        choice === 'o' || choice === 'O'
          ? 'overwrite'
          : choice === 'b' || choice === 'B'
            ? 'backup'
            : 'skip';
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
    process.stdout.write(`Synced: ${name} -> ${adapter.label}\n`);
  }

  if (!dryRun) await saveSyncState(syncState);

  return 0;
}

function resolveScope(scopeFlag: string | undefined, defaultScope: Scope | undefined): Scope {
  if (scopeFlag === 'global') return 'global';
  if (scopeFlag === 'local') return 'local';
  return defaultScope === 'global' ? 'global' : 'local';
}

async function fsRenameOrCopy(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest);
  } catch {
    await copyDir(src, dest, { ignoreNames: ['.git'] });
    await removeDir(src);
  }
}

function timestampId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(
    d.getSeconds(),
  )}`;
}
