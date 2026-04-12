import path from 'node:path';
import fs from 'node:fs/promises';
import {
  listCentralCommands,
  getCentralCommandFile,
  getCentralCommandDir,
  detectCommandForm,
} from '../../core/command-store.js';
import { loadConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry, normalizeRepoUrl, removeCommandFromRepo } from '../../core/registry.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { pathExists, removeDir, ensureDir } from '../../util/fs-utils.js';
import {
  filterCommandAdapters,
  getAdapters,
  getColoredLabel,
  resolveAdapter,
} from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { resolveTargetContext } from '../../util/scope.js';
import { promptMultiSelect, promptReviewConfirm, promptSelect } from '../../util/prompt.js';
import { isProbablyGitUrl, isGitHubShorthand } from '../../util/git-utils.js';
import { ANSI } from '../../util/ansi.js';
import {
  gatherTargetCommands,
  findSyncedCommandCopies,
  type SyncedCommandCopy,
} from './manage-utils.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';
import { formatTargetReviewLine, formatTargetSummaryLines } from '../../util/review-display.js';

// ─── 常量 ────────────────────────────────────────────────────────────────

const CENTRAL_VALUE = '__central__';

// ─── Entry point ────────────────────────────────────────────────────────

export async function cmdCommandsRemove(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  const args = positionals;
  const dryRun = flags['dry-run'] === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  // 无参数 + 无 --target + TTY → 进入交互模式
  if (args.length === 0 && !flags.target && interactive) {
    return await interactiveRemove(flags, ctx);
  }

  // 有 --target 但无参数 + TTY → 交互选择 command
  if (args.length === 0 && flags.target && interactive) {
    return await interactiveRemoveFromTarget(flags, ctx);
  }

  // 无参数 + 非交互 → 报错
  if (args.length === 0) {
    process.stderr.write('Usage: ap commands rm <command|repo>...\n');
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
  let removed = 0;

  const firstArg = args[0]!;
  const isRepo = isGitHubShorthand(firstArg) || isProbablyGitUrl(firstArg);

  if (isRepo && !targetFlag) {
    return await removeByRepo(firstArg, registry, dryRun, interactive);
  }

  // 从目标工具中移除
  if (targetFlag) {
    return await removeFromTargetDirect(args, targetFlag, flags, ctx, dryRun);
  }

  // 从中央仓库中移除
  for (const name of args) {
    const form = await detectCommandForm(name);
    if (!form) {
      process.stderr.write(`Not found: ${name}\n`);
      continue;
    }

    if (dryRun) {
      if (form === 'directory') {
        process.stdout.write(`[dry-run] rm ${name} (dir: ${getCentralCommandDir(name)})\n`);
      } else {
        process.stdout.write(`[dry-run] rm ${name} (file: ${getCentralCommandFile(name)})\n`);
      }
      removed++;
      continue;
    }

    if (form === 'directory') {
      const dirPath = getCentralCommandDir(name);
      if (await pathExists(dirPath)) {
        await removeDir(dirPath);
      }
    } else {
      const mdPath = getCentralCommandFile(name);
      const resourceDirPath = path.join(path.dirname(mdPath), name);
      if (await pathExists(mdPath)) await fs.rm(mdPath, { force: true });
      if (await pathExists(resourceDirPath)) await removeDir(resourceDirPath);
    }

    delete registry.commands![name];
    const repoDeleted = removeCommandFromRepo(registry, name);
    if (repoDeleted) {
      process.stdout.write('(Removed empty repo record)\n');
    }
    removed++;
    process.stdout.write(`Removed: ${name}\n`);
  }

  if (!dryRun) await saveRegistry(registry);
  return removed > 0 ? 0 : 1;
}

// ─── 全交互模式：多选目标（含 Central）──────────────────────────────────

async function interactiveRemove(flags: ParsedFlags, ctx: CliRunContext): Promise<number> {
  const adapters = filterCommandAdapters(getAdapters());

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

  if (hasCentral) {
    await interactiveRemoveCentral(ctx, toolTargetIds);
  }

  if (toolTargetIds.length > 0) {
    await interactiveRemoveFromTools(toolTargetIds, flags, ctx);
  }

  return 0;
}

// ─── Phase A: 交互式中央删除（含级联提示）─────────────────────────────────

async function interactiveRemoveCentral(ctx: CliRunContext, pendingToolTargets: string[]): Promise<void> {
  const commands = await listCentralCommands();
  if (commands.length === 0) {
    process.stdout.write('(no central commands installed)\n');
    return;
  }

  const selected = await promptMultiSelect({
    message: `Select central commands to remove (${commands.length} available):`,
    options: commands.map((c) => ({ label: `${c.name} (${c.form})`, value: c.name })),
  });
  if (selected.length === 0) return;

  const confirmed = await promptReviewConfirm({
    message: `Remove ${selected.length} central command(s)?`,
    summaryLines: [`Source: central commands`, `Selected: ${selected.length}`],
    detailLines: selected,
    default: false,
  });
  if (!confirmed) return;

  const registry = await loadRegistry();
  for (const name of selected) {
    const form = await detectCommandForm(name);
    if (!form) continue;

    if (form === 'directory') {
      const dirPath = getCentralCommandDir(name);
      if (await pathExists(dirPath)) await removeDir(dirPath);
    } else {
      const mdPath = getCentralCommandFile(name);
      const resourceDirPath = path.join(path.dirname(mdPath), name);
      if (await pathExists(mdPath)) await fs.rm(mdPath, { force: true });
      if (await pathExists(resourceDirPath)) await removeDir(resourceDirPath);
    }
    delete registry.commands![name];
    removeCommandFromRepo(registry, name);
    process.stdout.write(`Removed: ${name}\n`);
  }
  await saveRegistry(registry);

  await promptCascadeDelete(selected, ctx, pendingToolTargets);
}

/**
 * 级联删除：扫描目标工具中的同步副本，提示用户是否一起删除。
 */
async function promptCascadeDelete(
  commandNames: string[],
  ctx: CliRunContext,
  excludeTargets: string[],
): Promise<void> {
  const config = await loadConfig();
  const allCopies = await findSyncedCommandCopies({
    commandNames,
    config,
    currentCwd: ctx.cwd,
  });

  const copies = allCopies.filter((c) => !excludeTargets.includes(c.adapterId));

  if (copies.length === 0) return;

  process.stdout.write(`\n${ANSI.yellow}Synced copies found in other targets:${ANSI.reset}\n`);
  for (const c of copies) {
    process.stdout.write(`  ${c.commandName} -> ${c.adapterLabel} (${c.scope})\n`);
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

  let toRemove: SyncedCommandCopy[];
  if (action === 'all') {
    toRemove = copies;
  } else {
    const selectedIndices = await promptMultiSelect({
      message: 'Select synced copies to remove:',
      options: copies.map((c, i) => ({
        label: `${c.commandName} -> ${c.adapterLabel} (${c.scope})`,
        value: String(i),
      })),
      defaultSelected: 'all',
    });
    if (selectedIndices.length === 0) return;
    toRemove = selectedIndices.map((i) => copies[Number(i)]!);
  }

  const syncState = await loadSyncState();
  for (const c of toRemove) {
    if (await pathExists(c.mdPath)) await fs.rm(c.mdPath, { force: true });
    if (c.resourceDirPath && (await pathExists(c.resourceDirPath))) {
      await removeDir(c.resourceDirPath);
    }

    const contextId = makeContextId({
      target: c.adapterId,
      scope: c.scope,
      projectRoot: c.projectRoot,
    });
    const context = syncState.contexts[contextId];
    if (context?.commands) delete context.commands[c.commandName];

    process.stdout.write(`Removed: ${c.commandName} (${c.adapterLabel})\n`);
  }
  await saveSyncState(syncState);
}

// ─── Phase B: 交互式工具目标删除 ────────────────────────────────────────

async function interactiveRemoveFromTools(
  toolTargetIds: string[],
  flags: ParsedFlags,
  ctx: CliRunContext,
): Promise<void> {
  const adapters = filterCommandAdapters(getAdapters());
  const selectedAdapters = adapters.filter((a) => toolTargetIds.includes(a.id));

  const config = await loadConfig();
  const allCommands = await gatherTargetCommands({
    adapters: selectedAdapters,
    config,
    scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
    cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
    currentCwd: ctx.cwd,
  });

  if (allCommands.length === 0) {
    const targetLabels = selectedAdapters.map((a) => getColoredLabel(a)).join(', ');
    process.stdout.write(`(no commands found in ${targetLabels})\n`);
    return;
  }

  const selected = await promptMultiSelect({
    message: `Select target commands to remove (${allCommands.length} available):`,
    options: allCommands.map((c, i) => ({
      label: `${c.name} (${c.adapterLabel} - ${c.scope})`,
      value: String(i),
    })),
  });
  if (selected.length === 0) return;

  const selectedCommands = selected.map((idx) => allCommands[Number(idx)]!);
  const confirmed = await promptReviewConfirm({
    message: `Remove ${selectedCommands.length} command(s) from targets?`,
    summaryLines: [
      `Selected: ${selectedCommands.length}`,
      ...formatTargetSummaryLines(
        selectedCommands.map((command) => ({
          targetLabel: command.adapterLabel,
          scope: command.scope,
        })),
      ),
    ],
    detailLines: selectedCommands.map((command) =>
      formatTargetReviewLine(command.name, command.adapterLabel, command.scope),
    ),
    default: false,
  });
  if (!confirmed) return;

  const syncState = await loadSyncState();
  for (const cmd of selectedCommands) {
    if (await pathExists(cmd.mdPath)) await fs.rm(cmd.mdPath, { force: true });
    if (cmd.resourceDirPath && (await pathExists(cmd.resourceDirPath))) {
      await removeDir(cmd.resourceDirPath);
    }

    const contextId = makeContextId({
      target: cmd.adapterId,
      scope: cmd.scope,
      projectRoot: cmd.projectRoot,
    });
    const context = syncState.contexts[contextId];
    if (context?.commands) delete context.commands[cmd.name];

    process.stdout.write(`Removed: ${cmd.name} (${cmd.adapterLabel})\n`);
  }
  await saveSyncState(syncState);
}

// ─── --target + TTY（无参数时交互选择 command）───────────────────────────

async function interactiveRemoveFromTarget(flags: ParsedFlags, ctx: CliRunContext): Promise<number> {
  const adapters = filterCommandAdapters(getAdapters());
  const config = await loadConfig();
  const selectedAdapters = await selectTargetAdapters({
    adapters,
    flags,
    interactive: true,
    mode: 'multi',
    promptMessage: 'Select target(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const allCommands = await gatherTargetCommands({
    adapters: selectedAdapters,
    config,
    scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
    cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
    currentCwd: ctx.cwd,
  });

  if (allCommands.length === 0) {
    process.stdout.write('(no commands found in selected targets)\n');
    return 0;
  }

  const selected = await promptMultiSelect({
    message: `Select commands to remove (${allCommands.length} available):`,
    options: allCommands.map((c, i) => ({
      label: `${c.name} (${c.adapterLabel} - ${c.scope})`,
      value: String(i),
    })),
  });
  if (selected.length === 0) return 0;

  const selectedCommands = selected.map((idx) => allCommands[Number(idx)]!);
  const confirmed = await promptReviewConfirm({
    message: `Remove ${selectedCommands.length} command(s) from targets?`,
    summaryLines: [
      `Selected: ${selectedCommands.length}`,
      ...formatTargetSummaryLines(
        selectedCommands.map((command) => ({
          targetLabel: command.adapterLabel,
          scope: command.scope,
        })),
      ),
    ],
    detailLines: selectedCommands.map((command) =>
      formatTargetReviewLine(command.name, command.adapterLabel, command.scope),
    ),
    default: false,
  });
  if (!confirmed) return 0;

  const syncState = await loadSyncState();
  for (const cmd of selectedCommands) {
    if (await pathExists(cmd.mdPath)) await fs.rm(cmd.mdPath, { force: true });
    if (cmd.resourceDirPath && (await pathExists(cmd.resourceDirPath))) {
      await removeDir(cmd.resourceDirPath);
    }

    const contextId = makeContextId({
      target: cmd.adapterId,
      scope: cmd.scope,
      projectRoot: cmd.projectRoot,
    });
    const context = syncState.contexts[contextId];
    if (context?.commands) delete context.commands[cmd.name];

    process.stdout.write(`Removed: ${cmd.name} (${cmd.adapterLabel})\n`);
  }
  await saveSyncState(syncState);
  return 0;
}

// ─── Repo removal (non-interactive path) ────────────────────────────────

async function removeByRepo(
  firstArg: string,
  registry: Awaited<ReturnType<typeof loadRegistry>>,
  dryRun: boolean,
  interactive: boolean,
): Promise<number> {
  const repoUrl = isGitHubShorthand(firstArg) ? `https://github.com/${firstArg}` : firstArg;
  const repoKey = normalizeRepoUrl(repoUrl);
  const repoRecord = registry.commandRepos?.[repoKey];

  if (!repoRecord) {
    process.stderr.write(`Repo not found in registry: ${firstArg}\n`);
    return 1;
  }

  const commands = repoRecord.skills;
  if (commands.length === 0) {
    process.stderr.write(`No commands found for repo: ${firstArg}\n`);
    delete registry.commandRepos![repoKey];
    if (!dryRun) await saveRegistry(registry);
    return 0;
  }

  let commandsToRemove: string[];
  if (interactive) {
    process.stdout.write(`\nRepo: ${repoRecord.url}\n`);
    process.stdout.write(`Commands from this repo: ${commands.length}\n`);

    commandsToRemove = await promptMultiSelect({
      message: 'Select commands to remove:',
      options: commands.map((c) => ({ label: c, value: c })),
      defaultSelected: 'all',
    });

    if (commandsToRemove.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
  } else {
    commandsToRemove = commands;
  }

  let removed = 0;
  for (const name of commandsToRemove) {
    const form = await detectCommandForm(name);
    if (!form) {
      process.stderr.write(`Not found: ${name}\n`);
      continue;
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] rm ${name}\n`);
      removed++;
      continue;
    }

    if (form === 'directory') {
      const dirPath = getCentralCommandDir(name);
      if (await pathExists(dirPath)) await removeDir(dirPath);
    } else {
      const mdPath = getCentralCommandFile(name);
      const resourceDirPath = path.join(path.dirname(mdPath), name);
      if (await pathExists(mdPath)) await fs.rm(mdPath, { force: true });
      if (await pathExists(resourceDirPath)) await removeDir(resourceDirPath);
    }
    delete registry.commands![name];
    removed++;
    process.stdout.write(`Removed: ${name}\n`);
  }

  if (!dryRun) {
    const remaining = commands.filter((c) => !commandsToRemove.includes(c));
    if (remaining.length === 0) {
      delete registry.commandRepos![repoKey];
      process.stdout.write(`Removed repo record: ${repoRecord.url}\n`);
    } else {
      repoRecord.skills = remaining;
    }
    await saveRegistry(registry);
  }

  return removed > 0 ? 0 : 1;
}

// ─── Direct target removal (non-interactive path) ────────────────────────

async function removeFromTargetDirect(
  commandNames: string[],
  targetFlag: string,
  flags: ParsedFlags,
  ctx: CliRunContext,
  dryRun: boolean,
): Promise<number> {
  const adapters = filterCommandAdapters(getAdapters());
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

  const destCommandsDir = adapter.resolveCommandsDir({ scope, projectRoot, homeDir });

  if (!dryRun) await ensureDir(destCommandsDir);

  const syncState = await loadSyncState();
  const contextId = makeContextId({
    target: adapter.id,
    scope,
    projectRoot: scope === 'local' ? projectRoot : undefined,
  });
  const context = syncState.contexts[contextId];

  let removed = 0;
  for (const name of commandNames) {
    const mdPath = path.join(destCommandsDir, `${name}.md`);
    const resourceDirPath = path.join(destCommandsDir, name);

    if (!(await pathExists(mdPath)) && !(await pathExists(resourceDirPath))) {
      process.stderr.write(`Not found in target: ${name}\n`);
      continue;
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] rm ${name} (${destCommandsDir})\n`);
      removed++;
      continue;
    }

    if (await pathExists(mdPath)) await fs.rm(mdPath, { force: true });
    if (await pathExists(resourceDirPath)) await removeDir(resourceDirPath);
    if (context?.commands) delete context.commands[name];
    removed++;
    process.stdout.write(`Removed from ${getColoredLabel(adapter)} (${scope}): ${name}\n`);
  }

  if (!dryRun) await saveSyncState(syncState);
  return removed > 0 ? 0 : 1;
}
