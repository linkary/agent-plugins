import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import { ensureCentralStore, getCentralSkillPath } from '../../core/skill-store.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { type Scope, getAdapters } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { getCentralSkillsDir, getHomeDir } from '../../util/apg-paths.js';
import { copyDir } from '../../util/copy-dir.js';
import { ensureDir, listDirNames, pathExists, removeDir } from '../../util/fs-utils.js';
import { computeDirHash } from '../../util/hash-dir.js';
import type { ParsedFlags } from '../../util/options.js';
import { promptChoice, promptConfirm, promptMultiSelect } from '../../util/prompt.js';
import { findProjectRoot } from '../../util/project-root.js';
import type { CliRunContext } from '../../runner/cli.js';

type SkillEntry = {
  name: string;
  srcDir: string;
  destDir: string;
  adapter: { id: string; label: string };
  scope: Scope;
  projectRoot: string;
};

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
  const selectedAdapters = await selectTargetAdapters({
    adapters,
    flags,
    interactive,
    mode: 'multi',
    promptMessage: 'Select collect source(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const config = await loadConfig();
  const homeDir = getHomeDir();

  // Phase 1: Gather all available skills from all selected targets
  const allSkills: SkillEntry[] = [];
  for (const adapter of selectedAdapters) {
    const targetConfig = config.targets[adapter.id];
    const scope = resolveScope(scopeFlag, targetConfig?.defaultScope);
    const projectRoot = scope === 'local' ? await findProjectRoot(startCwd) : startCwd;
    const sourceSkillsDir = adapter.resolveSkillsDir({ scope, projectRoot, homeDir });

    const available = await listDirNames(sourceSkillsDir);
    if (available.length === 0) {
      process.stdout.write(`(no skills found in ${adapter.label} ${scope})\n`);
      continue;
    }

    for (const name of available) {
      // Skip hidden skills (starting with .) unless explicitly specified
      if (name.startsWith('.') && !positionals.includes(name)) continue;
      // Filter by positionals if provided
      if (positionals.length > 0 && !positionals.includes(name)) continue;

      allSkills.push({
        name,
        srcDir: path.join(sourceSkillsDir, name),
        destDir: getCentralSkillPath(name),
        adapter: { id: adapter.id, label: adapter.label },
        scope,
        projectRoot,
      });
    }
  }

  if (allSkills.length === 0) {
    process.stdout.write('No skills available to collect.\n');
    return 0;
  }

  // Phase 2: Show unified selection list (all skills from all targets)
  let selectedSkills: SkillEntry[];
  if (positionals.length > 0) {
    // Positionals already filtered above
    selectedSkills = allSkills;
  } else if (interactive && !force) {
    const selectedKeys = await promptMultiSelect({
      message: 'Select skills to collect:',
      options: allSkills.map((s, i) => ({
        label: `${s.name} (${s.adapter.label})`,
        value: String(i),
      })),
      defaultSelected: 'all',
    });
    if (selectedKeys.length === 0) {
      process.stdout.write('No skills selected.\n');
      return 0;
    }
    selectedSkills = selectedKeys.map((i) => allSkills[Number(i)]!);
  } else {
    selectedSkills = allSkills;
  }

  // Phase 3: Show unified preview
  const destBaseDir = getCentralSkillsDir();
  process.stdout.write(`\nCollect ${selectedSkills.length} skill(s):\n`);
  for (const s of selectedSkills) {
    process.stdout.write(`  ${s.name} (${s.adapter.label}): ${s.srcDir} -> ${destBaseDir}/${s.name}\n`);
  }

  // Phase 4: Unified confirmation
  if (!dryRun && !force && interactive) {
    const confirmed = await promptConfirm({ message: 'Proceed with collection?', default: true });
    if (!confirmed) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
  }

  // Phase 5: Execute collection
  if (!dryRun) await ensureCentralStore();

  const registry = await loadRegistry();
  const syncState = await loadSyncState();
  const centralSkills = await listDirNames(getCentralSkillsDir());

  let conflictMode: 'ask' | 'overwrite' | 'backup' | 'keep' | 'skip' = force ? 'overwrite' : 'ask';

  for (const skill of selectedSkills) {
    const { name, srcDir, destDir, adapter, scope, projectRoot } = skill;

    if (!(await pathExists(srcDir))) {
      process.stderr.write(`Missing source skill: ${name}\n`);
      continue;
    }

    const contextId = makeContextId({
      target: adapter.id,
      scope,
      projectRoot: scope === 'local' ? projectRoot : undefined,
    });
    const context = syncState.contexts[contextId] ?? { skills: {} as Record<string, { hash: string; syncedAt: string }> };
    syncState.contexts[contextId] = context;

    const srcHash = await computeDirHash(srcDir, { ignoreNames: ['.git'] });
    const destExists = await pathExists(destDir);

    if (!destExists) {
      if (dryRun) {
        process.stdout.write(`[dry-run] collect ${name} -> ${destDir}\n`);
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
      centralSkills.push(name);
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
      centralSkills.push(incomingName);
      continue;
    }

    // overwrite or backup
    if (dryRun) {
      process.stdout.write(`[dry-run] ${mode} ${name} -> ${destDir}\n`);
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
  }

  if (!dryRun) {
    await saveRegistry(registry);
    await saveSyncState(syncState);
  }

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
