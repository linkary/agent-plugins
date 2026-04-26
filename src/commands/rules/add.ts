import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { ensureCentralRuleStore, getCentralRulePath } from '../../core/rule-store.js';
import { loadRegistry, saveRegistry, normalizeRepoUrl } from '../../core/registry.js';
import { computeItemHash, copyItem } from '../../util/item-utils.js';
import { InvalidRulePathError, isRuleFileName, normalizeRulePath, scanRuleFileEntries } from '../../util/rule-utils.js';
import { ANSI } from '../../util/ansi.js';
import { expandGitHubShorthand, guessNameFromGitUrl, isGitHubShorthand, isProbablyGitUrl, runGit } from '../../util/git-utils.js';
import { ensureDir, pathExists, removeDir } from '../../util/fs-utils.js';
import { promptChoice } from '../../util/prompt.js';
import {
  classifySourceConflict,
  removeGitSourceTracking,
  sourceLabel,
  suggestAliasName,
  uniqueAliasName,
} from '../../util/source-conflict.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

type AddRuleEntry = { relativePath: string; absolutePath: string };

function withPreferredName(entry: AddRuleEntry, nameFlag: string | undefined): AddRuleEntry {
  if (!nameFlag) return entry;
  const normalized = normalizeRulePath(nameFlag);
  const ext = path.extname(normalized);
  if (ext) {
    return { ...entry, relativePath: normalized };
  }
  const sourceExt = path.extname(entry.relativePath);
  return { ...entry, relativePath: `${normalized}${sourceExt || '.mdc'}` };
}

function isInvalidRulePathError(err: unknown): err is InvalidRulePathError {
  return err instanceof InvalidRulePathError;
}

function suggestRuleAlias(name: string, source: Parameters<typeof suggestAliasName>[1]): string {
  const ext = path.extname(name) || '.mdc';
  const base = name.slice(0, name.length - ext.length);
  return normalizeRulePath(`${suggestAliasName(base, source)}${ext}`);
}

async function collectRulesFromLocalSource(source: string): Promise<AddRuleEntry[]> {
  const srcPath = path.resolve(source);
  if (!(await pathExists(srcPath))) return [];
  const stat = await fs.stat(srcPath);

  if (stat.isFile()) {
    if (!isRuleFileName(srcPath)) return [];
    return [{ relativePath: path.basename(srcPath), absolutePath: srcPath }];
  }

  const rulesSubdir = path.join(srcPath, 'rules');
  const rootDir =
    (await pathExists(rulesSubdir)) && (await fs.stat(rulesSubdir)).isDirectory() ? rulesSubdir : srcPath;
  return await scanRuleFileEntries(rootDir);
}

export async function cmdRulesAdd(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  let source = positionals[0];
  if (!source) {
    process.stderr.write('Usage: ap rules add <git-url|owner/repo|local-path|rule-file> [--name <rule>] [--ref <ref>] [--force]\n');
    return 1;
  }

  await ensureCentralRuleStore();
  const nameFlag = typeof flags.name === 'string' ? flags.name : undefined;
  const refFlag = typeof flags.ref === 'string' ? flags.ref : undefined;
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (isGitHubShorthand(source)) {
    source = expandGitHubShorthand(source);
    process.stdout.write(`Expanded to: ${source}\n`);
  }

  let entries: AddRuleEntry[] = [];
  let resolvedSourceType: 'git' | 'local' = 'local';

  if (isProbablyGitUrl(source)) {
    resolvedSourceType = 'git';
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apd-rules-add-'));
    const cloneDest = path.join(tmpDir, 'repo');

    try {
      process.stdout.write(`Cloning ${source}...\n`);
      const code = await runGit(['clone', '--depth', '1', source, cloneDest], { cwd: undefined });
      if (code !== 0) {
        process.stderr.write('Git clone failed.\n');
        return code;
      }
      if (refFlag) {
        const fetchCode = await runGit(['-C', cloneDest, 'fetch', '--depth', '1', 'origin', refFlag], { cwd: undefined });
        if (fetchCode === 0) await runGit(['-C', cloneDest, 'checkout', refFlag], { cwd: undefined });
      }

      const rulesSubdir = path.join(cloneDest, 'rules');
      const rootDir =
        (await pathExists(rulesSubdir)) && (await fs.stat(rulesSubdir)).isDirectory() ? rulesSubdir : cloneDest;
      entries = await scanRuleFileEntries(rootDir);
      if (entries.length === 0) {
        process.stderr.write('No rule files found in source repository.\n');
        return 1;
      }

      if (nameFlag && entries.length === 1) {
        try {
          entries = [withPreferredName(entries[0]!, nameFlag)];
        } catch (err) {
          if (isInvalidRulePathError(err)) {
            process.stderr.write(`${err.message}\n`);
            return 1;
          }
          throw err;
        }
      }

      const registry = await loadRegistry();
      registry.rules ??= {};
      registry.ruleRepos ??= {};
      const now = new Date().toISOString();
      const addedNames: string[] = [];
      const incomingSource = { type: 'git' as const, url: source, ref: refFlag };

      for (const entry of entries) {
        let name: string;
        try {
          name = normalizeRulePath(entry.relativePath);
        } catch (err) {
          if (isInvalidRulePathError(err)) {
            process.stderr.write(`Skipped invalid rule path from source: ${entry.relativePath}\n`);
            continue;
          }
          throw err;
        }
        let targetName = name;
        let dest = getCentralRulePath(targetName);
        const destExists = await pathExists(dest);
        const existingRecord = registry.rules[targetName];

        if (destExists) {
          const [srcHash, destHash] = await Promise.all([computeItemHash(entry.absolutePath), computeItemHash(dest)]);
          if (srcHash === destHash) {
            process.stdout.write(`Up-to-date: ${targetName}\n`);
            continue;
          }
          const conflictStatus = classifySourceConflict({
            existingSource: existingRecord?.source,
            incomingSource,
            contentStatus: 'update',
          });
          if (conflictStatus === 'different-source conflict' && !force) {
            if (interactive) {
              const action = await promptChoice({
                message: `Rule "${targetName}" already exists from ${sourceLabel(existingRecord?.source)}. Incoming source: ${sourceLabel(incomingSource)}.`,
                options: [
                  { key: 's', label: 'Skip' },
                  { key: 'r', label: 'Replace existing' },
                  { key: 'a', label: `Install as alias (${suggestRuleAlias(targetName, incomingSource)})` },
                ],
              });
              if (action === 's') {
                process.stdout.write(`Skipped: ${targetName}\n`);
                continue;
              }
              if (action === 'a') {
                targetName = await uniqueAliasName(suggestRuleAlias(targetName, incomingSource), async (candidate) =>
                  pathExists(getCentralRulePath(candidate)),
                );
                dest = getCentralRulePath(targetName);
              }
            } else {
              process.stderr.write(
                `Rule already exists from a different source: ${targetName} (${sourceLabel(existingRecord?.source)}). Use --force to replace or --name <alias> for a single-rule source.\n`,
              );
              continue;
            }
          } else if (!force && conflictStatus !== 'same-source update') {
            process.stderr.write(`Rule already exists: ${targetName} (use --force to overwrite)\n`);
            continue;
          }
        }

        if (dryRun) {
          process.stdout.write(`[dry-run] add ${targetName} -> ${dest}\n`);
          continue;
        }

        await ensureDir(path.dirname(dest));
        await copyItem(entry.absolutePath, dest);
        if (targetName === name) {
          removeGitSourceTracking({ registry, kind: 'rules', name: targetName, source: existingRecord?.source });
        }
        registry.rules[targetName] = {
          name: targetName,
          addedAt: registry.rules[targetName]?.addedAt ?? now,
          updatedAt: now,
          source: incomingSource,
        };
        addedNames.push(targetName);
        process.stdout.write(`Added: ${targetName}\n`);
      }

      if (!dryRun && addedNames.length > 0) {
        const repoKey = normalizeRepoUrl(source);
        const existing = registry.ruleRepos[repoKey];
        if (existing) {
          const merged = new Set([...existing.skills, ...addedNames]);
          existing.skills = [...merged];
          existing.updatedAt = now;
          if (refFlag) existing.ref = refFlag;
        } else {
          registry.ruleRepos[repoKey] = {
            url: source,
            ref: refFlag,
            skills: addedNames,
            addedAt: now,
            updatedAt: now,
          };
        }
        await saveRegistry(registry);
      }

      return 0;
    } finally {
      await removeDir(tmpDir);
    }
  }

  entries = await collectRulesFromLocalSource(source);
  if (entries.length === 0) {
    process.stderr.write(`No rule files found in source: ${source}\n`);
    return 1;
  }

  if (nameFlag && entries.length === 1) {
    try {
      entries = [withPreferredName(entries[0]!, nameFlag)];
    } catch (err) {
      if (isInvalidRulePathError(err)) {
        process.stderr.write(`${err.message}\n`);
        return 1;
      }
      throw err;
    }
  }

  const registry = await loadRegistry();
  registry.rules ??= {};
  const now = new Date().toISOString();
  const incomingSource = { type: 'local' as const, path: path.resolve(source) };

  for (const entry of entries) {
    let name: string;
    try {
      name = normalizeRulePath(entry.relativePath || guessNameFromGitUrl(source));
    } catch (err) {
      if (isInvalidRulePathError(err)) {
        process.stderr.write(`Skipped invalid rule path from source: ${entry.relativePath || source}\n`);
        continue;
      }
      throw err;
    }
    let targetName = name;
    let dest = getCentralRulePath(targetName);
    const destExists = await pathExists(dest);
    const existingRecord = registry.rules[targetName];
    if (destExists) {
      const [srcHash, destHash] = await Promise.all([computeItemHash(entry.absolutePath), computeItemHash(dest)]);
      if (srcHash === destHash) {
        process.stdout.write(`Up-to-date: ${targetName}\n`);
        continue;
      }
      const conflictStatus = classifySourceConflict({
        existingSource: existingRecord?.source,
        incomingSource,
        contentStatus: 'update',
      });
      if (conflictStatus === 'different-source conflict' && !force) {
        if (interactive) {
          const action = await promptChoice({
            message: `Rule "${targetName}" already exists from ${sourceLabel(existingRecord?.source)}. Incoming source: ${sourceLabel(incomingSource)}.`,
            options: [
              { key: 's', label: 'Skip' },
              { key: 'r', label: 'Replace existing' },
              { key: 'a', label: `Install as alias (${suggestRuleAlias(targetName, incomingSource)})` },
            ],
          });
          if (action === 's') {
            process.stdout.write(`Skipped: ${targetName}\n`);
            continue;
          }
          if (action === 'a') {
            targetName = await uniqueAliasName(suggestRuleAlias(targetName, incomingSource), async (candidate) =>
              pathExists(getCentralRulePath(candidate)),
            );
            dest = getCentralRulePath(targetName);
          }
        } else {
          process.stderr.write(
            `Rule already exists from a different source: ${targetName} (${sourceLabel(existingRecord?.source)}). Use --force to replace or --name <alias>.\n`,
          );
          continue;
        }
      } else if (!force && conflictStatus !== 'same-source update') {
        process.stderr.write(`Rule already exists: ${targetName} (use --force to overwrite)\n`);
        continue;
      }
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] add ${targetName} -> ${dest}\n`);
      continue;
    }

    await ensureDir(path.dirname(dest));
    await copyItem(entry.absolutePath, dest);
    if (targetName === name) {
      removeGitSourceTracking({ registry, kind: 'rules', name: targetName, source: existingRecord?.source });
    }
    registry.rules[targetName] = {
      name: targetName,
      addedAt: registry.rules[targetName]?.addedAt ?? now,
      updatedAt: now,
      source: incomingSource,
    };
    process.stdout.write(`Added: ${targetName}\n`);
  }

  if (!dryRun) await saveRegistry(registry);
  if (resolvedSourceType === 'local') process.stdout.write(`${ANSI.dim}Source: local${ANSI.reset}\n`);
  return 0;
}
