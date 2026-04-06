import path from 'node:path';
import { loadConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import { ensureCentralAgentStore, getCentralAgentPath } from '../../core/agent-store.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import {
  type Scope,
  filterAgentAdapters,
  getAdapters,
  getColoredLabel,
  type TargetAdapter,
} from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { getCentralAgentsDir } from '../../util/apg-paths.js';
import { ANSI } from '../../util/ansi.js';
import { resolveTargetContext } from '../../util/scope.js';
import { copyDir } from '../../util/copy-dir.js';
import { ensureDir, listDirNames, pathExists, removeDirContents } from '../../util/fs-utils.js';
import { computeDirHash } from '../../util/hash-dir.js';
import type { ParsedFlags } from '../../util/options.js';
import { promptChoice, promptMultiSelect } from '../../util/prompt.js';
import type { CliRunContext } from '../../runner/cli.js';

const IGNORED_DIR_NAMES = ['.git'];

type AgentEntry = {
  name: string;
  srcDir: string;
  destDir: string;
  adapter: TargetAdapter;
  scope: Scope;
  projectRoot: string;
};

export async function cmdAgentsCollect(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const scopeFlag = typeof flags.scope === 'string' ? flags.scope : undefined;
  const cwdFlag = typeof flags.cwd === 'string' ? flags.cwd : undefined;

  const adapters = filterAgentAdapters(getAdapters());
  const selectedAdapters = await selectTargetAdapters({
    adapters,
    flags,
    interactive,
    mode: 'multi',
    promptMessage: 'Select collect source(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const config = await loadConfig();

  const allAgents: AgentEntry[] = [];
  for (const adapter of selectedAdapters) {
    const targetConfig = config.targets[adapter.id];
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag,
      cwdFlag,
      defaultScope: targetConfig?.defaultScope,
      currentCwd: ctx.cwd,
    });
    const sourceAgentsDir = adapter.resolveAgentsDir({ scope, projectRoot, homeDir });

    const available = await listDirNames(sourceAgentsDir);
    if (available.length === 0) {
      process.stderr.write(`${ANSI.dim}(no agents found in ${getColoredLabel(adapter)} ${scope})${ANSI.reset}\n`);
      continue;
    }

    for (const name of available) {
      if (name.startsWith('.') && !positionals.includes(name)) continue;
      if (positionals.length > 0 && !positionals.includes(name)) continue;
      allAgents.push({
        name,
        srcDir: path.join(sourceAgentsDir, name),
        destDir: getCentralAgentPath(name),
        adapter,
        scope,
        projectRoot,
      });
    }
  }

  if (allAgents.length === 0) {
    process.stderr.write(`${ANSI.dim}No agents available to collect.${ANSI.reset}\n`);
    return 0;
  }

  type CollectStatus = 'new' | 'identical' | 'conflict' | 'overwrite';
  type AgentWithStatus = AgentEntry & {
    status: CollectStatus;
    isDuplicate: boolean;
    srcHash: string;
  };

  const seenNames = new Set<string>();
  const agentsWithStatus: AgentWithStatus[] = [];
  const selectedAgents = allAgents;

  process.stderr.write(`${ANSI.dim}Analyzing agents...${ANSI.reset}\n`);

  for (const agent of selectedAgents) {
    const lower = agent.name.toLowerCase();
    const isDuplicate = seenNames.has(lower);
    seenNames.add(lower);

    const srcHash = await computeDirHash(agent.srcDir, { ignoreNames: IGNORED_DIR_NAMES });
    let status: CollectStatus = 'new';
    if (await pathExists(agent.destDir)) {
      const destHash = await computeDirHash(agent.destDir, { ignoreNames: IGNORED_DIR_NAMES });
      status = destHash === srcHash ? 'identical' : 'conflict';
    }
    agentsWithStatus.push({ ...agent, status, isDuplicate, srcHash });
  }

  const destBaseDir = getCentralAgentsDir();
  let finalAgents: AgentWithStatus[];

  const newCount = agentsWithStatus.filter((s) => s.status === 'new' && !s.isDuplicate).length;
  const conflictCount = agentsWithStatus.filter((s) => s.status === 'conflict').length;
  const identicalCount = agentsWithStatus.filter((s) => s.status === 'identical').length;
  const dedupCount = agentsWithStatus.filter((s) => s.isDuplicate).length;

  if (interactive && !force) {
    process.stderr.write(
      `Preview: ${ANSI.green}${newCount} new${ANSI.reset}, ${ANSI.red}${conflictCount} conflict${ANSI.reset}, ${ANSI.gray}${identicalCount} identical${ANSI.reset}` +
        (dedupCount > 0 ? `, ${ANSI.dim}${dedupCount} duplicates${ANSI.reset}` : '') +
        '\n',
    );

    const defaultSelected = agentsWithStatus
      .map((s, i) => (!s.isDuplicate && (s.status === 'new' || s.status === 'conflict') ? String(i) : null))
      .filter((v): v is string => v !== null);

    const selectedKeys = await promptMultiSelect({
      message: `Confirm agents to collect (target: ${destBaseDir}):`,
      options: agentsWithStatus.map((s, i) => {
        const statusLabel =
          s.isDuplicate
            ? `${ANSI.dim}dup${ANSI.reset}`
            : s.status === 'new'
              ? `${ANSI.green}new${ANSI.reset}`
              : s.status === 'identical'
                ? `${ANSI.gray}identical${ANSI.reset}`
                : `${ANSI.red}conflict${ANSI.reset}`;
        return {
          label: `${s.name} (${getColoredLabel(s.adapter)}) [${statusLabel}]`,
          value: String(i),
        };
      }),
      defaultSelected,
      sortDefaultSelectedToTop: true,
    });

    if (selectedKeys.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
    finalAgents = selectedKeys.map((i) => agentsWithStatus[Number(i)]!);
  } else {
    const toCollect = agentsWithStatus.filter((s) => !s.isDuplicate && s.status !== 'identical');
    process.stdout.write(`\nCollect ${toCollect.length} agent(s) to ${destBaseDir}:\n`);
    for (const s of toCollect) {
      const statusLabel = s.status === 'conflict' ? `${ANSI.red}conflict${ANSI.reset}` : `${ANSI.green}new${ANSI.reset}`;
      process.stdout.write(`  ${s.name} (${getColoredLabel(s.adapter)}) [${statusLabel}]\n`);
    }
    const skipped = agentsWithStatus.length - toCollect.length;
    if (skipped > 0) {
      process.stdout.write(`  ${ANSI.dim}(${skipped} skipped: identical or duplicates)${ANSI.reset}\n`);
    }
    finalAgents = toCollect;
  }

  if (!dryRun) await ensureCentralAgentStore();

  const registry = await loadRegistry();
  registry.agents ??= {};
  const syncState = await loadSyncState();

  const conflicts = finalAgents.filter((s) => s.status === 'conflict');
  type Resolution = 'overwrite' | 'backup' | 'keep' | 'skip';
  const resolutions = new Map<string, Resolution>();
  for (const s of finalAgents) {
    if (s.status !== 'conflict') resolutions.set(s.name, 'overwrite');
  }

  if (conflicts.length > 0 && interactive) {
    process.stdout.write(`\n${ANSI.red}Conflicts detected for ${conflicts.length} agent(s).${ANSI.reset}\n`);
    const batchAction = await promptChoice({
      message: 'How would you like to resolve these conflicts?',
      options: [
        { key: 'o', label: 'Overwrite local (use source version)' },
        { key: 's', label: 'Skip all conflicts (keep local)' },
        { key: 'b', label: 'Backup local & overwrite' },
        { key: 'i', label: 'Inspect/Select individually' },
        { key: 'c', label: 'Cancel operation' },
      ],
    });
    if (batchAction === 'c') {
      process.stdout.write('Operation cancelled.\n');
      return 0;
    }
    if (batchAction === 'o') conflicts.forEach((c) => resolutions.set(c.name, 'overwrite'));
    if (batchAction === 's') conflicts.forEach((c) => resolutions.set(c.name, 'skip'));
    if (batchAction === 'b') conflicts.forEach((c) => resolutions.set(c.name, 'backup'));
    if (batchAction === 'i') {
      for (const c of conflicts) {
        const action = await promptChoice({
          message: `Resolve conflict for ${c.name}:`,
          options: [
            { key: 'o', label: 'Overwrite' },
            { key: 'b', label: 'Backup & overwrite' },
            { key: 'k', label: 'Keep both (rename incoming)' },
            { key: 's', label: 'Skip' },
          ],
        });
        const keyToAction: Record<string, Resolution> = { o: 'overwrite', b: 'backup', k: 'keep', s: 'skip' };
        resolutions.set(c.name, keyToAction[action] ?? 'skip');
      }
    }
  } else if (force) {
    conflicts.forEach((c) => resolutions.set(c.name, 'overwrite'));
  } else if (conflicts.length > 0) {
    process.stderr.write(`${conflicts.length} conflict(s) detected. Re-run with --force or in an interactive terminal.\n`);
    return 1;
  }

  for (const agent of finalAgents) {
    const { name, srcDir, destDir, adapter, scope, projectRoot, srcHash } = agent;
    if (!(await pathExists(srcDir))) {
      process.stderr.write(`Missing source agent: ${name}\n`);
      continue;
    }

    const contextId = makeContextId({
      target: adapter.id,
      scope,
      projectRoot: scope === 'local' ? projectRoot : undefined,
    });
    const context = syncState.contexts[contextId] ?? { skills: {}, agents: {} as Record<string, { hash: string; syncedAt: string }> };
    context.agents ??= {};
    syncState.contexts[contextId] = context;

    let targetDest = destDir;
    let targetName = name;
    const action = resolutions.get(name) ?? 'skip';

    if (action === 'skip') {
      process.stdout.write(`Skipped: ${name}\n`);
      continue;
    }
    if (dryRun) {
      const actionLabel = action === 'keep' ? `keep-both as ${targetName}` : action;
      process.stdout.write(`[dry-run] ${actionLabel} ${name} -> ${targetDest}\n`);
      continue;
    }
    if (action === 'keep') {
      let counter = 1;
      while (await pathExists(targetDest)) {
        targetName = `${name}_new${counter}`;
        targetDest = path.join(destBaseDir, targetName);
        counter++;
      }
      process.stdout.write(`Renaming incoming to ${targetName}\n`);
    }

    if (action === 'backup') {
      const backupDir = `${destDir}.bak-${Date.now()}`;
      await ensureDir(path.dirname(backupDir));
      if (await pathExists(destDir)) {
        await copyDir(destDir, backupDir, { ignoreNames: IGNORED_DIR_NAMES });
        await removeDirContents(destDir, IGNORED_DIR_NAMES);
      }
    } else if (action === 'overwrite' && (await pathExists(destDir))) {
      await removeDirContents(destDir, IGNORED_DIR_NAMES);
    }

    await copyDir(srcDir, targetDest, { ignoreNames: IGNORED_DIR_NAMES });
    const now = new Date().toISOString();
    registry.agents[targetName] = registry.agents[targetName] ?? {
      name: targetName,
      addedAt: now,
      updatedAt: now,
      source: { type: 'collected', from: { target: adapter.id, scope, path: srcDir } },
    };
    registry.agents[targetName]!.updatedAt = now;
    context.agents[name] = { hash: srcHash, syncedAt: now };

    process.stdout.write(`Collected: ${targetName}\n`);
  }

  if (!dryRun) {
    await saveRegistry(registry);
    await saveSyncState(syncState);
  }

  return 0;
}
