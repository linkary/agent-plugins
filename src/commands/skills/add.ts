import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { ensureCentralStore, getCentralSkillPath } from '../../core/skill-store.js';
import { loadRegistry, saveRegistry, type RegistryFileV1, type SkillSource } from '../../core/registry.js';
import { listDirNames, pathExists, removeDir } from '../../util/fs-utils.js';
import { copyDir } from '../../util/copy-dir.js';
import { promptChoice, promptMultiSelect } from '../../util/prompt.js';
import { detectSkillStatus, type SkillStatus } from '../../util/skill-compare.js';
import {
  isProbablyGitUrl,
  isGitHubShorthand,
  expandGitHubShorthand,
  guessNameFromGitUrl,
  runGit,
  isSkillDir,
} from '../../util/git-utils.js';
import { ANSI } from '../../util/ansi.js';
import {
  classifySourceConflict,
  removeGitSourceTracking,
  sourceLabel,
  suggestAliasName,
  uniqueAliasName,
} from '../../util/source-conflict.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

type SkillCandidate = { name: string; srcDir: string };

/**
 * Resolve the set of skills to add from a root directory (a cloned repo or a local path).
 * - If the root itself is a skill (has SKILL.md), returns a single candidate named
 *   `nameFlag ?? fallbackName`.
 * - Otherwise treats the root as a collection: prefers a `skills/` subdir, keeps only
 *   subdirs that are skills, prints a status summary, and (interactively) lets the user
 *   multi-select; non-interactively selects new + update (or all with `--force`).
 *
 * Return contract:
 * - `null`  → no skills found anywhere (caller should exit 1)
 * - `[]`    → nothing to do / user cancelled (caller should exit 0)
 * - `[...]` → candidates to copy
 */
async function resolveSkillSources(
  rootDir: string,
  opts: { nameFlag?: string; fallbackName: string; interactive: boolean; force: boolean },
): Promise<SkillCandidate[] | null> {
  // Single skill directory
  if (await isSkillDir(rootDir)) {
    return [{ name: opts.nameFlag ?? opts.fallbackName, srcDir: rootDir }];
  }

  // Collection of skills — check ./skills directory first, then root subdirs
  let searchDir = rootDir;
  const skillsSubdir = path.join(rootDir, 'skills');
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
    process.stderr.write('No skills found (no SKILL.md files).\n');
    return null;
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

  if (opts.interactive) {
    // Default: select new and update items, skip identical
    const defaultSelected = skillsInfo.filter((s) => s.status !== 'identical').map((s) => s.name);

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
      return [];
    }
    return skillsInfo.filter((s) => selected.includes(s.name)).map((s) => ({ name: s.name, srcDir: s.srcDir }));
  }

  // Non-interactive: add only new and update skills by default (skip identical)
  const toAdd = opts.force ? skillsInfo : skillsInfo.filter((s) => s.status !== 'identical');
  return toAdd.map((s) => ({ name: s.name, srcDir: s.srcDir }));
}

/**
 * Copy resolved skill candidates into the central store, mutating `registry` in place and
 * returning the names actually added. Handles same-/different-source conflicts (skip / replace /
 * alias), `--force`, and `--dry-run`. The caller owns persistence (`saveRegistry`) so it can add
 * any extra bookkeeping (e.g. repo records) before saving.
 */
async function copySkillCandidates(
  candidates: SkillCandidate[],
  incomingSource: SkillSource,
  opts: { registry: RegistryFileV1; interactive: boolean; force: boolean; dryRun: boolean },
): Promise<string[]> {
  const { registry, interactive, force, dryRun } = opts;
  const now = new Date().toISOString();
  const addedSkillNames: string[] = [];

  for (const { name, srcDir } of candidates) {
    let targetName = name;
    let dest = getCentralSkillPath(targetName);
    const existingRecord = registry.skills[targetName];
    const contentStatus = (await detectSkillStatus(srcDir, dest)).status;
    const conflictStatus = classifySourceConflict({
      existingSource: existingRecord?.source,
      incomingSource,
      contentStatus,
    });

    if (conflictStatus === 'different-source conflict' && !force) {
      if (interactive) {
        const action = await promptChoice({
          message: `Skill "${targetName}" already exists from ${sourceLabel(existingRecord?.source)}. Incoming source: ${sourceLabel(incomingSource)}.`,
          options: [
            { key: 's', label: 'Skip' },
            { key: 'r', label: 'Replace existing' },
            { key: 'a', label: `Install as alias (${suggestAliasName(targetName, incomingSource)})` },
          ],
        });
        if (action === 's') {
          process.stdout.write(`Skipped: ${targetName}\n`);
          continue;
        }
        if (action === 'a') {
          targetName = await uniqueAliasName(suggestAliasName(targetName, incomingSource), async (candidate) =>
            pathExists(getCentralSkillPath(candidate)),
          );
          dest = getCentralSkillPath(targetName);
        }
      } else {
        process.stderr.write(
          `Skill already exists from a different source: ${targetName} (${sourceLabel(existingRecord?.source)}). Use --force to replace or --name <alias>.\n`,
        );
        continue;
      }
    }

    // In interactive mode, the user explicitly selected this skill, so no warning needed.
    // In non-interactive mode, replace items were already filtered out unless --force.
    if ((await pathExists(dest)) && !force && !interactive && conflictStatus !== 'same-source update') {
      process.stderr.write(`Skill already exists: ${targetName} (use --force to overwrite)\n`);
      continue;
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] add ${targetName} -> ${dest}\n`);
      continue;
    }

    if (await pathExists(dest)) {
      if (targetName === name) {
        removeGitSourceTracking({ registry, kind: 'skills', name: targetName, source: existingRecord?.source });
      }
      await removeDir(dest);
    }

    await copyDir(srcDir, dest, { ignoreNames: ['.git'] });

    registry.skills[targetName] = {
      name: targetName,
      addedAt: registry.skills[targetName]?.addedAt ?? now,
      updatedAt: now,
      source: incomingSource,
    };
    addedSkillNames.push(targetName);

    process.stdout.write(`Added: ${targetName}\n`);
  }

  return addedSkillNames;
}

export async function cmdSkillsAdd(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  let source = positionals[0];
  if (!source) {
    process.stderr.write(
      'Usage: ap skills add <git-url|owner/repo|local-path> [--name <skill>] [--ref <ref>] [--force]\n',
    );
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
        const checkout = await runGit(['-C', cloneDest, 'fetch', '--depth', '1', 'origin', refFlag], {
          cwd: undefined,
        });
        if (checkout === 0) {
          await runGit(['-C', cloneDest, 'checkout', refFlag], { cwd: undefined });
        }
      }

      const candidates = await resolveSkillSources(cloneDest, {
        nameFlag,
        fallbackName: guessNameFromGitUrl(source),
        interactive,
        force,
      });
      if (candidates === null) return 1;
      if (candidates.length === 0) return 0;

      const registry = await loadRegistry();
      const incomingSource: SkillSource = { type: 'git', url: source, ref: refFlag };
      const addedSkillNames = await copySkillCandidates(candidates, incomingSource, {
        registry,
        interactive,
        force,
        dryRun,
      });

      // Save repo record for tracking
      if (!dryRun && addedSkillNames.length > 0) {
        const { normalizeRepoUrl } = await import('../../core/registry.js');
        const repoKey = normalizeRepoUrl(source);
        const now = new Date().toISOString();
        const existingRepo = registry.repos?.[repoKey];

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

  const candidates = await resolveSkillSources(srcPath, {
    nameFlag,
    fallbackName: path.basename(source),
    interactive,
    force,
  });
  if (candidates === null) return 1;
  if (candidates.length === 0) return 0;

  const registry = await loadRegistry();
  const incomingSource: SkillSource = { type: 'local', path: srcPath };
  const addedSkillNames = await copySkillCandidates(candidates, incomingSource, {
    registry,
    interactive,
    force,
    dryRun,
  });

  if (!dryRun && addedSkillNames.length > 0) {
    await saveRegistry(registry);
  }

  // Preserve the local-path contract: a non-interactive add that resolved candidates but
  // could place none of them (e.g. all blocked by an existing different-source skill) is a
  // failure. The git branch stays lenient (skip-and-continue) to allow partial collections.
  if (!interactive && !dryRun && addedSkillNames.length === 0) {
    return 1;
  }

  return 0;
}
