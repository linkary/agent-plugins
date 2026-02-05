import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';
import path from 'node:path';
import { listCentralSkills, getCentralSkillPath } from '../../core/skill-store.js';
import fs from 'node:fs/promises';
import { ensureDir, pathExists, removeDir } from '../../util/fs-utils.js';
import { computeDirHash } from '../../util/hash-dir.js';
import { findProjectRoot } from '../../util/project-root.js';
import { promptSelect, promptChoice } from '../../util/prompt.js';
import { getAdapters, resolveAdapter } from '../../targets/adapters.js';
import { getHomeDir } from '../../util/apg-paths.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { loadConfig } from '../../core/config.js';
import { copyDir } from '../../util/copy-dir.js';

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
  const targetFlag = typeof flags.target === 'string' ? flags.target : undefined;
  if (!targetFlag && !interactive) {
    process.stderr.write('Missing --target and no TTY available for interactive selection.\n');
    return 1;
  }
  const adapter =
    (targetFlag ? resolveAdapter(targetFlag) : null) ??
    (await promptSelect({
      message: 'Select sync target:',
      options: adapters.map((a) => ({ label: a.label, value: a.id })),
    }).then((id) => adapters.find((a) => a.id === id) ?? null));

  if (!adapter) {
    process.stderr.write('No target selected.\n');
    return 1;
  }

  const config = await loadConfig();
  const targetConfig = config.targets[adapter.id];
  const scope: 'local' | 'global' =
    scopeFlag === 'global'
      ? 'global'
      : scopeFlag === 'local'
        ? 'local'
        : targetConfig?.defaultScope === 'global'
          ? 'global'
          : 'local';

  const homeDir = getHomeDir();
  const projectRoot = scope === 'local' ? await findProjectRoot(startCwd) : startCwd;
  const destSkillsDir = adapter.resolveSkillsDir({ scope, projectRoot, homeDir });

  const availableSkills = await listCentralSkills();
  const skillsToSync =
    positionals.length > 0
      ? positionals
      : targetConfig?.include && !targetConfig.include.includes('*')
        ? targetConfig.include.filter((s) => availableSkills.includes(s))
        : availableSkills;

  if (skillsToSync.length === 0) {
    process.stdout.write('(no skills to sync)\n');
    return 0;
  }

  if (!dryRun) await ensureDir(destSkillsDir);

  const syncState = await loadSyncState();
  const contextId = makeContextId({ target: adapter.id, scope, projectRoot: scope === 'local' ? projectRoot : undefined });
  const context = syncState.contexts[contextId] ?? { skills: {} as Record<string, { hash: string; syncedAt: string }> };
  syncState.contexts[contextId] = context;

  let conflictMode: 'ask' | 'overwrite' | 'backup' | 'skip' = force ? 'overwrite' : 'ask';

  let changed = 0;
  for (const name of skillsToSync) {
    const srcDir = getCentralSkillPath(name);
    if (!(await pathExists(srcDir))) {
      process.stderr.write(`Missing central skill: ${name}\n`);
      continue;
    }

    const destDir = path.join(destSkillsDir, name);
    const srcHash = await computeDirHash(srcDir, { ignoreNames: ['.git'] });
    const destExists = await pathExists(destDir);
    if (!destExists) {
      if (dryRun) {
        process.stdout.write(`[dry-run] copy ${name} -> ${destDir}\n`);
        changed++;
        continue;
      }
      await ensureDir(destSkillsDir);
      await copyDir(srcDir, destDir, { ignoreNames: ['.git'] });
      context.skills[name] = { hash: srcHash, syncedAt: new Date().toISOString() };
      process.stdout.write(`Synced: ${name}\n`);
      changed++;
      continue;
    }

    const destHash = await computeDirHash(destDir, { ignoreNames: ['.git'] });
    if (destHash === srcHash) {
      // already up to date
      context.skills[name] = { hash: srcHash, syncedAt: context.skills[name]?.syncedAt ?? new Date().toISOString() };
      process.stdout.write(`Up-to-date: ${name}\n`);
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
      changed++;
      continue;
    }

    if (mode === 'backup') {
      const backupDir = path.join(destSkillsDir, `${name}.bak-${timestampId()}`);
      await ensureDir(destSkillsDir);
      await fsRenameOrCopy(destDir, backupDir);
    } else {
      await removeDir(destDir);
    }

    await copyDir(srcDir, destDir, { ignoreNames: ['.git'] });
    context.skills[name] = { hash: srcHash, syncedAt: new Date().toISOString() };
    process.stdout.write(`Synced: ${name}\n`);
    changed++;
  }

  if (!dryRun) await saveSyncState(syncState);

  return 0;
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
