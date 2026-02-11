import path from 'node:path';
import { loadConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry, normalizeRepoUrl, removeSkillFromRepo } from '../../core/registry.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { listCentralSkills, getCentralSkillPath } from '../../core/skill-store.js';
import { ensureDir, pathExists, removeDir } from '../../util/fs-utils.js';
import { getAdapters, getColoredLabel, resolveAdapter } from '../../targets/adapters.js';
import { resolveTargetContext } from '../../util/scope.js';
import { promptConfirm, promptMultiSelect, promptSelect } from '../../util/prompt.js';
import { isProbablyGitUrl, isGitHubShorthand } from '../../util/git-utils.js';
import { ANSI } from '../../util/ansi.js';
import { gatherTargetSkills, findSyncedCopies, type SyncedCopy } from './manage-utils.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

// ─── 常量 ────────────────────────────────────────────────────────────────

const CENTRAL_VALUE = '__central__';

// ─── Entry point ────────────────────────────────────────────────────────

export async function cmdSkillsRemove(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  const args = positionals;
  const dryRun = flags['dry-run'] === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  // 无参数 + 无 --target + TTY → 进入交互模式
  if (args.length === 0 && !flags.target && interactive) {
    return await interactiveRemove(flags, ctx);
  }

  // 有 --target 但无参数 + TTY → 交互选择 skill（保持与 --target 的兼容性）
  if (args.length === 0 && flags.target && interactive) {
    return await interactiveRemoveFromTarget(flags, ctx);
  }

  // 无参数 + 非交互 → 报错
  if (args.length === 0) {
    process.stderr.write('Usage: ap skills rm <skill|repo>...\n');
    return 1;
  }

  // ── 以下为原有的非交互/半交互逻辑 ──

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

  // 检查第一个参数是否是 repo（GitHub shorthand 或 git URL）
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
    const skillPath = getCentralSkillPath(name);
    if (!(await pathExists(skillPath))) {
      process.stderr.write(`Not found: ${name}\n`);
      continue;
    }
    if (dryRun) {
      process.stdout.write(`[dry-run] rm ${name} (${skillPath})\n`);
      removed++;
      continue;
    }
    await removeDir(skillPath);
    delete registry.skills[name];

    const repoDeleted = removeSkillFromRepo(registry, name);
    if (repoDeleted) {
      process.stdout.write(`(Removed empty repo record)\n`);
    }

    removed++;
    process.stdout.write(`Removed: ${name}\n`);
  }

  if (!dryRun) await saveRegistry(registry);
  return removed > 0 ? 0 : 1;
}

// ─── 全交互模式：多选目标（含 Central）──────────────────────────────────

async function interactiveRemove(flags: ParsedFlags, ctx: CliRunContext): Promise<number> {
  const adapters = getAdapters();

  // 第一步：多选目标（Central + 所有适配器）
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

  // Phase A: 处理 Central（如果被选中）
  if (hasCentral) {
    await interactiveRemoveCentral(ctx, toolTargetIds);
  }

  // Phase B: 处理工具目标（如果被选中）
  if (toolTargetIds.length > 0) {
    await interactiveRemoveFromTools(toolTargetIds, flags, ctx);
  }

  return 0;
}

// ─── Phase A: 交互式中央删除（含级联提示）─────────────────────────────────

async function interactiveRemoveCentral(ctx: CliRunContext, pendingToolTargets: string[]): Promise<void> {
  const skills = await listCentralSkills();
  if (skills.length === 0) {
    process.stdout.write('(no central skills installed)\n');
    return;
  }

  const selected = await promptMultiSelect({
    message: `Select central skills to remove (${skills.length} available):`,
    options: skills.map((n) => ({ label: n, value: n })),
  });
  if (selected.length === 0) return;

  const confirmed = await promptConfirm({
    message: `Remove ${selected.length} central skill(s)?`,
    default: false,
  });
  if (!confirmed) return;

  // 执行中央删除
  const registry = await loadRegistry();
  for (const name of selected) {
    const skillPath = getCentralSkillPath(name);
    if (!(await pathExists(skillPath))) continue;
    await removeDir(skillPath);
    delete registry.skills[name];
    removeSkillFromRepo(registry, name);
    process.stdout.write(`Removed: ${name}\n`);
  }
  await saveRegistry(registry);

  // 级联删除提示：扫描所有目标中的同步副本
  // 排除用户即将在 Phase B 中手动处理的目标
  await promptCascadeDelete(selected, ctx, pendingToolTargets);
}

/**
 * 级联删除：扫描目标工具中的同步副本，提示用户是否一起删除。
 * excludeTargets: 用户在 Phase B 中将手动处理的目标 ID，级联提示中跳过这些目标。
 * Side effect: 可能删除目标目录中的 skill 副本并更新 sync-state。
 */
async function promptCascadeDelete(
  skillNames: string[],
  ctx: CliRunContext,
  excludeTargets: string[],
): Promise<void> {
  const config = await loadConfig();
  const allCopies = await findSyncedCopies({
    skillNames,
    config,
    currentCwd: ctx.cwd,
  });

  // 排除用户在同一次 rm 中已选择的工具目标（他们会在 Phase B 自行处理）
  const copies = allCopies.filter((c) => !excludeTargets.includes(c.adapterId));

  if (copies.length === 0) return;

  // 按 skill 分组展示
  process.stdout.write(`\n${ANSI.yellow}Synced copies found in other targets:${ANSI.reset}\n`);
  for (const c of copies) {
    process.stdout.write(`  ${c.skillName} -> ${c.adapterLabel} (${c.scope})\n`);
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

  let toRemove: SyncedCopy[];
  if (action === 'all') {
    toRemove = copies;
  } else {
    const selectedIndices = await promptMultiSelect({
      message: 'Select synced copies to remove:',
      options: copies.map((c, i) => ({
        label: `${c.skillName} -> ${c.adapterLabel} (${c.scope})`,
        value: String(i),
      })),
      defaultSelected: 'all',
    });
    if (selectedIndices.length === 0) return;
    toRemove = selectedIndices.map((i) => copies[Number(i)]!);
  }

  // 执行删除并更新 sync-state
  const syncState = await loadSyncState();
  for (const c of toRemove) {
    if (!(await pathExists(c.path))) continue;
    await removeDir(c.path);

    const contextId = makeContextId({
      target: c.adapterId,
      scope: c.scope,
      projectRoot: c.projectRoot,
    });
    const context = syncState.contexts[contextId];
    if (context?.skills) delete context.skills[c.skillName];

    process.stdout.write(`Removed: ${c.skillName} (${c.adapterLabel})\n`);
  }
  await saveSyncState(syncState);
}

// ─── Phase B: 交互式工具目标删除 ────────────────────────────────────────

async function interactiveRemoveFromTools(
  toolTargetIds: string[],
  flags: ParsedFlags,
  ctx: CliRunContext,
): Promise<void> {
  const adapters = getAdapters();
  const selectedAdapters = adapters.filter((a) => toolTargetIds.includes(a.id));

  const config = await loadConfig();
  const allSkills = await gatherTargetSkills({
    adapters: selectedAdapters,
    config,
    scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
    cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
    currentCwd: ctx.cwd,
  });

  if (allSkills.length === 0) {
    const targetLabels = selectedAdapters.map((a) => getColoredLabel(a)).join(', ');
    process.stdout.write(`(no skills found in ${targetLabels})\n`);
    return;
  }

  const selected = await promptMultiSelect({
    message: `Select target skills to remove (${allSkills.length} available):`,
    options: allSkills.map((s, i) => ({
      label: `${s.name} (${s.adapterLabel} - ${s.scope})`,
      value: String(i),
    })),
  });
  if (selected.length === 0) return;

  const confirmed = await promptConfirm({
    message: `Remove ${selected.length} skill(s) from targets?`,
    default: false,
  });
  if (!confirmed) return;

  const syncState = await loadSyncState();
  for (const idx of selected) {
    const skill = allSkills[Number(idx)]!;
    if (!(await pathExists(skill.path))) continue;
    await removeDir(skill.path);

    const contextId = makeContextId({
      target: skill.adapterId,
      scope: skill.scope,
      projectRoot: skill.projectRoot,
    });
    const context = syncState.contexts[contextId];
    if (context?.skills) delete context.skills[skill.name];

    process.stdout.write(`Removed: ${skill.name} (${skill.adapterLabel})\n`);
  }
  await saveSyncState(syncState);
}

// ─── --target + TTY（无参数时交互选择 skill）────────────────────────────

async function interactiveRemoveFromTarget(flags: ParsedFlags, ctx: CliRunContext): Promise<number> {
  const adapters = getAdapters();
  const config = await loadConfig();
  const selectedAdapters = await selectTargetAdapters({
    adapters,
    flags,
    interactive: true,
    mode: 'multi',
    promptMessage: 'Select target(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const allSkills = await gatherTargetSkills({
    adapters: selectedAdapters,
    config,
    scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
    cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
    currentCwd: ctx.cwd,
  });

  if (allSkills.length === 0) {
    process.stdout.write('(no skills found in selected targets)\n');
    return 0;
  }

  const selected = await promptMultiSelect({
    message: `Select skills to remove (${allSkills.length} available):`,
    options: allSkills.map((s, i) => ({
      label: `${s.name} (${s.adapterLabel} - ${s.scope})`,
      value: String(i),
    })),
  });
  if (selected.length === 0) return 0;

  const confirmed = await promptConfirm({
    message: `Remove ${selected.length} skill(s) from targets?`,
    default: false,
  });
  if (!confirmed) return 0;

  const syncState = await loadSyncState();
  for (const idx of selected) {
    const skill = allSkills[Number(idx)]!;
    if (!(await pathExists(skill.path))) continue;
    await removeDir(skill.path);

    const contextId = makeContextId({
      target: skill.adapterId,
      scope: skill.scope,
      projectRoot: skill.projectRoot,
    });
    const context = syncState.contexts[contextId];
    if (context?.skills) delete context.skills[skill.name];

    process.stdout.write(`Removed: ${skill.name} (${skill.adapterLabel})\n`);
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
  const repoRecord = registry.repos?.[repoKey];

  if (!repoRecord) {
    process.stderr.write(`Repo not found in registry: ${firstArg}\n`);
    return 1;
  }

  const skills = repoRecord.skills;
  if (skills.length === 0) {
    process.stderr.write(`No skills found for repo: ${firstArg}\n`);
    delete registry.repos![repoKey];
    if (!dryRun) await saveRegistry(registry);
    return 0;
  }

  let skillsToRemove: string[];
  if (interactive) {
    process.stdout.write(`\nRepo: ${repoRecord.url}\n`);
    process.stdout.write(`Skills from this repo: ${skills.length}\n`);

    skillsToRemove = await promptMultiSelect({
      message: 'Select skills to remove:',
      options: skills.map((s) => ({ label: s, value: s })),
      defaultSelected: 'all',
    });

    if (skillsToRemove.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
  } else {
    skillsToRemove = skills;
  }

  let removed = 0;
  for (const name of skillsToRemove) {
    const skillPath = getCentralSkillPath(name);
    if (!(await pathExists(skillPath))) {
      process.stderr.write(`Not found: ${name}\n`);
      continue;
    }
    if (dryRun) {
      process.stdout.write(`[dry-run] rm ${name} (${skillPath})\n`);
      removed++;
      continue;
    }
    await removeDir(skillPath);
    delete registry.skills[name];
    removed++;
    process.stdout.write(`Removed: ${name}\n`);
  }

  if (!dryRun) {
    const remaining = skills.filter((s) => !skillsToRemove.includes(s));
    if (remaining.length === 0) {
      delete registry.repos![repoKey];
      process.stdout.write(`Removed repo record: ${repoRecord.url}\n`);
    } else {
      repoRecord.skills = remaining;
    }
    await saveRegistry(registry);
  }

  return removed > 0 ? 0 : 1;
}

// ─── Direct target removal (non-interactive path) ───────────────────────

async function removeFromTargetDirect(
  skills: string[],
  targetFlag: string,
  flags: ParsedFlags,
  ctx: CliRunContext,
  dryRun: boolean,
): Promise<number> {
  const adapters = getAdapters();
  const adapter = resolveAdapter(targetFlag);
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

  const destSkillsDir = adapter.resolveSkillsDir({ scope, projectRoot, homeDir });

  if (!dryRun) await ensureDir(destSkillsDir);

  const syncState = await loadSyncState();
  const contextId = makeContextId({
    target: adapter.id,
    scope,
    projectRoot: scope === 'local' ? projectRoot : undefined,
  });
  const context = syncState.contexts[contextId];

  let removed = 0;
  for (const name of skills) {
    const skillPath = path.join(destSkillsDir, name);
    if (!(await pathExists(skillPath))) {
      process.stderr.write(`Not found in target: ${name}\n`);
      continue;
    }
    if (dryRun) {
      process.stdout.write(`[dry-run] rm ${name} (${skillPath})\n`);
      removed++;
      continue;
    }
    await removeDir(skillPath);
    if (context?.skills) delete context.skills[name];
    removed++;
    process.stdout.write(`Removed from ${getColoredLabel(adapter)} (${scope}): ${name}\n`);
  }

  if (!dryRun) await saveSyncState(syncState);
  return removed > 0 ? 0 : 1;
}
