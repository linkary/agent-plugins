import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { ensureCentralStore, getCentralSkillPath } from '../../core/skill-store.js';
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import { ensureDir, listDirNames, pathExists, removeDir } from '../../util/fs-utils.js';
import { copyDir } from '../../util/copy-dir.js';
import { promptMultiSelect } from '../../util/prompt.js';
import { detectSkillStatus, type SkillStatus } from '../../util/skill-compare.js';
import { isProbablyGitUrl, isGitHubShorthand, expandGitHubShorthand, guessNameFromGitUrl, runGit, isSkillDir } from '../../util/git-utils.js';
import { ANSI } from '../../util/ansi.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdSkillsAdd(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  let source = positionals[0];
  if (!source) {
    process.stderr.write('Usage: ap skills add <git-url|owner/repo|local-path> [--name <skill>] [--ref <ref>] [--force]\n');
    return 1;
  }

  await ensureCentralStore();

  const nameFlag = typeof flags.name === 'string' ? flags.name : undefined;
  const refFlag = typeof flags.ref === 'string' ? flags.ref : undefined;
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  // Expand GitHub shorthand to full URL
  if (isGitHubShorthand(source)) {
    source = expandGitHubShorthand(source);
    process.stdout.write(`Expanded to: ${source}\n`);
  }

  // Handle git URLs (including expanded GitHub shorthands)
  if (isProbablyGitUrl(source)) {
    // Clone to temp directory first
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apd-add-'));
    const cloneDest = path.join(tmpDir, 'repo');

    try {
      process.stdout.write(`Cloning ${source}...\n`);
      const code = await runGit(['clone', '--depth', '1', source, cloneDest], { cwd: undefined });
      if (code !== 0) {
        process.stderr.write('Git clone failed.\n');
        return code;
      }

      if (refFlag) {
        const checkout = await runGit(['-C', cloneDest, 'fetch', '--depth', '1', 'origin', refFlag], { cwd: undefined });
        if (checkout === 0) {
          await runGit(['-C', cloneDest, 'checkout', refFlag], { cwd: undefined });
        }
      }

      // Check if this is a single skill or a collection
      const isSingleSkill = await isSkillDir(cloneDest);
      let skillsToCopy: { name: string; srcDir: string }[] = [];

      if (isSingleSkill) {
        // Single skill repo
        const resolvedName = nameFlag ?? guessNameFromGitUrl(source);
        skillsToCopy = [{ name: resolvedName, srcDir: cloneDest }];
      } else {
        // Collection of skills - check ./skills directory first, then root subdirs
        let searchDir = cloneDest;
        const skillsSubdir = path.join(cloneDest, 'skills');
        if (await pathExists(skillsSubdir)) {
          const stat = await fs.stat(skillsSubdir);
          if (stat.isDirectory()) {
            searchDir = skillsSubdir;
            process.stdout.write('Found skills/ directory, searching inside...\n');
          }
        }

        const subdirs = await listDirNames(searchDir);
        const skillDirs: string[] = [];

        for (const sub of subdirs) {
          if (sub.startsWith('.')) continue;
          const subPath = path.join(searchDir, sub);
          if (await isSkillDir(subPath)) {
            skillDirs.push(sub);
          }
        }

        if (skillDirs.length === 0) {
          process.stderr.write('No skills found in repository (no SKILL.md files).\n');
          return 1;
        }

        // Check status for each skill using hash comparison
        type SkillInfo = { name: string; srcDir: string; status: SkillStatus };
        const skillsInfo: SkillInfo[] = await Promise.all(
          skillDirs.map(async (name) => {
            const srcDir = path.join(searchDir, name);
            const destDir = getCentralSkillPath(name);
            const { status } = await detectSkillStatus(srcDir, destDir);
            return { name, srcDir, status };
          }),
        );

        const newCount = skillsInfo.filter((s) => s.status === 'new').length;
        const updateCount = skillsInfo.filter((s) => s.status === 'update').length;
        const identicalCount = skillsInfo.filter((s) => s.status === 'identical').length;

        process.stdout.write(
          `\nFound ${skillsInfo.length} skill(s): ${ANSI.green}${newCount} new${ANSI.reset}, ${ANSI.yellow}${updateCount} update${ANSI.reset}, ${ANSI.dim}${identicalCount} identical${ANSI.reset}\n`,
        );

        if (interactive) {
          // Default: select new and update items, skip identical
          const defaultSelected = skillsInfo
            .filter((s) => s.status !== 'identical')
            .map((s) => s.name);

          const selected = await promptMultiSelect({
            message: 'Select skills to add:',
            options: skillsInfo.map((s) => {
              const statusLabel =
                s.status === 'new'
                  ? `${ANSI.green}new${ANSI.reset}`
                  : s.status === 'update'
                    ? `${ANSI.yellow}update${ANSI.reset}`
                    : `${ANSI.dim}identical${ANSI.reset}`;
              return { label: `${s.name} [${statusLabel}]`, value: s.name };
            }),
            defaultSelected,
          });

          if (selected.length === 0) {
            process.stdout.write('Cancelled.\n');
            return 0;
          }
          skillsToCopy = skillsInfo
            .filter((s) => selected.includes(s.name))
            .map((s) => ({ name: s.name, srcDir: s.srcDir }));
        } else {
          // Non-interactive: add only new and update skills by default (skip identical)
          const toAdd = force ? skillsInfo : skillsInfo.filter((s) => s.status !== 'identical');
          skillsToCopy = toAdd.map((s) => ({ name: s.name, srcDir: s.srcDir }));
        }
      }

      // Copy selected skills to central store
      const registry = await loadRegistry();
      const now = new Date().toISOString();

      for (const { name, srcDir } of skillsToCopy) {
        const dest = getCentralSkillPath(name);
        const destExists = await pathExists(dest);

        // In interactive mode, user explicitly selected this skill, so no warning needed
        // In non-interactive mode, we already filtered out replace items unless --force
        if (destExists && !force && !interactive) {
          process.stderr.write(`Skill already exists: ${name} (use --force to overwrite)\n`);
          continue;
        }

        if (dryRun) {
          process.stdout.write(`[dry-run] add ${name} -> ${dest}\n`);
          continue;
        }

        if (destExists) {
          await removeDir(dest);
        }

        await copyDir(srcDir, dest, { ignoreNames: ['.git'] });

        registry.skills[name] = {
          name,
          addedAt: registry.skills[name]?.addedAt ?? now,
          updatedAt: now,
          source: { type: 'git', url: source, ref: refFlag },
        };

        process.stdout.write(`Added: ${name}\n`);
      }

      // Save repo record for tracking
      if (!dryRun && skillsToCopy.length > 0) {
        const { normalizeRepoUrl } = await import('../../core/registry.js');
        const repoKey = normalizeRepoUrl(source);
        const existingRepo = registry.repos?.[repoKey];
        
        const addedSkillNames = skillsToCopy.map((s) => s.name);
        
        if (existingRepo) {
          // Merge skill lists (avoid duplicates)
          const merged = new Set([...existingRepo.skills, ...addedSkillNames]);
          existingRepo.skills = [...merged];
          existingRepo.updatedAt = now;
          if (refFlag) existingRepo.ref = refFlag;
        } else {
          registry.repos![repoKey] = {
            url: source,
            ref: refFlag,
            skills: addedSkillNames,
            addedAt: now,
            updatedAt: now,
          };
        }
        
        await saveRegistry(registry);
      }

      return 0;
    } finally {
      // Cleanup temp directory
      await removeDir(tmpDir);
    }
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

  const resolvedName = nameFlag ?? path.basename(source);
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

  if (destExists) {
    await removeDir(dest);
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

