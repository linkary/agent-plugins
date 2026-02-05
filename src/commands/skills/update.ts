import { spawn } from 'node:child_process';
import { loadRegistry, saveRegistry, type SkillRecord } from '../../core/registry.js';
import { getCentralSkillPath, listCentralSkills } from '../../core/skill-store.js';
import { pathExists, removeDir } from '../../util/fs-utils.js';
import { copyDir } from '../../util/copy-dir.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

async function runGit(args: string[], opts: { cwd?: string }): Promise<number> {
  return await new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: opts.cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

export async function cmdSkillsUpdate(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const all = flags.all === true;

  const registry = await loadRegistry();
  const selected = all
    ? await listCentralSkills()
    : positionals.length > 0
      ? positionals
      : Object.keys(registry.skills).sort();

  if (selected.length === 0) {
    process.stdout.write('(no skills to update)\n');
    return 0;
  }

  let updated = 0;

  for (const name of selected) {
    const record: SkillRecord | undefined = registry.skills[name];
    const dest = getCentralSkillPath(name);
    if (!(await pathExists(dest))) {
      process.stderr.write(`Missing skill dir: ${name}\n`);
      continue;
    }
    if (!record) {
      process.stderr.write(`No registry entry for: ${name} (skipping)\n`);
      continue;
    }

    if (record.source.type === 'git') {
      if (dryRun) {
        process.stdout.write(`[dry-run] git update ${name} (${record.source.url})\n`);
        updated++;
        continue;
      }
      const fetch = await runGit(['-C', dest, 'fetch', '--all', '--tags'], {});
      if (fetch !== 0) return fetch;
      if (record.source.ref) {
        const checkout = await runGit(['-C', dest, 'checkout', record.source.ref], {});
        if (checkout !== 0) return checkout;
        const pull = await runGit(['-C', dest, 'pull', '--ff-only'], {});
        if (pull !== 0) return pull;
      } else {
        const pull = await runGit(['-C', dest, 'pull', '--ff-only'], {});
        if (pull !== 0) return pull;
      }
      record.updatedAt = new Date().toISOString();
      updated++;
      process.stdout.write(`Updated git skill: ${name}\n`);
      continue;
    }

    if (record.source.type === 'local') {
      const srcPath = record.source.path;
      if (!(await pathExists(srcPath))) {
        process.stderr.write(`Local source missing for ${name}: ${srcPath}\n`);
        continue;
      }
      if (dryRun) {
        process.stdout.write(`[dry-run] local update ${name} (${srcPath})\n`);
        updated++;
        continue;
      }
      if (!force) {
        process.stderr.write(`Refusing to overwrite local skill without --force: ${name}\n`);
        continue;
      }
      await removeDir(dest);
      await copyDir(srcPath, dest, { ignoreNames: ['.git'] });
      record.updatedAt = new Date().toISOString();
      updated++;
      process.stdout.write(`Updated local skill: ${name}\n`);
      continue;
    }

    process.stderr.write(`Skipping collected skill (no update source): ${name}\n`);
  }

  if (!dryRun) await saveRegistry(registry);
  return updated > 0 ? 0 : 1;
}
