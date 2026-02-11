import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { loadRegistry, saveRegistry, normalizeRepoUrl } from '../../core/registry.js';
import { getCentralSkillPath } from '../../core/skill-store.js';
import { ensureDir, pathExists, removeDir } from '../../util/fs-utils.js';
import { copyDir } from '../../util/copy-dir.js';
import { detectSkillStatus } from '../../util/skill-compare.js';
import { promptMultiSelect } from '../../util/prompt.js';
import { runGit, isSkillDir } from '../../util/git-utils.js';
import { ANSI } from '../../util/ansi.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

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

  let totalUpdated = 0;
  const tempDirs: string[] = [];

  type PendingUpdate = {
    skillName: string;
    srcDir: string;
    repoKey: string;
    status: 'update' | 'identical' | 'missing';
    repoUrl: string;
  };

  const allUpdates: PendingUpdate[] = [];

  try {
    process.stdout.write(`Checking ${repoKeys.length} repo(s)...\n`);

    // Serial processing to avoid network/disk contention (can be parallelized if needed)
    for (const repoKey of repoKeys) {
      const repo = repos[repoKey]!;
      // process.stdout.write(`  Checking ${repo.url}...\n`);

      const tmpDir = path.join(os.tmpdir(), `apd-update-${Math.random().toString(36).slice(2, 8)}`);
      tempDirs.push(tmpDir); // Track for cleanup
      await ensureDir(tmpDir);
      const cloneDest = path.join(tmpDir, 'repo');

      const code = await runGit(['clone', '--depth', '1', repo.url, cloneDest], { stdio: 'ignore' });
      if (code !== 0) {
        process.stderr.write(`${ANSI.red}Failed to clone ${repo.url}${ANSI.reset}\n`);
        continue;
      }

      if (repo.ref) {
        await runGit(['-C', cloneDest, 'fetch', '--depth', '1', 'origin', repo.ref], { stdio: 'ignore' });
        await runGit(['-C', cloneDest, 'checkout', repo.ref], { stdio: 'ignore' });
      }

      let searchDir = cloneDest;
      const skillsSubdir = path.join(cloneDest, 'skills');
      if (await pathExists(skillsSubdir)) {
        const stat = await fs.stat(skillsSubdir);
        if (stat.isDirectory()) {
          searchDir = skillsSubdir;
        }
      }

      for (const skillName of repo.skills) {
        const srcDir = path.join(searchDir, skillName);
        if (!(await pathExists(srcDir)) || !(await isSkillDir(srcDir))) {
          allUpdates.push({ skillName, srcDir, repoKey, status: 'missing', repoUrl: repo.url });
          continue;
        }

        const destDir = getCentralSkillPath(skillName);
        const { status } = await detectSkillStatus(srcDir, destDir);
        allUpdates.push({
          skillName,
          srcDir,
          repoKey,
          status: status === 'new' ? 'update' : status as 'update' | 'identical',
          repoUrl: repo.url,
        });
      }
    }

    // Filter updates
    const updatesAvailable = allUpdates.filter((u) => u.status === 'update');
    const identicalCount = allUpdates.filter((u) => u.status === 'identical').length;
    const missingCount = allUpdates.filter((u) => u.status === 'missing').length;

    process.stdout.write(
      `Found ${allUpdates.length} scanned: ${ANSI.yellow}${updatesAvailable.length} update${ANSI.reset}, ${ANSI.dim}${identicalCount} identical${ANSI.reset}` +
        (missingCount > 0 ? `, ${ANSI.red}${missingCount} missing${ANSI.reset}` : '') +
        '\n',
    );

    if (updatesAvailable.length === 0) {
      process.stdout.write('All skills up-to-date.\n');
      return 0;
    }

    let toUpdate: PendingUpdate[] = [];
    if (interactive && !all) {
      const selectedIndices = await promptMultiSelect({
        message: 'Select skills to update:',
        options: updatesAvailable.map((u, i) => ({
          label: `${u.skillName} (${ANSI.dim}${u.repoUrl}${ANSI.reset})`,
          value: String(i),
        })),
        defaultSelected: 'all',
      });

      if (selectedIndices.length === 0) {
        process.stdout.write('Skipped.\n');
        return 0;
      }
      toUpdate = selectedIndices.map(i => updatesAvailable[Number(i)]!);
    } else {
      toUpdate = updatesAvailable;
    }

    // Execute updates
    const affectedRepos = new Set<string>();
    
    for (const update of toUpdate) {
      const { skillName, srcDir, repoKey } = update;
      const destDir = getCentralSkillPath(skillName);
      
      if (dryRun) {
        process.stdout.write(`[dry-run] update ${skillName}\n`);
        totalUpdated++;
        continue;
      }

      await removeDir(destDir);
      await copyDir(srcDir, destDir, { ignoreNames: ['.git'] });
      
      if (registry.skills[skillName]) {
        registry.skills[skillName]!.updatedAt = new Date().toISOString();
      }
      
      affectedRepos.add(repoKey);
      process.stdout.write(`${ANSI.green}Updated: ${skillName}${ANSI.reset}\n`);
      totalUpdated++;
    }

    // Update timestamps for repos that had updates (or maybe all scanned repos?)
    // Traditionally we update timestamp if we successfully checked it.
    // But logic before was: if we updated a skill, we update repo timestamp.
    // Let's stick to updating timestamp if we successfully synced.
    
    // Actually, if we CHECKED and it was identical, we should also probably update the repo timestamp to show we checked.
    // But let's follow the previous logic roughly: update if we changed something.
    for (const key of affectedRepos) {
      if (registry.repos?.[key]) {
        registry.repos[key]!.updatedAt = new Date().toISOString();
      }
    }

  } finally {
    // Cleanup all temp dirs
    for (const dir of tempDirs) {
      await removeDir(dir);
    }
  }

  if (!dryRun && totalUpdated > 0) await saveRegistry(registry);
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

