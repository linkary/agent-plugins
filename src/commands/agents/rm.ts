import path from 'node:path';
import { loadConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry, normalizeRepoUrl, removeAgentFromRepo } from '../../core/registry.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { listCentralAgentItems, resolveCentralAgentPath } from '../../core/agent-store.js';
import { ensureDir, pathExists } from '../../util/fs-utils.js';
import { removeItem } from '../../util/item-utils.js';
import {
  filterAgentAdapters,
  getAdapters,
  getColoredLabel,
  resolveAdapter,
} from '../../targets/adapters.js';
import { resolveTargetContext } from '../../util/scope.js';
import { promptConfirm, promptMultiSelect, promptSelect } from '../../util/prompt.js';
import { isProbablyGitUrl, isGitHubShorthand } from '../../util/git-utils.js';
import { ANSI } from '../../util/ansi.js';
import { gatherTargetAgents, findSyncedAgentCopies, type SyncedAgentCopy } from './manage-utils.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

const CENTRAL_VALUE = '__central__';

async function resolveTargetAgentPath(destAgentsDir: string, name: string): Promise<string | null> {
  const dirPath = path.join(destAgentsDir, name);
  const mdPath = path.join(destAgentsDir, `${name}.md`);
  const [dirExists, fileExists] = await Promise.all([pathExists(dirPath), pathExists(mdPath)]);
  if (dirExists) return dirPath;
  if (fileExists) return mdPath;
  return null;
}

export async function cmdAgentsRemove(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  const args = positionals;
  const dryRun = flags['dry-run'] === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (args.length === 0 && !flags.target && interactive) {
    return await interactiveRemove(flags, ctx);
  }
  if (args.length === 0 && flags.target && interactive) {
    return await interactiveRemoveFromTarget(flags, ctx);
  }
  if (args.length === 0) {
    process.stderr.write('Usage: ap agents rm <agent|repo>...\n');
    return 1;
  }

  const targetRaw = flags.target;
  const targetFlag =
    typeof targetRaw === 'string'
      ? targetRaw
      : Array.isArray(targetRaw)
        ? targetRaw[0]
        : undefined;
  if (Array.isArray(targetRaw) && targetRaw.length > 1) {
    process.stderr.write('rm only supports a single --target. Use separate commands for multiple targets.\n');
    return 1;
  }

  const registry = await loadRegistry();
  registry.agents ??= {};
  registry.agentRepos ??= {};
  let removed = 0;

  const firstArg = args[0]!;
  const isRepo = isGitHubShorthand(firstArg) || isProbablyGitUrl(firstArg);
  if (isRepo && !targetFlag) {
    return await removeByRepo(firstArg, registry, dryRun, interactive);
  }

  if (targetFlag) {
    return await removeFromTargetDirect(args, targetFlag, flags, ctx, dryRun);
  }

  for (const name of args) {
    const agentPath = await resolveCentralAgentPath(name);
    if (!agentPath) {
      process.stderr.write(`Not found: ${name}\n`);
      continue;
    }
    if (dryRun) {
      process.stdout.write(`[dry-run] rm ${name} (${agentPath})\n`);
      removed++;
      continue;
    }
    await removeItem(agentPath);
    delete registry.agents[name];
    const repoDeleted = removeAgentFromRepo(registry, name);
    if (repoDeleted) process.stdout.write('(Removed empty repo record)\n');
    removed++;
    process.stdout.write(`Removed: ${name}\n`);
  }

  if (!dryRun) await saveRegistry(registry);
  return removed > 0 ? 0 : 1;
}

async function interactiveRemove(flags: ParsedFlags, ctx: CliRunContext): Promise<number> {
  const adapters = filterAgentAdapters(getAdapters());
  const targetOptions = [
    { label: 'Central', value: CENTRAL_VALUE },
    ...adapters.map((a) => ({ label: getColoredLabel(a), value: a.id })),
  ];

  const selectedTargets = await promptMultiSelect({
    message: 'Select where to remove from:',
    options: targetOptions,
  });
  if (selectedTargets.length === 0) {
    process.stdout.write('Cancelled.\n');
    return 0;
  }

  const hasCentral = selectedTargets.includes(CENTRAL_VALUE);
  const toolTargetIds = selectedTargets.filter((t) => t !== CENTRAL_VALUE);

  if (hasCentral) await interactiveRemoveCentral(ctx, toolTargetIds);
  if (toolTargetIds.length > 0) await interactiveRemoveFromTools(toolTargetIds, flags, ctx);
  return 0;
}

async function interactiveRemoveCentral(ctx: CliRunContext, pendingToolTargets: string[]): Promise<void> {
  const agents = await listCentralAgentItems();
  if (agents.length === 0) {
    process.stdout.write('(no central agents installed)\n');
    return;
  }

  const selected = await promptMultiSelect({
    message: `Select central agents to remove (${agents.length} available):`,
    options: agents.map((agent) => ({ label: agent.name, value: agent.name })),
  });
  if (selected.length === 0) return;

  const confirmed = await promptConfirm({
    message: `Remove ${selected.length} central agent(s)?`,
    default: false,
  });
  if (!confirmed) return;

  const registry = await loadRegistry();
  registry.agents ??= {};
  registry.agentRepos ??= {};

  for (const name of selected) {
    const agentPath = await resolveCentralAgentPath(name);
    if (!agentPath) continue;
    await removeItem(agentPath);
    delete registry.agents[name];
    removeAgentFromRepo(registry, name);
    process.stdout.write(`Removed: ${name}\n`);
  }
  await saveRegistry(registry);

  await promptCascadeDelete(selected, ctx, pendingToolTargets);
}

async function promptCascadeDelete(
  agentNames: string[],
  ctx: CliRunContext,
  excludeTargets: string[],
): Promise<void> {
  const config = await loadConfig();
  const allCopies = await findSyncedAgentCopies({
    agentNames,
    config,
    currentCwd: ctx.cwd,
  });

  const copies = allCopies.filter((c) => !excludeTargets.includes(c.adapterId));
  if (copies.length === 0) return;

  process.stdout.write(`\n${ANSI.yellow}Synced copies found in other targets:${ANSI.reset}\n`);
  for (const c of copies) {
    process.stdout.write(`  ${c.agentName} -> ${c.adapterLabel} (${c.scope})\n`);
  }
  process.stdout.write('\n');

  const action = await promptSelect({
    message: 'Remove synced copies too?',
    options: [
      { label: 'Yes, remove all synced copies', value: 'all' },
      { label: 'Select which to remove', value: 'select' },
      { label: 'No, keep synced copies', value: 'no' },
    ],
  });

  if (action === 'no') return;

  let toRemove: SyncedAgentCopy[];
  if (action === 'all') {
    toRemove = copies;
  } else {
    const selectedIndices = await promptMultiSelect({
      message: 'Select synced copies to remove:',
      options: copies.map((c, i) => ({
        label: `${c.agentName} -> ${c.adapterLabel} (${c.scope})`,
        value: String(i),
      })),
      defaultSelected: 'all',
    });
    if (selectedIndices.length === 0) return;
    toRemove = selectedIndices.map((i) => copies[Number(i)]!);
  }

  const syncState = await loadSyncState();
  for (const c of toRemove) {
    if (!(await pathExists(c.path))) continue;
    await removeItem(c.path);

    const contextId = makeContextId({
      target: c.adapterId,
      scope: c.scope,
      projectRoot: c.projectRoot,
    });
    const context = syncState.contexts[contextId];
    if (context?.agents) delete context.agents[c.agentName];

    process.stdout.write(`Removed: ${c.agentName} (${c.adapterLabel})\n`);
  }
  await saveSyncState(syncState);
}

async function interactiveRemoveFromTools(
  toolTargetIds: string[],
  flags: ParsedFlags,
  ctx: CliRunContext,
): Promise<void> {
  const adapters = filterAgentAdapters(getAdapters());
  const selectedAdapters = adapters.filter((a) => toolTargetIds.includes(a.id));

  const config = await loadConfig();
  const allAgents = await gatherTargetAgents({
    adapters: selectedAdapters,
    config,
    scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
    cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
    currentCwd: ctx.cwd,
  });

  if (allAgents.length === 0) {
    const targetLabels = selectedAdapters.map((a) => getColoredLabel(a)).join(', ');
    process.stdout.write(`(no agents found in ${targetLabels})\n`);
    return;
  }

  const selected = await promptMultiSelect({
    message: `Select target agents to remove (${allAgents.length} available):`,
    options: allAgents.map((s, i) => ({
      label: `${s.name} (${s.adapterLabel} - ${s.scope})`,
      value: String(i),
    })),
  });
  if (selected.length === 0) return;

  const confirmed = await promptConfirm({
    message: `Remove ${selected.length} agent(s) from targets?`,
    default: false,
  });
  if (!confirmed) return;

  const syncState = await loadSyncState();
  for (const idx of selected) {
    const agent = allAgents[Number(idx)]!;
    if (!(await pathExists(agent.path))) continue;
    await removeItem(agent.path);

    const contextId = makeContextId({
      target: agent.adapterId,
      scope: agent.scope,
      projectRoot: agent.projectRoot,
    });
    const context = syncState.contexts[contextId];
    if (context?.agents) delete context.agents[agent.name];

    process.stdout.write(`Removed: ${agent.name} (${agent.adapterLabel})\n`);
  }
  await saveSyncState(syncState);
}

async function interactiveRemoveFromTarget(flags: ParsedFlags, ctx: CliRunContext): Promise<number> {
  const adapters = filterAgentAdapters(getAdapters());
  const config = await loadConfig();
  const selectedAdapters = await selectTargetAdapters({
    adapters,
    flags,
    interactive: true,
    mode: 'multi',
    promptMessage: 'Select target(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const allAgents = await gatherTargetAgents({
    adapters: selectedAdapters,
    config,
    scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
    cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
    currentCwd: ctx.cwd,
  });

  if (allAgents.length === 0) {
    process.stdout.write('(no agents found in selected targets)\n');
    return 0;
  }

  const selected = await promptMultiSelect({
    message: `Select agents to remove (${allAgents.length} available):`,
    options: allAgents.map((s, i) => ({
      label: `${s.name} (${s.adapterLabel} - ${s.scope})`,
      value: String(i),
    })),
  });
  if (selected.length === 0) return 0;

  const confirmed = await promptConfirm({
    message: `Remove ${selected.length} agent(s) from targets?`,
    default: false,
  });
  if (!confirmed) return 0;

  const syncState = await loadSyncState();
  for (const idx of selected) {
    const agent = allAgents[Number(idx)]!;
    if (!(await pathExists(agent.path))) continue;
    await removeItem(agent.path);

    const contextId = makeContextId({
      target: agent.adapterId,
      scope: agent.scope,
      projectRoot: agent.projectRoot,
    });
    const context = syncState.contexts[contextId];
    if (context?.agents) delete context.agents[agent.name];
    process.stdout.write(`Removed: ${agent.name} (${agent.adapterLabel})\n`);
  }
  await saveSyncState(syncState);
  return 0;
}

async function removeByRepo(
  firstArg: string,
  registry: Awaited<ReturnType<typeof loadRegistry>>,
  dryRun: boolean,
  interactive: boolean,
): Promise<number> {
  const repoUrl = isGitHubShorthand(firstArg) ? `https://github.com/${firstArg}` : firstArg;
  const repoKey = normalizeRepoUrl(repoUrl);
  const repoRecord = registry.agentRepos?.[repoKey];

  if (!repoRecord) {
    process.stderr.write(`Repo not found in registry: ${firstArg}\n`);
    return 1;
  }

  const agents = repoRecord.skills;
  if (agents.length === 0) {
    process.stderr.write(`No agents found for repo: ${firstArg}\n`);
    delete registry.agentRepos![repoKey];
    if (!dryRun) await saveRegistry(registry);
    return 0;
  }

  let agentsToRemove: string[];
  if (interactive) {
    process.stdout.write(`\nRepo: ${repoRecord.url}\n`);
    process.stdout.write(`Agents from this repo: ${agents.length}\n`);
    agentsToRemove = await promptMultiSelect({
      message: 'Select agents to remove:',
      options: agents.map((s) => ({ label: s, value: s })),
      defaultSelected: 'all',
    });
    if (agentsToRemove.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
  } else {
    agentsToRemove = agents;
  }

  let removed = 0;
  for (const name of agentsToRemove) {
    const agentPath = await resolveCentralAgentPath(name);
    if (!agentPath) {
      process.stderr.write(`Not found: ${name}\n`);
      continue;
    }
    if (dryRun) {
      process.stdout.write(`[dry-run] rm ${name} (${agentPath})\n`);
      removed++;
      continue;
    }
    await removeItem(agentPath);
    delete registry.agents?.[name];
    removed++;
    process.stdout.write(`Removed: ${name}\n`);
  }

  if (!dryRun) {
    const remaining = agents.filter((s) => !agentsToRemove.includes(s));
    if (remaining.length === 0) {
      delete registry.agentRepos![repoKey];
      process.stdout.write(`Removed repo record: ${repoRecord.url}\n`);
    } else {
      repoRecord.skills = remaining;
    }
    await saveRegistry(registry);
  }

  return removed > 0 ? 0 : 1;
}

async function removeFromTargetDirect(
  agents: string[],
  targetFlag: string,
  flags: ParsedFlags,
  ctx: CliRunContext,
  dryRun: boolean,
): Promise<number> {
  const adapters = filterAgentAdapters(getAdapters());
  const resolved = resolveAdapter(targetFlag);
  const adapter = resolved && adapters.find((candidate) => candidate.id === resolved.id);
  if (!adapter) {
    process.stderr.write(`Unknown target: ${targetFlag}\n`);
    process.stderr.write(`Known targets: ${adapters.map((a) => a.id).join(', ')}\n`);
    return 1;
  }

  const config = await loadConfig();
  const targetConfig = config.targets[adapter.id];

  const { scope, projectRoot, homeDir } = await resolveTargetContext({
    scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
    cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
    defaultScope: targetConfig?.defaultScope,
    currentCwd: ctx.cwd,
  });

  const destAgentsDir = adapter.resolveAgentsDir({ scope, projectRoot, homeDir });
  if (!dryRun) await ensureDir(destAgentsDir);

  const syncState = await loadSyncState();
  let removed = 0;

  const contextId = makeContextId({
    target: adapter.id,
    scope,
    projectRoot: scope === 'local' ? projectRoot : undefined,
  });
  const context = syncState.contexts[contextId];

  for (const name of agents) {
    const agentPath = await resolveTargetAgentPath(destAgentsDir, name);
    if (!agentPath) {
      process.stderr.write(`Not found in ${targetFlag}: ${name}\n`);
      continue;
    }
    if (dryRun) {
      process.stdout.write(`[dry-run] rm ${name} (${agentPath})\n`);
      removed++;
      continue;
    }
    await removeItem(agentPath);
    if (context?.agents) delete context.agents[name];
    removed++;
    process.stdout.write(`Removed: ${name} (${getColoredLabel(adapter)})\n`);
  }

  if (!dryRun && removed > 0) await saveSyncState(syncState);
  return removed > 0 ? 0 : 1;
}
