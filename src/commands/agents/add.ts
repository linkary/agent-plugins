import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {
  ensureCentralAgentStore,
  resolveCentralAgentEntry,
  writeCentralAgentSpec,
} from '../../core/agent-store.js';
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import { listDirNames, pathExists, removeDir } from '../../util/fs-utils.js';
import { promptChoice, promptMultiSelect } from '../../util/prompt.js';
import {
  isProbablyGitUrl,
  isGitHubShorthand,
  expandGitHubShorthand,
  guessNameFromGitUrl,
  runGit,
  isAgentDir,
} from '../../util/git-utils.js';
import {
  classifyFilesystemAgentPath,
  compareFilesystemAgents,
  readAgentSpecFromEntry,
} from '../../util/agent-transform.js';
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

type AgentStatus = 'new' | 'update' | 'identical';

async function detectAgentStatus(srcPath: string, name: string): Promise<AgentStatus> {
  const sourceEntry = await classifyFilesystemAgentPath(srcPath, name);
  if (!sourceEntry) return 'new';

  const targetEntry = await resolveCentralAgentEntry(name);
  if (!targetEntry) return 'new';

  const comparison = await compareFilesystemAgents(sourceEntry, targetEntry);
  return comparison === 'same' ? 'identical' : 'update';
}

export async function cmdAgentsAdd(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  let source = positionals[0];
  if (!source) {
    process.stderr.write('Usage: ap agents add <git-url|owner/repo|local-path> [--name <agent>] [--ref <ref>] [--force]\n');
    return 1;
  }

  await ensureCentralAgentStore();

  const nameFlag = typeof flags.name === 'string' ? flags.name : undefined;
  const refFlag = typeof flags.ref === 'string' ? flags.ref : undefined;
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (isGitHubShorthand(source)) {
    source = expandGitHubShorthand(source);
    process.stdout.write(`Expanded to: ${source}\n`);
  }

  if (isProbablyGitUrl(source)) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apd-add-agent-'));
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
        if (checkout === 0) await runGit(['-C', cloneDest, 'checkout', refFlag], { cwd: undefined });
      }

      const isSingleAgent = await isAgentDir(cloneDest);
      let agentsToCopy: { name: string; srcDir: string }[] = [];

      if (isSingleAgent) {
        const resolvedName = nameFlag ?? guessNameFromGitUrl(source);
        agentsToCopy = [{ name: resolvedName, srcDir: cloneDest }];
      } else {
        let searchDir = cloneDest;
        const agentsSubdir = path.join(cloneDest, 'agents');
        if (await pathExists(agentsSubdir)) {
          const stat = await fs.stat(agentsSubdir);
          if (stat.isDirectory()) {
            searchDir = agentsSubdir;
            process.stdout.write('Found agents/ directory, searching inside...\n');
          }
        }

        const subdirs = await listDirNames(searchDir);
        const agentDirs: string[] = [];
        for (const sub of subdirs) {
          if (sub.startsWith('.')) continue;
          const subPath = path.join(searchDir, sub);
          if (await isAgentDir(subPath)) agentDirs.push(sub);
        }
        if (agentDirs.length === 0) {
          process.stderr.write('No agents found in repository (no AGENT.md files).\n');
          return 1;
        }

        type AgentInfo = { name: string; srcDir: string; status: AgentStatus };
        const agentsInfo: AgentInfo[] = await Promise.all(
          agentDirs.map(async (name) => {
            const srcDir = path.join(searchDir, name);
            const status = await detectAgentStatus(srcDir, name);
            return { name, srcDir, status };
          }),
        );

        const newCount = agentsInfo.filter((s) => s.status === 'new').length;
        const updateCount = agentsInfo.filter((s) => s.status === 'update').length;
        const identicalCount = agentsInfo.filter((s) => s.status === 'identical').length;
        process.stdout.write(
          `\nFound ${agentsInfo.length} agent(s): ${ANSI.green}${newCount} new${ANSI.reset}, ${ANSI.yellow}${updateCount} update${ANSI.reset}, ${ANSI.dim}${identicalCount} identical${ANSI.reset}\n`,
        );

        if (interactive) {
          const defaultSelected = agentsInfo.filter((s) => s.status !== 'identical').map((s) => s.name);
          const selected = await promptMultiSelect({
            message: 'Select agents to add:',
            options: agentsInfo.map((s) => {
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
          agentsToCopy = agentsInfo.filter((s) => selected.includes(s.name)).map((s) => ({ name: s.name, srcDir: s.srcDir }));
        } else {
          const toAdd = force ? agentsInfo : agentsInfo.filter((s) => s.status !== 'identical');
          agentsToCopy = toAdd.map((s) => ({ name: s.name, srcDir: s.srcDir }));
        }
      }

      const registry = await loadRegistry();
      registry.agents ??= {};
      registry.agentRepos ??= {};
      const now = new Date().toISOString();
      const addedAgentNames: string[] = [];
      const incomingSource = { type: 'git' as const, url: source, ref: refFlag };

      for (const { name, srcDir } of agentsToCopy) {
        let targetName = name;
        let destExists = (await resolveCentralAgentEntry(targetName)) !== null;
        const existingRecord = registry.agents[targetName];
        const contentStatus = await detectAgentStatus(srcDir, targetName);
        const conflictStatus = classifySourceConflict({
          existingSource: existingRecord?.source,
          incomingSource,
          contentStatus,
        });
        if (conflictStatus === 'different-source conflict' && !force) {
          if (interactive) {
            const action = await promptChoice({
              message: `Agent "${targetName}" already exists from ${sourceLabel(existingRecord?.source)}. Incoming source: ${sourceLabel(incomingSource)}.`,
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
                (await resolveCentralAgentEntry(candidate)) !== null,
              );
              destExists = false;
            }
          } else {
            process.stderr.write(
              `Agent already exists from a different source: ${targetName} (${sourceLabel(existingRecord?.source)}). Use --force to replace or --name <alias> for a single-agent repo.\n`,
            );
            continue;
          }
        }
        if (destExists && !force && !interactive && conflictStatus !== 'same-source update') {
          process.stderr.write(`Agent already exists: ${targetName} (use --force to overwrite)\n`);
          continue;
        }
        const sourceEntry = await classifyFilesystemAgentPath(srcDir, name);
        if (!sourceEntry) {
          process.stderr.write(`Unreadable agent source: ${srcDir}\n`);
          continue;
        }
        const spec = await readAgentSpecFromEntry(sourceEntry);
        if (!spec) {
          process.stderr.write(`Could not parse agent: ${name}\n`);
          continue;
        }
        if (dryRun) {
          process.stdout.write(`[dry-run] add ${targetName}\n`);
          continue;
        }
        if (destExists && targetName === name) {
          removeGitSourceTracking({ registry, kind: 'agents', name, source: existingRecord?.source });
        }
        await writeCentralAgentSpec({ ...spec, name: targetName }, { sourceDir: sourceEntry.form === 'directory' ? sourceEntry.path : undefined });

        registry.agents[targetName] = {
          name: targetName,
          addedAt: registry.agents[targetName]?.addedAt ?? now,
          updatedAt: now,
          source: incomingSource,
        };
        addedAgentNames.push(targetName);
        process.stdout.write(`Added: ${targetName}\n`);
      }

      if (!dryRun && addedAgentNames.length > 0) {
        const { normalizeRepoUrl } = await import('../../core/registry.js');
        const repoKey = normalizeRepoUrl(source);
        const existingRepo = registry.agentRepos[repoKey];

        if (existingRepo) {
          const merged = new Set([...existingRepo.skills, ...addedAgentNames]);
          existingRepo.skills = [...merged];
          existingRepo.updatedAt = now;
          if (refFlag) existingRepo.ref = refFlag;
        } else {
          registry.agentRepos[repoKey] = {
            url: source,
            ref: refFlag,
            skills: addedAgentNames,
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
  let targetName = resolvedName;
  let destExists = (await resolveCentralAgentEntry(targetName)) !== null;
  const incomingSource = { type: 'local' as const, path: srcPath };
  const registry = await loadRegistry();
  registry.agents ??= {};

  const sourceEntry = await classifyFilesystemAgentPath(srcPath, resolvedName);
  if (!sourceEntry) {
    process.stderr.write(`Source path is not a readable agent: ${srcPath}\n`);
    return 1;
  }
  const spec = await readAgentSpecFromEntry(sourceEntry);
  if (!spec) {
    process.stderr.write(`Could not parse agent: ${resolvedName}\n`);
    return 1;
  }
  const existingRecord = registry.agents[targetName];
  if (destExists) {
    const contentStatus = await detectAgentStatus(srcPath, targetName);
    const conflictStatus = classifySourceConflict({
      existingSource: existingRecord?.source,
      incomingSource,
      contentStatus,
    });
    if (conflictStatus === 'different-source conflict' && !force) {
      if (interactive) {
        const action = await promptChoice({
          message: `Agent "${targetName}" already exists from ${sourceLabel(existingRecord?.source)}. Incoming source: ${sourceLabel(incomingSource)}.`,
          options: [
            { key: 's', label: 'Skip' },
            { key: 'r', label: 'Replace existing' },
            { key: 'a', label: `Install as alias (${suggestAliasName(targetName, incomingSource)})` },
          ],
        });
        if (action === 's') {
          process.stdout.write(`Skipped: ${targetName}\n`);
          return 0;
        }
        if (action === 'a') {
          targetName = await uniqueAliasName(suggestAliasName(targetName, incomingSource), async (candidate) =>
            (await resolveCentralAgentEntry(candidate)) !== null,
          );
          destExists = false;
        }
      } else {
        process.stderr.write(
          `Agent already exists from a different source: ${targetName} (${sourceLabel(existingRecord?.source)}). Use --force to replace or --name <alias>.\n`,
        );
        return 1;
      }
    } else if (!force && !interactive && conflictStatus !== 'same-source update') {
      process.stderr.write(`Agent already exists: ${targetName}\nUse --force to overwrite.\n`);
      return 1;
    }
  }

  if (dryRun) {
    process.stdout.write(`[dry-run] add ${targetName}\n`);
    return 0;
  }
  if (destExists && targetName === resolvedName) {
    removeGitSourceTracking({ registry, kind: 'agents', name: targetName, source: existingRecord?.source });
  }
  await writeCentralAgentSpec(
    { ...spec, name: targetName },
    { sourceDir: sourceEntry.form === 'directory' ? sourceEntry.path : undefined },
  );

  const now = new Date().toISOString();
  registry.agents[targetName] = {
    name: targetName,
    addedAt: registry.agents[targetName]?.addedAt ?? now,
    updatedAt: now,
    source: incomingSource,
  };
  await saveRegistry(registry);

  process.stdout.write(`Added local agent: ${targetName}\n`);
  return 0;
}
