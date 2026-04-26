import path from 'node:path';
import fs from 'node:fs/promises';
import { loadConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import {
  ensureCentralAgentStore,
  getCentralAgentPath,
  resolveCentralAgentEntry,
  writeCentralAgentSpec,
} from '../../core/agent-store.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import {
  type Scope,
  filterAgentAdapters,
  getAdapters,
  getColoredLabel,
  type TargetAdapter,
} from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { ANSI } from '../../util/ansi.js';
import { getCentralAgentsDir } from '../../util/apg-paths.js';
import { resolveTargetContext } from '../../util/scope.js';
import { ensureDir, pathExists } from '../../util/fs-utils.js';
import type { ParsedFlags } from '../../util/options.js';
import { promptChoice, promptMultiSelect } from '../../util/prompt.js';
import type { CliRunContext } from '../../runner/cli.js';
import { formatTargetReviewLine } from '../../util/review-display.js';
import {
  classifyFilesystemAgentPath,
  compareAgentEntries,
  computeAgentHashForTarget,
  readAgentSpecFromEntry,
  scanFilesystemAgents,
} from '../../util/agent-transform.js';
import { removeGitSourceTracking } from '../../util/source-conflict.js';

type AgentEntry = {
  name: string;
  sourceEntry: Awaited<ReturnType<typeof classifyFilesystemAgentPath>> extends infer T
    ? T extends null
      ? never
      : T
    : never;
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

    const available = await scanFilesystemAgents(sourceAgentsDir);
    if (available.length === 0) {
      process.stderr.write(`${ANSI.dim}(no agents found in ${getColoredLabel(adapter)} ${scope})${ANSI.reset}\n`);
      continue;
    }

    for (const entry of available) {
      if (entry.name.startsWith('.') && !positionals.includes(entry.name)) continue;
      if (positionals.length > 0 && !positionals.includes(entry.name)) continue;
      allAgents.push({
        name: entry.name,
        sourceEntry: entry,
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

  type CollectStatus = 'new' | 'identical' | 'conflict';
  type AgentWithStatus = AgentEntry & {
    status: CollectStatus;
    isDuplicate: boolean;
    srcHash: string;
  };

  const seenNames = new Set<string>();
  const agentsWithStatus: AgentWithStatus[] = [];

  process.stderr.write(`${ANSI.dim}Analyzing agents...${ANSI.reset}\n`);

  for (const agent of allAgents) {
    const lower = agent.name.toLowerCase();
    const isDuplicate = seenNames.has(lower);
    seenNames.add(lower);

    const srcHash = await computeAgentHashForTarget(agent.sourceEntry, agent.adapter);
    if (!srcHash) continue;

    let status: CollectStatus = 'new';
    const existingEntry = await resolveCentralAgentEntry(agent.name);
    if (existingEntry) {
      const comparison = await compareAgentEntries(agent.sourceEntry, existingEntry, agent.adapter);
      status = comparison === 'same' ? 'identical' : 'conflict';
    }

    agentsWithStatus.push({ ...agent, status, isDuplicate, srcHash });
  }

  const destBaseDir = getCentralAgentsDir();
  let finalAgents: AgentWithStatus[];

  const newCount = agentsWithStatus.filter((item) => item.status === 'new' && !item.isDuplicate).length;
  const conflictCount = agentsWithStatus.filter((item) => item.status === 'conflict').length;
  const identicalCount = agentsWithStatus.filter((item) => item.status === 'identical').length;
  const dedupCount = agentsWithStatus.filter((item) => item.isDuplicate).length;

  if (interactive && !force) {
    process.stderr.write(
      `Preview: ${ANSI.green}${newCount} new${ANSI.reset}, ${ANSI.red}${conflictCount} conflict${ANSI.reset}, ${ANSI.gray}${identicalCount} identical${ANSI.reset}` +
        (dedupCount > 0 ? `, ${ANSI.dim}${dedupCount} duplicates${ANSI.reset}` : '') +
        '\n',
    );

    const defaultSelected = agentsWithStatus
      .map((item, index) => (!item.isDuplicate && (item.status === 'new' || item.status === 'conflict') ? String(index) : null))
      .filter((value): value is string => value !== null);

    const selectedKeys = await promptMultiSelect({
      message: `Confirm agents to collect (target: ${destBaseDir}):`,
      options: agentsWithStatus.map((item, index) => {
        const statusLabel =
          item.isDuplicate
            ? `${ANSI.dim}dup${ANSI.reset}`
            : item.status === 'new'
              ? `${ANSI.green}new${ANSI.reset}`
              : item.status === 'identical'
                ? `${ANSI.gray}identical${ANSI.reset}`
                : `${ANSI.red}conflict${ANSI.reset}`;
        return {
          label: `${formatTargetReviewLine(item.name, getColoredLabel(item.adapter), item.scope)} [${statusLabel}]`,
          value: String(index),
        };
      }),
      defaultSelected,
      sortDefaultSelectedToTop: true,
    });

    if (selectedKeys.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
    finalAgents = selectedKeys.map((index) => agentsWithStatus[Number(index)]!);
  } else {
    const toCollect = agentsWithStatus.filter((item) => !item.isDuplicate && item.status !== 'identical');
    process.stdout.write(`\nCollect ${toCollect.length} agent(s) to ${destBaseDir}:\n`);
    for (const item of toCollect) {
      const statusLabel = item.status === 'conflict' ? `${ANSI.red}conflict${ANSI.reset}` : `${ANSI.green}new${ANSI.reset}`;
      process.stdout.write(`  ${formatTargetReviewLine(item.name, getColoredLabel(item.adapter), item.scope)} [${statusLabel}]\n`);
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

  const conflicts = finalAgents.filter((item) => item.status === 'conflict');
  type Resolution = 'overwrite' | 'backup' | 'keep' | 'skip';
  const resolutions = new Map<string, Resolution>();
  for (const item of finalAgents) {
    if (item.status !== 'conflict') resolutions.set(item.name, 'overwrite');
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
    if (batchAction === 'o') conflicts.forEach((item) => resolutions.set(item.name, 'overwrite'));
    if (batchAction === 's') conflicts.forEach((item) => resolutions.set(item.name, 'skip'));
    if (batchAction === 'b') conflicts.forEach((item) => resolutions.set(item.name, 'backup'));
    if (batchAction === 'i') {
      for (const item of conflicts) {
        const action = await promptChoice({
          message: `Resolve conflict for ${item.name}:`,
          options: [
            { key: 'o', label: 'Overwrite' },
            { key: 'b', label: 'Backup & overwrite' },
            { key: 'k', label: 'Keep both (rename incoming)' },
            { key: 's', label: 'Skip' },
          ],
        });
        const keyToAction: Record<string, Resolution> = { o: 'overwrite', b: 'backup', k: 'keep', s: 'skip' };
        resolutions.set(item.name, keyToAction[action] ?? 'skip');
      }
    }
  } else if (force) {
    conflicts.forEach((item) => resolutions.set(item.name, 'overwrite'));
  } else if (conflicts.length > 0) {
    process.stderr.write(`${conflicts.length} conflict(s) detected. Re-run with --force or in an interactive terminal.\n`);
    return 1;
  }

  for (const agent of finalAgents) {
    const { name, sourceEntry, adapter, scope, projectRoot, srcHash } = agent;
    if (!(await pathExists(sourceEntry.path))) {
      process.stderr.write(`Missing source agent: ${name}\n`);
      continue;
    }

    const spec = await readAgentSpecFromEntry(sourceEntry);
    if (!spec) {
      process.stderr.write(`Could not parse source agent: ${name}\n`);
      continue;
    }

    const contextId = makeContextId({
      target: adapter.id,
      scope,
      projectRoot: scope === 'local' ? projectRoot : undefined,
    });
    const context =
      syncState.contexts[contextId] ?? ({ skills: {}, agents: {} as Record<string, { hash: string; syncedAt: string }> } as const);
    context.agents ??= {};
    syncState.contexts[contextId] = context;

    let targetName = name;
    let action = resolutions.get(name) ?? 'skip';
    if (action === 'skip') {
      process.stdout.write(`Skipped: ${name}\n`);
      continue;
    }

    if (action === 'keep') {
      let counter = 1;
      while ((await resolveCentralAgentEntry(targetName)) !== null) {
        targetName = `${name}_new${counter}`;
        counter++;
      }
      process.stdout.write(`Renaming incoming to ${targetName}\n`);
      action = 'overwrite';
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] ${action} ${name} -> ${path.join(destBaseDir, targetName)}\n`);
      continue;
    }

    const existingEntry = await resolveCentralAgentEntry(targetName);
    if (action === 'backup' && existingEntry) {
      const backupPath = `${getCentralAgentPath(targetName)}.bak-${Date.now()}`;
      await ensureDir(path.dirname(backupPath));
      await fs.cp(existingEntry.path, backupPath, { recursive: true });
    }

    await writeCentralAgentSpec(
      { ...spec, name: targetName },
      sourceEntry.form === 'directory' ? { sourceDir: sourceEntry.path } : { sourceFile: sourceEntry.path },
    );

    const now = new Date().toISOString();
    if (targetName === name) {
      removeGitSourceTracking({ registry, kind: 'agents', name: targetName, source: registry.agents[targetName]?.source });
    }
    registry.agents[targetName] = {
      name: targetName,
      addedAt: registry.agents[targetName]?.addedAt ?? now,
      updatedAt: now,
      source: { type: 'collected', from: { target: adapter.id, scope, path: sourceEntry.path } },
    };
    context.agents[name] = { hash: srcHash, syncedAt: now };

    process.stdout.write(`Collected: ${targetName}\n`);
  }

  if (!dryRun) {
    await saveRegistry(registry);
    await saveSyncState(syncState);
  }

  return 0;
}
