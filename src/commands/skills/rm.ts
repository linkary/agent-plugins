import path from 'node:path';
import { loadConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { getCentralSkillPath } from '../../core/skill-store.js';
import { getHomeDir } from '../../util/apg-paths.js';
import { ensureDir, pathExists, removeDir } from '../../util/fs-utils.js';
import { getAdapters, resolveAdapter } from '../../targets/adapters.js';
import { findProjectRoot } from '../../util/project-root.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdSkillsRemove(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const skills = positionals;
  if (skills.length === 0) {
    process.stderr.write('Usage: apg skills rm <skill>...\n');
    return 1;
  }

  const dryRun = flags['dry-run'] === true;
  const targetFlag = typeof flags.target === 'string' ? flags.target : undefined;

  const registry = await loadRegistry();
  let removed = 0;

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
    removed++;
    process.stdout.write(`Removed: ${name}\n`);
  }

  if (!dryRun) await saveRegistry(registry);
  return removed > 0 ? 0 : 1;
}
