import path from 'node:path';
import { loadConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry, normalizeRepoUrl, removeRuleFromRepo } from '../../core/registry.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { listCentralRules, getCentralRulePath } from '../../core/rule-store.js';
import { getCentralRulesDir } from '../../util/apg-paths.js';
import { pathExists } from '../../util/fs-utils.js';
import {
  filterRuleAdapters,
  getAdapters,
  getColoredLabel,
  resolveAdapter,
  type TargetAdapter,
} from '../../targets/adapters.js';
import { resolveTargetContext } from '../../util/scope.js';
import { promptConfirm, promptMultiSelect, promptSelect } from '../../util/prompt.js';
import { isGitHubShorthand, isProbablyGitUrl } from '../../util/git-utils.js';
import { ANSI } from '../../util/ansi.js';
import { gatherTargetRules, findSyncedRuleCopies, type SyncedRuleCopy } from './manage-utils.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { InvalidRulePathError, normalizeRulePath, removeFileAndEmptyParents } from '../../util/rule-utils.js';
import { canonicalRuleIdFromPath } from '../../util/rule-transform.js';
import {
  parseManagedCursorUserRules,
  readCursorUserRules,
  renderCursorUserRulesText,
  writeCursorUserRules,
} from '../../util/cursor-user-rules.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

const CENTRAL_VALUE = '__central__';

export async function cmdRulesRemove(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
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
    process.stderr.write('Usage: ap rules rm <rule|repo>...\n');
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
  registry.rules ??= {};
  registry.ruleRepos ??= {};

  const firstArg = args[0]!;
  const isRepo = isGitHubShorthand(firstArg) || isProbablyGitUrl(firstArg);
  if (isRepo && !targetFlag) {
    return await removeByRepo(firstArg, registry, dryRun, interactive);
  }

  if (targetFlag) {
    return await removeFromTargetDirect(args, targetFlag, flags, ctx, dryRun);
  }

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

    const fullPath = getCentralRulePath(name);
    if (!(await pathExists(fullPath))) {
      process.stderr.write(`Not found: ${name}\n`);
      continue;
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] rm ${name} (${fullPath})\n`);
      removed++;
      continue;
    }

    await removeFileAndEmptyParents(fullPath, getCentralRulesDir());
    delete registry.rules[name];
    removeRuleFromRepo(registry, name);
    removed++;
    process.stdout.write(`Removed: ${name}\n`);
  }

  if (!dryRun) await saveRegistry(registry);
  return removed > 0 ? 0 : 1;
}

async function interactiveRemove(flags: ParsedFlags, ctx: CliRunContext): Promise<number> {
  const adapters = filterRuleAdapters(getAdapters());
  const targetOptions = [
    { label: 'Central', value: CENTRAL_VALUE },
    ...adapters.map((adapter) => ({ label: getColoredLabel(adapter), value: adapter.id })),
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
  const toolTargetIds = selectedTargets.filter((target) => target !== CENTRAL_VALUE);

  if (hasCentral) await interactiveRemoveCentral(ctx, toolTargetIds);
  if (toolTargetIds.length > 0) await interactiveRemoveFromTools(toolTargetIds, flags, ctx);
  return 0;
}

async function interactiveRemoveCentral(ctx: CliRunContext, pendingToolTargets: string[]): Promise<void> {
  const rules = await listCentralRules();
  if (rules.length === 0) {
    process.stdout.write('(no central rules installed)\n');
    return;
  }

  const selected = await promptMultiSelect({
    message: `Select central rules to remove (${rules.length} available):`,
    options: rules.map((name) => ({ label: name, value: name })),
  });
  if (selected.length === 0) return;

  const confirmed = await promptConfirm({
    message: `Remove ${selected.length} central rule(s)?`,
    default: false,
  });
  if (!confirmed) return;

  const registry = await loadRegistry();
  registry.rules ??= {};
  registry.ruleRepos ??= {};

  for (const name of selected) {
    const fullPath = getCentralRulePath(name);
    if (!(await pathExists(fullPath))) continue;
    await removeFileAndEmptyParents(fullPath, getCentralRulesDir());
    delete registry.rules[name];
    removeRuleFromRepo(registry, name);
    process.stdout.write(`Removed: ${name}\n`);
  }
  await saveRegistry(registry);

  await promptCascadeDelete(selected, ctx, pendingToolTargets);
}

async function promptCascadeDelete(ruleNames: string[], ctx: CliRunContext, excludeTargets: string[]): Promise<void> {
  const config = await loadConfig();
  const allCopies = await findSyncedRuleCopies({
    ruleNames,
    config,
    currentCwd: ctx.cwd,
  });
  const copies = allCopies.filter((copy) => !excludeTargets.includes(copy.adapterId));

  if (copies.length === 0) return;

  process.stdout.write(`\n${ANSI.yellow}Synced copies found in other targets:${ANSI.reset}\n`);
  for (const copy of copies) {
    process.stdout.write(`  ${copy.ruleName} -> ${copy.adapterLabel} (${copy.scope})\n`);
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

  let toRemove: SyncedRuleCopy[];
  if (action === 'all') {
    toRemove = copies;
  } else {
    const selectedIndices = await promptMultiSelect({
      message: 'Select synced copies to remove:',
      options: copies.map((copy, i) => ({
        label: `${copy.ruleName} -> ${copy.adapterLabel} (${copy.scope})`,
        value: String(i),
      })),
      defaultSelected: 'all',
    });
    if (selectedIndices.length === 0) return;
    toRemove = selectedIndices.map((i) => copies[Number(i)]!);
  }

  const syncState = await loadSyncState();
  const cursorUserRulesCache = new Map<string, { homeDir: string; originalText: string; rules: Map<string, string> }>();
  for (const copy of toRemove) {
    if (copy.storageType === 'cursor-user-rules' && copy.homeDir && copy.ruleId) {
      const cacheKey = `${copy.adapterId}:${copy.scope}:${copy.homeDir}`;
      let cache = cursorUserRulesCache.get(cacheKey);
      if (!cache) {
        const originalText = (await readCursorUserRules(copy.homeDir)) ?? '';
        const rules = new Map(
          parseManagedCursorUserRules(originalText).map((rule) => [rule.id, rule.content] as const),
        );
        cache = { homeDir: copy.homeDir, originalText, rules };
        cursorUserRulesCache.set(cacheKey, cache);
      }
      if (!cache.rules.has(copy.ruleId)) continue;
      cache.rules.delete(copy.ruleId);
    } else {
      if (!(await pathExists(copy.path))) continue;
      await removeFileAndEmptyParents(copy.path, copy.rulesDir);
    }

    const contextId = makeContextId({
      target: copy.adapterId,
      scope: copy.scope,
      projectRoot: copy.projectRoot,
    });
    const context = syncState.contexts[contextId];
    if (context?.rules) delete context.rules[copy.ruleName];

    process.stdout.write(`Removed: ${copy.ruleName} (${copy.adapterLabel})\n`);
  }
  for (const cache of cursorUserRulesCache.values()) {
    const mergedText = renderCursorUserRulesText(cache.originalText, cache.rules);
    await writeCursorUserRules(cache.homeDir, mergedText);
  }
  await saveSyncState(syncState);
}

/** 从目标中选择并移除规则的通用流程，供多处复用。 */
async function promptAndRemoveTargetRules(params: {
  adapters: TargetAdapter[];
  flags: ParsedFlags;
  ctx: CliRunContext;
}): Promise<{ removed: boolean; cancelled: boolean }> {
  const { adapters: selectedAdapters, flags, ctx } = params;
  const config = await loadConfig();
  const allRules = await gatherTargetRules({
    adapters: selectedAdapters,
    config,
    scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
    cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
    currentCwd: ctx.cwd,
  });

  if (allRules.length === 0) {
    const targetLabels = selectedAdapters.map((adapter) => getColoredLabel(adapter)).join(', ');
    process.stdout.write(`(no rules found in ${targetLabels})\n`);
    return { removed: false, cancelled: false };
  }

  const selected = await promptMultiSelect({
    message: `Select rules to remove (${allRules.length} available):`,
    options: allRules.map((rule, i) => ({
      label: `${rule.name} (${rule.adapterLabel} - ${rule.scope})`,
      value: String(i),
    })),
  });
  if (selected.length === 0) return { removed: false, cancelled: true };

  const confirmed = await promptConfirm({
    message: `Remove ${selected.length} rule(s) from targets?`,
    default: false,
  });
  if (!confirmed) return { removed: false, cancelled: true };

  const syncState = await loadSyncState();
  for (const idx of selected) {
    const rule = allRules[Number(idx)]!;
    if (!(await pathExists(rule.path))) continue;
    await removeFileAndEmptyParents(rule.path, rule.rulesDir);

    const contextId = makeContextId({
      target: rule.adapterId,
      scope: rule.scope,
      projectRoot: rule.projectRoot,
    });
    const context = syncState.contexts[contextId];
    if (context?.rules) delete context.rules[rule.name];

    process.stdout.write(`Removed: ${rule.name} (${rule.adapterLabel})\n`);
  }
  await saveSyncState(syncState);
  return { removed: true, cancelled: false };
}

async function interactiveRemoveFromTools(
  toolTargetIds: string[],
  flags: ParsedFlags,
  ctx: CliRunContext,
): Promise<void> {
  const adapters = filterRuleAdapters(getAdapters()).filter((adapter) => toolTargetIds.includes(adapter.id));
  await promptAndRemoveTargetRules({ adapters, flags, ctx });
}

async function interactiveRemoveFromTarget(flags: ParsedFlags, ctx: CliRunContext): Promise<number> {
  const adapters = filterRuleAdapters(getAdapters());
  const selectedAdapters = await selectTargetAdapters({
    adapters,
    flags,
    interactive: true,
    mode: 'multi',
    promptMessage: 'Select target(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  await promptAndRemoveTargetRules({ adapters: selectedAdapters, flags, ctx });
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
      process.stdout.write(`[dry-run] rm ${name} (${fullPath})\n`);
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

async function removeFromTargetDirect(
  rules: string[],
  targetFlag: string,
  flags: ParsedFlags,
  ctx: CliRunContext,
  dryRun: boolean,
): Promise<number> {
  const adapters = filterRuleAdapters(getAdapters());
  const resolved = resolveAdapter(targetFlag);
  const adapter = resolved && adapters.find((candidate) => candidate.id === resolved.id);
  if (!adapter) {
    process.stderr.write(`Unknown target: ${targetFlag}\n`);
    process.stderr.write(`Known targets: ${adapters.map((a) => a.id).join(', ')}\n`);
    return 1;
  }

  const normalizedRules: string[] = [];
  for (const raw of rules) {
    try {
      normalizedRules.push(normalizeRulePath(raw));
    } catch (err) {
      if (err instanceof InvalidRulePathError) {
        process.stderr.write(`${err.message}\n`);
        return 1;
      }
      throw err;
    }
  }

  const config = await loadConfig();
  const targetConfig = config.targets[adapter.id];
  const { scope, projectRoot, homeDir } = await resolveTargetContext({
    scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
    cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
    defaultScope: targetConfig?.defaultScope,
    currentCwd: ctx.cwd,
  });

  const rulesDir = adapter.resolveRulesDir({ scope, projectRoot, homeDir });
  const syncState = await loadSyncState();
  const contextId = makeContextId({
    target: adapter.id,
    scope,
    projectRoot: scope === 'local' ? projectRoot : undefined,
  });
  const context = syncState.contexts[contextId];

  if (adapter.id === 'cursor' && scope === 'global') {
    const userRulesText = (await readCursorUserRules(homeDir)) ?? '';
    const managedRules = new Map(
      parseManagedCursorUserRules(userRulesText).map((rule) => [rule.id, rule.content] as const),
    );
    let userRulesDirty = false;
    let removed = 0;

    for (const name of normalizedRules) {
      const ruleId = canonicalRuleIdFromPath(name);
      const targetPath = path.join(rulesDir, name);
      const hasFileCopy = await pathExists(targetPath);
      const hasUserRuleCopy = managedRules.has(ruleId);

      if (!hasFileCopy && !hasUserRuleCopy) {
        process.stderr.write(`Not found in ${adapter.label}: ${name}\n`);
        continue;
      }

      if (dryRun) {
        const location = hasUserRuleCopy ? `${adapter.label} User Rules` : targetPath;
        process.stdout.write(`[dry-run] rm ${name} (${location})\n`);
        removed++;
        continue;
      }

      if (hasUserRuleCopy) {
        managedRules.delete(ruleId);
        userRulesDirty = true;
      }
      if (hasFileCopy) await removeFileAndEmptyParents(targetPath, rulesDir);
      if (context?.rules) {
        delete context.rules[name];
        delete context.rules[`${ruleId}.md`];
      }
      removed++;
      process.stdout.write(`Removed: ${name} (${adapter.label})\n`);
    }

    if (!dryRun && userRulesDirty) {
      const mergedText = renderCursorUserRulesText(userRulesText, managedRules);
      await writeCursorUserRules(homeDir, mergedText);
    }
    if (!dryRun && removed > 0) await saveSyncState(syncState);
    return removed > 0 ? 0 : 1;
  }

  let removed = 0;
  for (const name of normalizedRules) {
    const targetPath = path.join(rulesDir, name);
    if (!(await pathExists(targetPath))) {
      process.stderr.write(`Not found in ${adapter.label}: ${name}\n`);
      continue;
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] rm ${name} (${targetPath})\n`);
      removed++;
      continue;
    }

    await removeFileAndEmptyParents(targetPath, rulesDir);
    if (context?.rules) delete context.rules[name];
    removed++;
    process.stdout.write(`Removed: ${name} (${adapter.label})\n`);
  }

  if (!dryRun && removed > 0) await saveSyncState(syncState);
  return removed > 0 ? 0 : 1;
}
