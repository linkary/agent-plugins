/**
 * rules rm — item 级规则移除.
 *
 * rm 是唯一能删除规则的操作 (collect/sync 只增不减).
 *
 * 路由:
 *   1. 无参数 + TTY → 交互式选择 (中心或目标)
 *   2. 参数是 repo URL → 按 repo 移除文件 (不变)
 *   3. --target → 从目标的全局规则中移除匹配 items
 *   4. 参数匹配中心规则文件 → 删除文件 (不变)
 *   5. 参数匹配中心 _global.json items → 移除 items
 */
import path from 'node:path';
import os from 'node:os';
import { loadRegistry, saveRegistry, normalizeRepoUrl, removeRuleFromRepo } from '../../core/registry.js';
import { listCentralRules, getCentralRulePath, readCentralGlobalRuleItems, writeCentralGlobalRuleItems } from '../../core/rule-store.js';
import { getCentralRulesDir } from '../../util/apg-paths.js';
import { pathExists } from '../../util/fs-utils.js';
import {
  filterRuleAdapters,
  getAdapters,
  getColoredLabel,
  resolveAdapter,
  type TargetId,
} from '../../targets/adapters.js';
import { resolveTargetContext } from '../../util/scope.js';
import { promptConfirm, promptMultiSelect } from '../../util/prompt.js';
import { isGitHubShorthand, isProbablyGitUrl } from '../../util/git-utils.js';
import { ANSI } from '../../util/ansi.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { InvalidRulePathError, normalizeRulePath, removeFileAndEmptyParents } from '../../util/rule-utils.js';
import {
  getGlobalRulesStore,
  shortHash,
  displayItem,
  type RuleItem,
} from '../../util/global-rules-store.js';
import { loadConfig } from '../../core/config.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

const CENTRAL_VALUE = '__central__';

// ---------------------------------------------------------------------------
// Item 匹配: 精确内容 / hash 前缀 / 首行子串
// ---------------------------------------------------------------------------

function matchesItem(arg: string, item: RuleItem): boolean {
  if (item.content === arg) return true;
  const sh = shortHash(item.hash);
  if (arg === sh || item.hash === arg) return true;
  const hex = item.hash.indexOf(':') >= 0 ? item.hash.slice(item.hash.indexOf(':') + 1) : item.hash;
  if (arg.length >= 4 && hex.startsWith(arg)) return true;
  // 首行子串匹配 (方便匹配多行 rule)
  const firstLine = item.content.split('\n')[0] ?? '';
  return firstLine.includes(arg);
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export async function cmdRulesRemove(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  const args = positionals;
  const dryRun = flags['dry-run'] === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (args.length === 0 && !flags.target && interactive) {
    return await interactiveRemove(flags, ctx, dryRun);
  }
  if (args.length === 0 && flags.target && interactive) {
    return await interactiveRemoveFromTarget(flags, ctx, dryRun);
  }
  if (args.length === 0) {
    process.stderr.write('Usage: ap rules rm <rule|hash|repo>...\n');
    return 1;
  }

  const targetRaw = flags.target;
  const targetFlag =
    typeof targetRaw === 'string' ? targetRaw : Array.isArray(targetRaw) ? targetRaw[0] : undefined;
  if (Array.isArray(targetRaw) && targetRaw.length > 1) {
    process.stderr.write('rm only supports a single --target. Use separate commands for multiple targets.\n');
    return 1;
  }

  // repo URL → 文件级移除 (不变)
  const firstArg = args[0]!;
  const isRepo = isGitHubShorthand(firstArg) || isProbablyGitUrl(firstArg);
  if (isRepo && !targetFlag) {
    const registry = await loadRegistry();
    registry.rules ??= {};
    registry.ruleRepos ??= {};
    return await removeByRepo(firstArg, registry, dryRun, interactive);
  }

  // --target → 从目标全局规则中移除 items
  if (targetFlag) {
    return await removeFromTarget(args, targetFlag, flags, ctx, dryRun);
  }

  // 无 target: 先尝试文件路径, 再尝试全局 item 匹配
  return await removeFromCentral(args, dryRun);
}

// ---------------------------------------------------------------------------
// 中心移除: 文件路径 → 全局 items
// ---------------------------------------------------------------------------

async function removeFromCentral(args: string[], dryRun: boolean): Promise<number> {
  const registry = await loadRegistry();
  registry.rules ??= {};
  registry.ruleRepos ??= {};

  let centralItems: RuleItem[] | null = null;
  let centralDirty = false;
  let removed = 0;

  for (const raw of args) {
    // 尝试文件路径
    let matchedFile = false;
    try {
      const name = normalizeRulePath(raw);
      const fullPath = getCentralRulePath(name);
      if (await pathExists(fullPath)) {
        if (dryRun) {
          process.stdout.write(`${ANSI.dim}[dry-run]${ANSI.reset} rm ${name} (${fullPath})\n`);
        } else {
          await removeFileAndEmptyParents(fullPath, getCentralRulesDir());
          delete registry.rules[name];
          removeRuleFromRepo(registry, name);
          process.stdout.write(`Removed file: ${name}\n`);
        }
        removed++;
        matchedFile = true;
      }
    } catch (err) {
      if (!(err instanceof InvalidRulePathError)) throw err;
    }
    if (matchedFile) continue;

    // 尝试全局 item 匹配
    centralItems ??= await readCentralGlobalRuleItems();
    const before = centralItems.length;
    centralItems = centralItems.filter((item) => !matchesItem(raw, item));
    const delta = before - centralItems.length;
    if (delta === 0) {
      process.stderr.write(`Not found: ${raw}\n`);
      continue;
    }
    removed += delta;
    centralDirty = true;
    process.stdout.write(`Removed ${delta} rule(s) matching: ${raw}\n`);
  }

  if (!dryRun) {
    if (centralDirty && centralItems) await writeCentralGlobalRuleItems(centralItems);
    await saveRegistry(registry);
  }

  if (removed > 0) {
    process.stdout.write(`\n${ANSI.dim}Tip: run ${ANSI.reset}${ANSI.bold}ap rules sync${ANSI.reset}${ANSI.dim} to propagate changes to targets.${ANSI.reset}\n`);
  }
  return removed > 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// 目标移除: 全局 item 级
// ---------------------------------------------------------------------------

async function removeFromTarget(
  args: string[],
  targetFlag: string,
  flags: ParsedFlags,
  ctx: CliRunContext,
  dryRun: boolean,
): Promise<number> {
  const adapters = filterRuleAdapters(getAdapters());
  const resolved = resolveAdapter(targetFlag);
  const adapter = resolved && adapters.find((c) => c.id === resolved.id);
  if (!adapter) {
    process.stderr.write(`Unknown target: ${targetFlag}\n`);
    process.stderr.write(`Known targets: ${adapters.map((a) => a.id).join(', ')}\n`);
    return 1;
  }

  const homeDir = os.homedir();
  const config = await loadConfig();
  const targetConfig = config.targets[adapter.id];
  const { scope, projectRoot } = await resolveTargetContext({
    scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
    cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
    defaultScope: targetConfig?.defaultScope,
    currentCwd: ctx.cwd,
  });

  // 全局 → item 级移除
  if (scope === 'global') {
    const store = getGlobalRulesStore(adapter.id, homeDir);
    if (!store) {
      process.stderr.write(`${adapter.label} has no global rules store.\n`);
      return 1;
    }

    let items = await store.readItems();
    let removed = 0;

    for (const raw of args) {
      const before = items.length;
      items = items.filter((item) => !matchesItem(raw, item));
      const delta = before - items.length;
      if (delta === 0) {
        process.stderr.write(`Not found in ${adapter.label}: ${raw}\n`);
        continue;
      }
      removed += delta;
      if (dryRun) {
        process.stdout.write(`${ANSI.dim}[dry-run]${ANSI.reset} rm ${delta} rule(s): ${raw}\n`);
      } else {
        process.stdout.write(`Removed ${delta} rule(s) from ${adapter.label}: ${raw}\n`);
      }
    }

    if (!dryRun && removed > 0) await store.writeItems(items);
    return removed > 0 ? 0 : 1;
  }

  // 本地 → 文件级移除 (不变)
  const rulesDir = adapter.resolveRulesDir({ scope, projectRoot, homeDir });
  let removed = 0;
  for (const raw of args) {
    let name: string;
    try {
      name = normalizeRulePath(raw);
    } catch (err) {
      if (err instanceof InvalidRulePathError) {
        process.stderr.write(`${err.message}\n`);
        continue;
      }
      throw err;
    }

    const targetPath = path.join(rulesDir, name);
    if (!(await pathExists(targetPath))) {
      process.stderr.write(`Not found in ${adapter.label}: ${name}\n`);
      continue;
    }

    if (dryRun) {
      process.stdout.write(`${ANSI.dim}[dry-run]${ANSI.reset} rm ${name} (${targetPath})\n`);
      removed++;
      continue;
    }

    await removeFileAndEmptyParents(targetPath, rulesDir);
    removed++;
    process.stdout.write(`Removed: ${name} (${adapter.label})\n`);
  }

  return removed > 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// 交互式: 中心 / 目标选择
// ---------------------------------------------------------------------------

async function interactiveRemove(flags: ParsedFlags, ctx: CliRunContext, dryRun: boolean): Promise<number> {
  const adapters = filterRuleAdapters(getAdapters());
  const options = [
    { label: 'Central (_global.json)', value: CENTRAL_VALUE },
    ...adapters.map((a) => ({ label: getColoredLabel(a), value: a.id })),
  ];

  const selectedTargets = await promptMultiSelect({
    message: 'Select where to remove from:',
    options,
  });
  if (selectedTargets.length === 0) {
    process.stdout.write('Cancelled.\n');
    return 0;
  }

  const hasCentral = selectedTargets.includes(CENTRAL_VALUE);
  const toolIds = selectedTargets.filter((t) => t !== CENTRAL_VALUE);

  if (hasCentral) await interactiveRemoveCentralItems(dryRun);
  if (toolIds.length > 0) {
    for (const id of toolIds) {
      await interactiveRemoveTargetItems(id, dryRun);
    }
  }
  return 0;
}

async function interactiveRemoveCentralItems(dryRun: boolean): Promise<void> {
  const items = await readCentralGlobalRuleItems();
  if (items.length === 0) {
    process.stdout.write('(no central global rules)\n');
    return;
  }

  const selected = await promptMultiSelect({
    message: `Select rules to remove (${items.length} available):`,
    options: items.map((item) => ({
      label: `[${shortHash(item.hash)}] ${displayItem(item)}`,
      value: item.hash,
    })),
  });
  if (selected.length === 0) return;

  const confirmed = await promptConfirm({
    message: `Remove ${selected.length} rule(s) from central?`,
    default: false,
  });
  if (!confirmed) return;

  const toRemove = new Set(selected);
  const remaining = items.filter((item) => !toRemove.has(item.hash));
  if (!dryRun) await writeCentralGlobalRuleItems(remaining);

  const removedItems = items.filter((item) => toRemove.has(item.hash));
  const prefix = dryRun ? `${ANSI.dim}[dry-run]${ANSI.reset} ` : '';
  for (const item of removedItems) {
    process.stdout.write(`${prefix}Removed: ${displayItem(item)}\n`);
  }
  process.stdout.write(`\n${ANSI.dim}Tip: run ${ANSI.reset}${ANSI.bold}ap rules sync${ANSI.reset}${ANSI.dim} to propagate changes.${ANSI.reset}\n`);
}

async function interactiveRemoveFromTarget(flags: ParsedFlags, ctx: CliRunContext, dryRun: boolean): Promise<number> {
  const adapters = filterRuleAdapters(getAdapters());
  const selected = await selectTargetAdapters({
    adapters,
    flags,
    interactive: true,
    mode: 'multi',
    promptMessage: 'Select target(s):',
  });
  if (selected.length === 0) return 1;

  for (const adapter of selected) {
    await interactiveRemoveTargetItems(adapter.id, dryRun);
  }
  return 0;
}

async function interactiveRemoveTargetItems(targetId: string, dryRun: boolean): Promise<void> {
  const homeDir = os.homedir();
  const store = getGlobalRulesStore(targetId as TargetId, homeDir);
  if (!store) {
    process.stdout.write(`${ANSI.dim}Skipped ${targetId}: no global rules store${ANSI.reset}\n`);
    return;
  }

  const items = await store.readItems();
  if (items.length === 0) {
    process.stdout.write(`(${targetId}: empty)\n`);
    return;
  }

  const selected = await promptMultiSelect({
    message: `[${targetId}] Select rules to remove (${items.length} available):`,
    options: items.map((item) => ({
      label: `[${shortHash(item.hash)}] ${displayItem(item)}`,
      value: item.hash,
    })),
  });
  if (selected.length === 0) return;

  const confirmed = await promptConfirm({
    message: `Remove ${selected.length} rule(s) from ${targetId}?`,
    default: false,
  });
  if (!confirmed) return;

  const toRemove = new Set(selected);
  const remaining = items.filter((item) => !toRemove.has(item.hash));
  if (!dryRun) await store.writeItems(remaining);

  const prefix = dryRun ? `${ANSI.dim}[dry-run]${ANSI.reset} ` : '';
  const removedItems = items.filter((item) => toRemove.has(item.hash));
  for (const item of removedItems) {
    process.stdout.write(`${prefix}Removed from ${targetId}: ${displayItem(item)}\n`);
  }
}

// ---------------------------------------------------------------------------
// Repo 移除 (文件级, 不变)
// ---------------------------------------------------------------------------

async function removeByRepo(
  firstArg: string,
  registry: Awaited<ReturnType<typeof loadRegistry>>,
  dryRun: boolean,
  interactive: boolean,
): Promise<number> {
  const repoUrl = isGitHubShorthand(firstArg) ? `https://github.com/${firstArg}` : firstArg;
  const repoKey = normalizeRepoUrl(repoUrl);
  const repoRecord = registry.ruleRepos?.[repoKey];

  if (!repoRecord) {
    process.stderr.write(`Repo not found in registry: ${firstArg}\n`);
    return 1;
  }

  const rules = repoRecord.skills;
  if (rules.length === 0) {
    process.stderr.write(`No rules found for repo: ${firstArg}\n`);
    delete registry.ruleRepos![repoKey];
    if (!dryRun) await saveRegistry(registry);
    return 0;
  }

  let rulesToRemove: string[];
  if (interactive) {
    process.stdout.write(`\nRepo: ${repoRecord.url}\n`);
    process.stdout.write(`Rules from this repo: ${rules.length}\n`);
    rulesToRemove = await promptMultiSelect({
      message: 'Select rules to remove:',
      options: rules.map((name) => ({ label: name, value: name })),
      defaultSelected: 'all',
    });
    if (rulesToRemove.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
  } else {
    rulesToRemove = rules;
  }

  let removed = 0;
  for (const name of rulesToRemove) {
    const fullPath = getCentralRulePath(name);
    if (!(await pathExists(fullPath))) {
      process.stderr.write(`Not found: ${name}\n`);
      continue;
    }
    if (dryRun) {
      process.stdout.write(`${ANSI.dim}[dry-run]${ANSI.reset} rm ${name} (${fullPath})\n`);
      removed++;
      continue;
    }
    await removeFileAndEmptyParents(fullPath, getCentralRulesDir());
    delete registry.rules?.[name];
    removed++;
    process.stdout.write(`Removed: ${name}\n`);
  }

  if (!dryRun) {
    const remaining = rules.filter((name) => !rulesToRemove.includes(name));
    if (remaining.length === 0) {
      delete registry.ruleRepos![repoKey];
      process.stdout.write(`Removed repo record: ${repoRecord.url}\n`);
    } else {
      repoRecord.skills = remaining;
    }
    await saveRegistry(registry);
  }

  return removed > 0 ? 0 : 1;
}
