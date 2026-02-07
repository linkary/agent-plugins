import path from 'node:path';
import { loadConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry, normalizeRepoUrl, removeSkillFromRepo } from '../../core/registry.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { getCentralSkillPath } from '../../core/skill-store.js';
import { getHomeDir } from '../../util/apg-paths.js';
import { ensureDir, pathExists, removeDir } from '../../util/fs-utils.js';
import { getAdapters, resolveAdapter } from '../../targets/adapters.js';
import { findProjectRoot } from '../../util/project-root.js';
import { promptMultiSelect } from '../../util/prompt.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

function isGitHubShorthand(input: string): boolean {
  return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(input) && !input.includes(':');
}

function isProbablyGitUrl(input: string): boolean {
  return (
    input.startsWith('git@') ||
    input.startsWith('ssh://') ||
    input.startsWith('https://') ||
    input.startsWith('http://') ||
    input.endsWith('.git')
  );
}

export async function cmdSkillsRemove(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const args = positionals;
  if (args.length === 0) {
    process.stderr.write('Usage: ap skills rm <skill|repo>...\n');
    return 1;
  }

  const dryRun = flags['dry-run'] === true;
  const targetFlag = typeof flags.target === 'string' ? flags.target : undefined;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  const registry = await loadRegistry();
  let removed = 0;

  // Check if first arg looks like a repo (GitHub shorthand or git URL)
  const firstArg = args[0]!;
  const isRepo = isGitHubShorthand(firstArg) || isProbablyGitUrl(firstArg);

  if (isRepo && !targetFlag) {
    // Handle repo removal
    const repoUrl = isGitHubShorthand(firstArg) ? `https://github.com/${firstArg}` : firstArg;
    const repoKey = normalizeRepoUrl(repoUrl);
    const repoRecord = registry.repos?.[repoKey];

    if (!repoRecord) {
      process.stderr.write(`Repo not found in registry: ${firstArg}\n`);
      return 1;
    }

    const skills = repoRecord.skills;
    if (skills.length === 0) {
      process.stderr.write(`No skills found for repo: ${firstArg}\n`);
      delete registry.repos![repoKey];
      if (!dryRun) await saveRegistry(registry);
      return 0;
    }

    // Let user select which skills to remove
    let skillsToRemove: string[];
    if (interactive) {
      process.stdout.write(`\nRepo: ${repoRecord.url}\n`);
      process.stdout.write(`Skills from this repo: ${skills.length}\n`);

      skillsToRemove = await promptMultiSelect({
        message: 'Select skills to remove:',
        options: skills.map((s) => ({ label: s, value: s })),
        defaultSelected: 'all',
      });

      if (skillsToRemove.length === 0) {
        process.stdout.write('Cancelled.\n');
        return 0;
      }
    } else {
      skillsToRemove = skills;
    }

    // Remove selected skills
    for (const name of skillsToRemove) {
      const skillPath = getCentralSkillPath(name);
      if (!(await pathExists(skillPath))) {
        process.stderr.write(`Not found: ${name}\n`);
        continue;
      }
      if (dryRun) {
        process.stdout.write(`[dry-run] rm ${name} (${skillPath})\n`);
        removed++;
        continue;
      }
      await removeDir(skillPath);
      delete registry.skills[name];
      removed++;
      process.stdout.write(`Removed: ${name}\n`);
    }

    // Update repo record
    if (!dryRun) {
      const remaining = skills.filter((s) => !skillsToRemove.includes(s));
      if (remaining.length === 0) {
        delete registry.repos![repoKey];
        process.stdout.write(`Removed repo record: ${repoRecord.url}\n`);
      } else {
        repoRecord.skills = remaining;
      }
      await saveRegistry(registry);
    }

    return removed > 0 ? 0 : 1;
  }

  // Original logic for removing individual skills or from target
  const skills = args;

  // Remove from target skills directory
  if (targetFlag) {
    const adapters = getAdapters();
    const adapter = resolveAdapter(targetFlag);
    if (!adapter) {
      process.stderr.write(`Unknown target: ${targetFlag}\n`);
      process.stderr.write(`Known targets: ${adapters.map((a) => a.id).join(', ')}\n`);
      return 1;
    }

    const ctx = _ctx;
    const cwdFlag = typeof flags.cwd === 'string' ? flags.cwd : undefined;
    const startCwd = cwdFlag ? path.resolve(cwdFlag) : ctx.cwd;
    const config = await loadConfig();
    const targetConfig = config.targets[adapter.id];

    const scopeFlag = typeof flags.scope === 'string' ? flags.scope : undefined;
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

    if (!dryRun) await ensureDir(destSkillsDir);

    const syncState = await loadSyncState();
    const contextId = makeContextId({
      target: adapter.id,
      scope,
      projectRoot: scope === 'local' ? projectRoot : undefined,
    });
    const context = syncState.contexts[contextId];

    for (const name of skills) {
      const skillPath = path.join(destSkillsDir, name);
      if (!(await pathExists(skillPath))) {
        process.stderr.write(`Not found in target: ${name}\n`);
        continue;
      }
      if (dryRun) {
        process.stdout.write(`[dry-run] rm ${name} (${skillPath})\n`);
        removed++;
        continue;
      }
      await removeDir(skillPath);
      if (context?.skills) delete context.skills[name];
      removed++;
      process.stdout.write(`Removed from ${adapter.label} (${scope}): ${name}\n`);
    }

    if (!dryRun) await saveSyncState(syncState);
    return removed > 0 ? 0 : 1;
  }

  // Remove from central store
  for (const name of skills) {
    const skillPath = getCentralSkillPath(name);
    if (!(await pathExists(skillPath))) {
      process.stderr.write(`Not found: ${name}\n`);
      continue;
    }
    if (dryRun) {
      process.stdout.write(`[dry-run] rm ${name} (${skillPath})\n`);
      removed++;
      continue;
    }
    await removeDir(skillPath);
    delete registry.skills[name];
    
    // Cleanup repo record if this was the last skill from a repo
    const repoDeleted = removeSkillFromRepo(registry, name);
    if (repoDeleted) {
      process.stdout.write(`(Removed empty repo record)\n`);
    }
    
    removed++;
    process.stdout.write(`Removed: ${name}\n`);
  }

  if (!dryRun) await saveRegistry(registry);
  return removed > 0 ? 0 : 1;
}

