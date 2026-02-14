import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { loadRegistry, saveRegistry, normalizeRepoUrl } from '../../core/registry.js';
import { getCentralAgentPath } from '../../core/agent-store.js';
import { ensureDir, pathExists, removeDir } from '../../util/fs-utils.js';
import { copyDir } from '../../util/copy-dir.js';
import { detectSkillStatus } from '../../util/skill-compare.js';
import { promptMultiSelect } from '../../util/prompt.js';
import { runGit, isAgentDir } from '../../util/git-utils.js';
import { ANSI } from '../../util/ansi.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdAgentsUpdate(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const all = flags.all === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  const registry = await loadRegistry();
  registry.agents ??= {};
  registry.agentRepos ??= {};

  if (positionals.length > 0) {
    return await updateSpecificAgents(positionals, registry, dryRun, force);
  }

  const repos = registry.agentRepos;
  const repoKeys = Object.keys(repos);

  if (repoKeys.length === 0) {
    process.stdout.write('(no repos tracked - use "ap agents add <repo>" to add agents from GitHub)\n');
    return 0;
  }

  let totalUpdated = 0;
  const tempDirs: string[] = [];

  type PendingUpdate = {
    agentName: string;
    srcDir: string;
    repoKey: string;
    status: 'update' | 'identical' | 'missing';
    repoUrl: string;
  };

  const allUpdates: PendingUpdate[] = [];

  try {
    process.stdout.write(`Checking ${repoKeys.length} repo(s)...\n`);

    for (const repoKey of repoKeys) {
      const repo = repos[repoKey]!;

      const tmpDir = path.join(os.tmpdir(), `apd-update-agent-${Math.random().toString(36).slice(2, 8)}`);
      tempDirs.push(tmpDir);
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
      const agentsSubdir = path.join(cloneDest, 'agents');
      if (await pathExists(agentsSubdir)) {
        const stat = await fs.stat(agentsSubdir);
        if (stat.isDirectory()) searchDir = agentsSubdir;
      }

      for (const agentName of repo.skills) {
        const srcDir = path.join(searchDir, agentName);
        if (!(await pathExists(srcDir)) || !(await isAgentDir(srcDir))) {
          allUpdates.push({ agentName, srcDir, repoKey, status: 'missing', repoUrl: repo.url });
          continue;
        }

        const destDir = getCentralAgentPath(agentName);
        const { status } = await detectSkillStatus(srcDir, destDir);
        allUpdates.push({
          agentName,
          srcDir,
          repoKey,
          status: status === 'new' ? 'update' : (status as 'update' | 'identical'),
          repoUrl: repo.url,
        });
      }
    }

    const updatesAvailable = allUpdates.filter((u) => u.status === 'update');
    const identicalCount = allUpdates.filter((u) => u.status === 'identical').length;
    const missingCount = allUpdates.filter((u) => u.status === 'missing').length;

    process.stdout.write(
      `Found ${allUpdates.length} scanned: ${ANSI.yellow}${updatesAvailable.length} update${ANSI.reset}, ${ANSI.dim}${identicalCount} identical${ANSI.reset}` +
        (missingCount > 0 ? `, ${ANSI.red}${missingCount} missing${ANSI.reset}` : '') +
        '\n',
    );

    if (updatesAvailable.length === 0) {
      process.stdout.write('All agents up-to-date.\n');
      return 0;
    }

    let toUpdate: PendingUpdate[] = [];
    if (interactive && !all) {
      const selectedIndices = await promptMultiSelect({
        message: 'Select agents to update:',
        options: updatesAvailable.map((u, i) => ({
          label: `${u.agentName} (${ANSI.dim}${u.repoUrl}${ANSI.reset})`,
          value: String(i),
        })),
        defaultSelected: 'all',
      });
      if (selectedIndices.length === 0) {
        process.stdout.write('Skipped.\n');
        return 0;
      }
      toUpdate = selectedIndices.map((i) => updatesAvailable[Number(i)]!);
    } else {
      toUpdate = updatesAvailable;
    }

    const affectedRepos = new Set<string>();

    for (const update of toUpdate) {
      const { agentName, srcDir, repoKey } = update;
      const destDir = getCentralAgentPath(agentName);

      if (dryRun) {
        process.stdout.write(`[dry-run] update ${agentName}\n`);
        totalUpdated++;
        continue;
      }

      await removeDir(destDir);
      await copyDir(srcDir, destDir, { ignoreNames: ['.git'] });

      if (registry.agents[agentName]) registry.agents[agentName]!.updatedAt = new Date().toISOString();
      affectedRepos.add(repoKey);
      process.stdout.write(`${ANSI.green}Updated: ${agentName}${ANSI.reset}\n`);
      totalUpdated++;
    }

    for (const key of affectedRepos) {
      if (registry.agentRepos[key]) registry.agentRepos[key]!.updatedAt = new Date().toISOString();
    }
  } finally {
    for (const dir of tempDirs) await removeDir(dir);
  }

  if (!dryRun && totalUpdated > 0) await saveRegistry(registry);
  process.stdout.write(`\n${totalUpdated} agent(s) updated.\n`);
  return 0;
}

async function updateSpecificAgents(
  agentNames: string[],
  registry: Awaited<ReturnType<typeof loadRegistry>>,
  dryRun: boolean,
  force: boolean,
): Promise<number> {
  let updated = 0;
  registry.agents ??= {};
  registry.agentRepos ??= {};

  for (const name of agentNames) {
    const record = registry.agents[name];
    const dest = getCentralAgentPath(name);

    if (!(await pathExists(dest))) {
      process.stderr.write(`Missing agent: ${name}\n`);
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
        process.stderr.write(`Use --force to overwrite local agent: ${name}\n`);
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
      const repoKey = normalizeRepoUrl(record.source.url);
      const repo = registry.agentRepos[repoKey];
      if (!repo) {
        process.stderr.write(`Repo not tracked: ${record.source.url} (re-add with "ap agents add ${record.source.url}")\n`);
        continue;
      }
      process.stdout.write('Run "ap agents update" without args to update from repos.\n');
      continue;
    }

    process.stderr.write(`Cannot update collected agent: ${name}\n`);
  }

  if (!dryRun) await saveRegistry(registry);
  return updated > 0 ? 0 : 1;
}
