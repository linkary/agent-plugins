import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { loadRegistry, saveRegistry, normalizeRepoUrl, type RepoRecord } from '../../core/registry.js';
import { getCentralSkillPath, listCentralSkills } from '../../core/skill-store.js';
import { ensureDir, listDirNames, pathExists, removeDir } from '../../util/fs-utils.js';
import { copyDir } from '../../util/copy-dir.js';
import { detectSkillStatus } from '../../util/skill-compare.js';
import { promptMultiSelect } from '../../util/prompt.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

async function runGit(args: string[], opts: { cwd?: string }): Promise<number> {
  return await new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: opts.cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function isSkillDir(dir: string): Promise<boolean> {
  return pathExists(path.join(dir, 'SKILL.md'));
}

export async function cmdSkillsUpdate(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const all = flags.all === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  const registry = await loadRegistry();

  // If specific skills provided, update just those
  if (positionals.length > 0) {
    return await updateSpecificSkills(positionals, registry, dryRun, force);
  }

  // Otherwise, update from all tracked repos
  const repos = registry.repos ?? {};
  const repoKeys = Object.keys(repos);

  if (repoKeys.length === 0) {
    process.stdout.write('(no repos tracked - use "ap skills add <repo>" to add skills from GitHub)\n');
    return 0;
  }

  // ANSI colors
  const green = '\x1b[32m';
  const yellow = '\x1b[33m';
  const dim = '\x1b[2m';
  const reset = '\x1b[0m';

  let totalUpdated = 0;

  for (const repoKey of repoKeys) {
    const repo = repos[repoKey]!;
    process.stdout.write(`\nChecking repo: ${repo.url}...\n`);

    // Clone to temp dir
    const tmpDir = path.join(os.tmpdir(), `apd-update-${Math.random().toString(36).slice(2, 8)}`);
    await ensureDir(tmpDir);
    const cloneDest = path.join(tmpDir, 'repo');

    try {
      const code = await runGit(['clone', '--depth', '1', repo.url, cloneDest], {});
      if (code !== 0) {
        process.stderr.write(`Failed to clone ${repo.url}\n`);
        continue;
      }

      if (repo.ref) {
        await runGit(['-C', cloneDest, 'fetch', '--depth', '1', 'origin', repo.ref], {});
        await runGit(['-C', cloneDest, 'checkout', repo.ref], {});
      }

      // Find skills directory
      let searchDir = cloneDest;
      const skillsSubdir = path.join(cloneDest, 'skills');
      if (await pathExists(skillsSubdir)) {
        const stat = await import('node:fs/promises').then(fs => fs.stat(skillsSubdir));
        if (stat.isDirectory()) {
          searchDir = skillsSubdir;
        }
      }

      // Check each tracked skill for updates
      const updatesAvailable: { name: string; srcDir: string }[] = [];

      for (const skillName of repo.skills) {
        const srcDir = path.join(searchDir, skillName);
        if (!(await pathExists(srcDir)) || !(await isSkillDir(srcDir))) {
          process.stderr.write(`Skill not found in repo: ${skillName}\n`);
          continue;
        }

        const destDir = getCentralSkillPath(skillName);
        const { status } = await detectSkillStatus(srcDir, destDir);

        if (status === 'update') {
          updatesAvailable.push({ name: skillName, srcDir });
        } else if (status === 'identical') {
          process.stdout.write(`${dim}Up-to-date: ${skillName}${reset}\n`);
        }
      }

      if (updatesAvailable.length === 0) {
        process.stdout.write('All skills up-to-date.\n');
        continue;
      }

      // Select which to update
      let toUpdate = updatesAvailable;
      if (interactive && !all) {
        process.stdout.write(`\n${yellow}${updatesAvailable.length} update(s) available${reset}\n`);
        const selected = await promptMultiSelect({
          message: 'Select skills to update:',
          options: updatesAvailable.map((s) => ({ label: s.name, value: s.name })),
          defaultSelected: 'all',
        });
        if (selected.length === 0) {
          process.stdout.write('Skipped.\n');
          continue;
        }
        toUpdate = updatesAvailable.filter((s) => selected.includes(s.name));
      }

      // Apply updates
      for (const { name, srcDir } of toUpdate) {
        const destDir = getCentralSkillPath(name);
        if (dryRun) {
          process.stdout.write(`[dry-run] update ${name}\n`);
          totalUpdated++;
          continue;
        }
        await removeDir(destDir);
        await copyDir(srcDir, destDir, { ignoreNames: ['.git'] });
        if (registry.skills[name]) {
          registry.skills[name]!.updatedAt = new Date().toISOString();
        }
        process.stdout.write(`${green}Updated: ${name}${reset}\n`);
        totalUpdated++;
      }

      repo.updatedAt = new Date().toISOString();
    } finally {
      await removeDir(tmpDir);
    }
  }

  if (!dryRun) await saveRegistry(registry);
  process.stdout.write(`\n${totalUpdated} skill(s) updated.\n`);
  return 0;
}

async function updateSpecificSkills(
  skillNames: string[],
  registry: Awaited<ReturnType<typeof loadRegistry>>,
  dryRun: boolean,
  force: boolean,
): Promise<number> {
  let updated = 0;

  for (const name of skillNames) {
    const record = registry.skills[name];
    const dest = getCentralSkillPath(name);

    if (!(await pathExists(dest))) {
      process.stderr.write(`Missing skill: ${name}\n`);
      continue;
    }

    if (!record) {
      process.stderr.write(`No registry entry for: ${name}\n`);
      continue;
    }

    if (record.source.type === 'local') {
      const srcPath = record.source.path;
      if (!(await pathExists(srcPath))) {
        process.stderr.write(`Local source missing: ${srcPath}\n`);
        continue;
      }
      if (!force) {
        process.stderr.write(`Use --force to overwrite local skill: ${name}\n`);
        continue;
      }
      if (dryRun) {
        process.stdout.write(`[dry-run] update ${name}\n`);
        updated++;
        continue;
      }
      await removeDir(dest);
      await copyDir(srcPath, dest, { ignoreNames: ['.git'] });
      record.updatedAt = new Date().toISOString();
      updated++;
      process.stdout.write(`Updated: ${name}\n`);
      continue;
    }

    if (record.source.type === 'git') {
      // Find which repo this skill belongs to
      const repoKey = normalizeRepoUrl(record.source.url);
      const repo = registry.repos?.[repoKey];
      if (!repo) {
        process.stderr.write(`Repo not tracked: ${record.source.url} (re-add with "ap skills add ${record.source.url}")\n`);
        continue;
      }
      process.stdout.write(`Run "ap skills update" without args to update from repos.\n`);
      continue;
    }

    process.stderr.write(`Cannot update collected skill: ${name}\n`);
  }

  if (!dryRun) await saveRegistry(registry);
  return updated > 0 ? 0 : 1;
}

