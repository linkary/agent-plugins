import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import { ensureCentralStore, getCentralSkillPath, listCentralSkills } from '../../core/skill-store.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { getAdapters, resolveAdapter } from '../../targets/adapters.js';
import { getHomeDir } from '../../util/apg-paths.js';
import { copyDir } from '../../util/copy-dir.js';
import { ensureDir, listDirNames, pathExists, removeDir } from '../../util/fs-utils.js';
import { computeDirHash } from '../../util/hash-dir.js';
import type { ParsedFlags } from '../../util/options.js';
import { promptChoice, promptMultiSelect, promptSelect } from '../../util/prompt.js';
import { findProjectRoot } from '../../util/project-root.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdSkillsCollect(_positionals: string[], _flags: ParsedFlags, _ctx: CliRunContext) {
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
      message: 'Select collect source:',
      options: adapters.map((a) => ({ label: a.label, value: a.id })),
    }).then((id) => adapters.find((a) => a.id === id) ?? null));

  if (!adapter) {
    process.stderr.write('No source selected.\n');
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
  const sourceSkillsDir = adapter.resolveSkillsDir({ scope, projectRoot, homeDir });

  const available = await listDirNames(sourceSkillsDir);
  if (available.length === 0) {
    process.stdout.write(`(no skills found in ${adapter.label} ${scope})\n`);
    return 0;
  }

  const allFlag = flags.all === true;
  const skillsToCollect =
    positionals.length > 0
      ? positionals
      : allFlag
        ? available
        : interactive
          ? await promptMultiSelect({
              message: `Select skills to collect from ${adapter.label} (${scope}):`,
              options: available.map((n) => ({ label: n, value: n })),
            })
          : [];

  if (skillsToCollect.length === 0) {
    process.stderr.write('No skills selected. Pass skill names, --all, or run interactively.\n');
    return 1;
  }

  await ensureCentralStore();
  const registry = await loadRegistry();
  const syncState = await loadSyncState();
  const contextId = makeContextId({ target: adapter.id, scope, projectRoot: scope === 'local' ? projectRoot : undefined });
  const context = syncState.contexts[contextId] ?? { skills: {} as Record<string, { hash: string; syncedAt: string }> };
  syncState.contexts[contextId] = context;

  const centralSkills = await listCentralSkills();

  let conflictMode: 'ask' | 'overwrite' | 'backup' | 'keep' | 'skip' = force ? 'overwrite' : 'ask';
  let changed = 0;

  for (const name of skillsToCollect) {
    const srcDir = path.join(sourceSkillsDir, name);
    if (!(await pathExists(srcDir))) {
      process.stderr.write(`Missing source skill: ${name}\n`);
      continue;
    }

    const srcHash = await computeDirHash(srcDir, { ignoreNames: ['.git'] });
    const destDir = getCentralSkillPath(name);
    const destExists = await pathExists(destDir);

    if (!destExists) {
      if (dryRun) {
        process.stdout.write(`[dry-run] collect ${name} -> ${destDir}\n`);
        changed++;
        continue;
      }
      await copyDir(srcDir, destDir, { ignoreNames: ['.git'] });
      const now = new Date().toISOString();
      registry.skills[name] = registry.skills[name] ?? {
        name,
        addedAt: now,
        updatedAt: now,
        source: { type: 'collected', from: { target: adapter.id, scope, path: srcDir } },
      };
      registry.skills[name]!.updatedAt = now;
      context.skills[name] = { hash: srcHash, syncedAt: now };
      process.stdout.write(`Collected: ${name}\n`);
      changed++;
      continue;
    }

    const destHash = await computeDirHash(destDir, { ignoreNames: ['.git'] });
    if (destHash === srcHash) {
      process.stdout.write(`Up-to-date: ${name}\n`);
      continue;
    }

    let mode = conflictMode;
    if (mode === 'ask') {
      if (!interactive) {
        process.stderr.write(`Conflict detected for ${name}. Re-run with --force or in an interactive terminal.\n`);
        return 1;
      }
      const choice = await promptChoice({
        message: `Conflict collecting ${name} into central store.`,
        options: [
          { key: 'o', label: 'Overwrite central' },
          { key: 'b', label: 'Backup central & overwrite' },
          { key: 'k', label: 'Keep both (rename incoming)' },
          { key: 's', label: 'Skip' },
          { key: 'O', label: 'Overwrite all' },
          { key: 'B', label: 'Backup all' },
          { key: 'K', label: 'Keep both all' },
          { key: 'S', label: 'Skip all' },
          { key: 'q', label: 'Quit' },
        ],
      });
      if (choice === 'q') return 1;
      if (choice === 'O') conflictMode = 'overwrite';
      if (choice === 'B') conflictMode = 'backup';
      if (choice === 'K') conflictMode = 'keep';
      if (choice === 'S') conflictMode = 'skip';
      mode =
        choice === 'o' || choice === 'O'
          ? 'overwrite'
          : choice === 'b' || choice === 'B'
            ? 'backup'
            : choice === 'k' || choice === 'K'
              ? 'keep'
              : 'skip';
    }

    if (mode === 'skip') {
      process.stdout.write(`Skipped: ${name}\n`);
      continue;
    }

    if (mode === 'keep') {
      const incomingName = await uniqueCentralName(`${name}-from-${adapter.id}-${timestampId()}`, centralSkills);
      const incomingDest = getCentralSkillPath(incomingName);
      if (dryRun) {
        process.stdout.write(`[dry-run] collect ${name} -> ${incomingDest}\n`);
        changed++;
        continue;
      }
      await copyDir(srcDir, incomingDest, { ignoreNames: ['.git'] });
      const now = new Date().toISOString();
      registry.skills[incomingName] = {
        name: incomingName,
        addedAt: now,
        updatedAt: now,
        source: { type: 'collected', from: { target: adapter.id, scope, path: srcDir } },
      };
      process.stdout.write(`Collected as: ${incomingName}\n`);
      changed++;
      centralSkills.push(incomingName);
      continue;
    }

    // overwrite or backup
    if (dryRun) {
      process.stdout.write(`[dry-run] ${mode} ${name} -> ${destDir}\n`);
      changed++;
      continue;
    }

    if (mode === 'backup') {
      const backupDir = getCentralSkillPath(`${name}.bak-${timestampId()}`);
      await ensureDir(path.dirname(backupDir));
      await fsRenameOrCopy(destDir, backupDir);
    } else {
      await removeDir(destDir);
    }

    await copyDir(srcDir, destDir, { ignoreNames: ['.git'] });
    const now = new Date().toISOString();
    registry.skills[name] = registry.skills[name] ?? {
      name,
      addedAt: now,
      updatedAt: now,
      source: { type: 'collected', from: { target: adapter.id, scope, path: srcDir } },
    };
    registry.skills[name]!.updatedAt = now;
    context.skills[name] = { hash: srcHash, syncedAt: now };
    process.stdout.write(`Collected: ${name}\n`);
    changed++;
  }

  if (!dryRun) {
    await saveRegistry(registry);
    await saveSyncState(syncState);
  }

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

async function uniqueCentralName(base: string, existing: string[]): Promise<string> {
  const set = new Set(existing);
  if (!set.has(base)) return base;
  const suffix = Math.random().toString(16).slice(2, 8);
  const next = `${base}-${suffix}`;
  if (!set.has(next)) return next;
  return `${base}-${Date.now()}`;
}

function timestampId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(
    d.getSeconds(),
  )}`;
}
