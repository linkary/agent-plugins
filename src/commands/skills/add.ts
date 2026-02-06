import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { ensureCentralStore, getCentralSkillPath } from '../../core/skill-store.js';
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import { pathExists, removeDir } from '../../util/fs-utils.js';
import { copyDir } from '../../util/copy-dir.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

function isProbablyGitUrl(input: string): boolean {
  return (
    input.startsWith('git@') ||
    input.startsWith('ssh://') ||
    input.startsWith('https://') ||
    input.startsWith('http://') ||
    input.endsWith('.git')
  );
}

function guessNameFromGitUrl(url: string): string {
  const last = url.replace(/\/+$/, '').split(/[/:]/).pop() ?? 'skill';
  return last.endsWith('.git') ? last.slice(0, -4) : last;
}

async function runGit(args: string[], opts: { cwd?: string }): Promise<number> {
  return await new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: opts.cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

export async function cmdSkillsAdd(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const source = positionals[0];
  if (!source) {
    process.stderr.write('Usage: ap skills add <git-url|local-path> [--name <skill>] [--ref <ref>] [--force]\n');
    return 1;
  }

  await ensureCentralStore();

  const nameFlag = typeof flags.name === 'string' ? flags.name : undefined;
  const refFlag = typeof flags.ref === 'string' ? flags.ref : undefined;
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;

  const resolvedName = nameFlag ?? (isProbablyGitUrl(source) ? guessNameFromGitUrl(source) : path.basename(source));
  const dest = getCentralSkillPath(resolvedName);

  const destExists = await pathExists(dest);
  if (destExists && !force) {
    process.stderr.write(`Skill already exists: ${resolvedName}\nUse --force to overwrite.\n`);
    return 1;
  }

  if (dryRun) {
    process.stdout.write(`[dry-run] add ${resolvedName} -> ${dest}\n`);
    return 0;
  }

  if (destExists && force) {
    await removeDir(dest);
  }

  if (isProbablyGitUrl(source)) {
    const code = await runGit(['clone', source, dest], { cwd: undefined });
    if (code !== 0) return code;
    if (refFlag) {
      const checkout = await runGit(['-C', dest, 'checkout', refFlag], { cwd: undefined });
      if (checkout !== 0) return checkout;
    }

    const registry = await loadRegistry();
    const now = new Date().toISOString();
    registry.skills[resolvedName] = {
      name: resolvedName,
      addedAt: registry.skills[resolvedName]?.addedAt ?? now,
      updatedAt: now,
      source: { type: 'git', url: source, ref: refFlag },
    };
    await saveRegistry(registry);

    process.stdout.write(`Added git skill: ${resolvedName}\n`);
    return 0;
  }

  // Local directory
  const srcPath = path.resolve(source);
  if (!(await pathExists(srcPath))) {
    process.stderr.write(`Source path not found: ${srcPath}\n`);
    return 1;
  }
  const stat = await fs.stat(srcPath);
  if (!stat.isDirectory()) {
    process.stderr.write(`Source must be a directory: ${srcPath}\n`);
    return 1;
  }

  await copyDir(srcPath, dest, { ignoreNames: ['.git'] });

  const registry = await loadRegistry();
  const now = new Date().toISOString();
  registry.skills[resolvedName] = {
    name: resolvedName,
    addedAt: registry.skills[resolvedName]?.addedAt ?? now,
    updatedAt: now,
    source: { type: 'local', path: srcPath },
  };
  await saveRegistry(registry);

  process.stdout.write(`Added local skill: ${resolvedName}\n`);
  return 0;
}
