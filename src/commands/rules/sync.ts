import path from 'node:path';
import fs from 'node:fs/promises';
import {
  filterRuleAdapters,
  getAdapters,
  getColoredLabel,
  type Scope,
  type TargetAdapter,
} from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { loadConfig } from '../../core/config.js';
import { listCentralRules, getCentralRulePath } from '../../core/rule-store.js';
import { ensureDir, pathExists } from '../../util/fs-utils.js';
import { computeItemHash } from '../../util/item-utils.js';
import { InvalidRulePathError, normalizeRulePath } from '../../util/rule-utils.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { resolveTargetContext } from '../../util/scope.js';
import { ANSI } from '../../util/ansi.js';
import { promptMultiSelect } from '../../util/prompt.js';
import {
  countByStatus,
  formatCountSummary,
  formatScopeTitle,
  formatStatusLabel,
  groupEntriesByName,
  type StatusStyle,
} from '../../util/sync-preview.js';
import {
  canonicalRuleIdFromPath,
  computeRuleContentHash,
  getRuleCapability,
  parseRuleToCanonical,
  selectPreferredRulePathsForTarget,
  serializeCanonicalRule,
} from '../../util/rule-transform.js';
import {
  parseManagedRuleBlocks,
  renderManagedRulesText,
} from '../../util/managed-rule-blocks.js';
import { getGlobalRulesStore, type GlobalRulesStore } from '../../util/global-rules-store.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

type RuleSyncStatus = 'new' | 'replace' | 'same' | 'incompatible' | 'lossy';

type RuleSyncEntry = {
  name: string;
  adapter: TargetAdapter;
  scope: Scope;
  projectRoot?: string;
  homeDir?: string;
  rulesDir?: string;
  globalStore?: GlobalRulesStore;
  globalRuleId?: string;
  status: RuleSyncStatus;
  reason?: string;
  transformedRelativePath?: string;
  transformedContent?: string;
  transformedHash?: string;
};
const RULE_SYNC_STATUS_ORDER = ['new', 'replace', 'same', 'incompatible', 'lossy'] as const;
const RULE_SYNC_STATUS_STYLES: StatusStyle<RuleSyncStatus> = {
  new: { color: 'green' },
  replace: { color: 'yellow' },
  same: { color: 'dim' },
  incompatible: { color: 'red' },
  lossy: { color: 'magenta' },
};

export async function cmdRulesSync(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const scopeFlag = typeof flags.scope === 'string' ? flags.scope : undefined;
  const cwdFlag = typeof flags.cwd === 'string' ? flags.cwd : undefined;
  const requested = new Set<string>();
  const requestedIds = new Set<string>();
  for (const raw of positionals) {
    try {
      const normalized = normalizeRulePath(raw);
      requested.add(normalized);
      requestedIds.add(canonicalRuleIdFromPath(normalized));
    } catch (err) {
      if (err instanceof InvalidRulePathError) {
        process.stderr.write(`${err.message}\n`);
        return 1;
      }
      throw err;
    }
  }

  const adapters = filterRuleAdapters(getAdapters());
  const selected = await selectTargetAdapters({
    adapters,
    flags,
    interactive,
    mode: 'multi',
    promptMessage: 'Select sync target(s):',
  });
  if (selected.length === 0) return 1;

  const config = await loadConfig();
  const allCentral = await listCentralRules();
  if (allCentral.length === 0) {
    process.stdout.write('(no rules to sync)\n');
    return 0;
  }

  const allEntries: RuleSyncEntry[] = [];
  const sourceBase = ctx.cwd; // kept for parity with other groups; actual source path is per rule file

  // Phase 1: gather entries and compute statuses
  for (const adapter of selected) {
    const targetConfig = config.targets[adapter.id];
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag,
      cwdFlag,
      defaultScope: targetConfig?.defaultScope,
      currentCwd: ctx.cwd,
    });

    const includeCandidates =
      targetConfig?.includeRules && !targetConfig.includeRules.includes('*')
        ? targetConfig.includeRules.flatMap((name) => {
            try {
              return [normalizeRulePath(name)];
            } catch (err) {
              if (err instanceof InvalidRulePathError) {
                process.stderr.write(
                  `${ANSI.yellow}Skipped invalid includeRules path for ${adapter.label}:${ANSI.reset} ${name}\n`,
                );
                return [];
              }
              throw err;
            }
          })
        : allCentral;
    const filteredCandidates = includeCandidates
      .filter((name) => allCentral.includes(name))
      .filter((name) => {
        if (requested.size === 0) return true;
        if (requested.has(name)) return true;
        return requestedIds.has(canonicalRuleIdFromPath(name));
      });
    if (filteredCandidates.length === 0) continue;

    const capability = getRuleCapability(adapter.id);
    if (capability.kind !== 'prompt') {
      for (const name of filteredCandidates) {
        allEntries.push({
          name,
          adapter,
          scope,
          projectRoot: scope === 'local' ? projectRoot : undefined,
          status: 'incompatible',
          reason: capability.reason,
        });
      }
      continue;
    }

    const globalStore = scope === 'global' ? getGlobalRulesStore(adapter.id, homeDir) : null;
    if (globalStore) {
      const existingText = await globalStore.read();
      const managedRules = new Map(
        parseManagedRuleBlocks(existingText).map((rule) => [rule.id, rule.content] as const),
      );
      const toSync = selectPreferredRulePathsForTarget(filteredCandidates, capability.format === 'cursor-mdc' ? 'claude-md' : capability.format);
      for (const name of toSync) {
        const src = getCentralRulePath(name);
        if (!(await pathExists(src))) continue;

        const srcContent = await fs.readFile(src, 'utf-8');
        const canonical = parseRuleToCanonical(name, srcContent);
        const transformed = serializeCanonicalRule(canonical, capability.format === 'cursor-mdc' ? 'claude-md' : capability.format);
        const transformedRelativePath = transformed.relativePath;
        const transformedHash = computeRuleContentHash(transformed.content);
        const existingContent = managedRules.get(canonical.id);
        const existingHash = existingContent ? computeRuleContentHash(existingContent) : '';
        const status: RuleSyncStatus = !existingContent
          ? 'new'
          : existingHash === transformedHash
            ? 'same'
            : 'replace';

        allEntries.push({
          name,
          adapter,
          scope,
          homeDir,
          projectRoot: scope === 'local' ? projectRoot : undefined,
          status,
          transformedRelativePath,
          transformedContent: transformed.content,
          transformedHash,
          globalStore,
          globalRuleId: canonical.id,
        });
      }
      continue;
    }

    const rulesDir = adapter.resolveRulesDir({ scope, projectRoot, homeDir });
    const toSync = selectPreferredRulePathsForTarget(filteredCandidates, capability.format);
    for (const name of toSync) {
      const src = getCentralRulePath(name);
      if (!(await pathExists(src))) continue;

      const srcContent = await fs.readFile(src, 'utf-8');
      const canonical = parseRuleToCanonical(name, srcContent);
      const transformed = serializeCanonicalRule(canonical, capability.format);
      const transformedRelativePath = transformed.relativePath;
      const transformedHash = computeRuleContentHash(transformed.content);

      if (transformed.lossy && !force) {
        allEntries.push({
          name,
          adapter,
          scope,
          projectRoot: scope === 'local' ? projectRoot : undefined,
          status: 'lossy',
          reason: 'requires --force to allow lossy conversion',
          transformedRelativePath,
          transformedContent: transformed.content,
          transformedHash,
        });
        continue;
      }

      const dest = path.join(rulesDir, transformedRelativePath);
      const destExists = await pathExists(dest);
      let status: RuleSyncStatus = 'new';
      if (destExists) {
        const destHash = await computeItemHash(dest);
        status = destHash === transformedHash ? 'same' : 'replace';
      }

      allEntries.push({
        name,
        adapter,
        scope,
        projectRoot: scope === 'local' ? projectRoot : undefined,
        rulesDir,
        status,
        transformedRelativePath,
        transformedContent: transformed.content,
        transformedHash,
      });
    }
  }

  if (allEntries.length === 0) {
    process.stdout.write('No rules available to sync.\n');
    return 0;
  }

  // Phase 2: confirm entries in interactive mode (same flow as skills/commands)
  let finalEntries: RuleSyncEntry[];
  if (positionals.length > 0) {
    finalEntries = allEntries;
  } else if (interactive && !force) {
    const previewCounts = countByStatus(allEntries, RULE_SYNC_STATUS_ORDER);
    process.stdout.write(
      `\nPreview: ${formatCountSummary(previewCounts, RULE_SYNC_STATUS_ORDER, RULE_SYNC_STATUS_STYLES)}\n`,
    );

    const grouped = groupEntriesByName(allEntries);
    const groupedItems = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
    const selectedNames = await promptMultiSelect({
      message: `Confirm rules to sync (${formatScopeTitle(allEntries.map((entry) => entry.scope))}):`,
      options: groupedItems.map(([name, entries]) => {
        const status = formatCountSummary(
          countByStatus(entries, RULE_SYNC_STATUS_ORDER),
          RULE_SYNC_STATUS_ORDER,
          RULE_SYNC_STATUS_STYLES,
        );
        return {
          label: `${name} -> ${entries
            .map((entry) => `${getColoredLabel(entry.adapter)} (${formatStatusLabel(entry.status, RULE_SYNC_STATUS_STYLES)})`)
            .join(', ')} [${status}]`,
          value: name,
        };
      }),
      searchable: true,
    });

    if (selectedNames.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
    const selectedNameSet = new Set(selectedNames);
    finalEntries = allEntries.filter((entry) => selectedNameSet.has(entry.name));
  } else {
    process.stdout.write(
      `\nSync ${allEntries.length} rule target(s) from ${sourceBase} (${formatScopeTitle(allEntries.map((entry) => entry.scope))}):\n`,
    );
    for (const entry of allEntries) {
      process.stdout.write(
        `  ${entry.name} -> ${getColoredLabel(entry.adapter)} (${formatStatusLabel(entry.status, RULE_SYNC_STATUS_STYLES)})\n`,
      );
    }
    finalEntries = allEntries;
  }

  const syncState = await loadSyncState();
  let newCount = 0;
  let replaceCount = 0;
  let sameCount = 0;
  let incompatibleCount = 0;
  let lossyCount = 0;
  let skippedCount = 0;
  const globalRulesWrites = new Map<
    string,
    { store: GlobalRulesStore; originalText: string; managedRules: Map<string, string>; dirty: boolean }
  >();

  // Phase 3: execute
  for (const entry of finalEntries) {
    const {
      name,
      adapter,
      scope,
      projectRoot,
      status,
      reason,
      transformedRelativePath,
      transformedContent,
      transformedHash,
      globalRuleId,
      globalStore: entryGlobalStore,
      homeDir,
    } = entry;
    const contextId = makeContextId({
      target: adapter.id,
      scope,
      projectRoot,
    });
    const context = syncState.contexts[contextId] ?? { skills: {}, rules: {} };
    syncState.contexts[contextId] = context;
    context.rules ??= {};

    if (status === 'incompatible') {
      incompatibleCount++;
      skippedCount++;
      process.stderr.write(`Skipped incompatible: ${name} -> ${adapter.label}${reason ? ` (${reason})` : ''}\n`);
      continue;
    }
    if (status === 'lossy') {
      lossyCount++;
      skippedCount++;
      process.stderr.write(`Skipped lossy: ${name} -> ${adapter.label}${reason ? ` (${reason})` : ''}\n`);
      continue;
    }
    if (!transformedRelativePath || !transformedContent || !transformedHash) {
      skippedCount++;
      process.stderr.write(`Skipped invalid transformed rule payload: ${name} -> ${adapter.label}\n`);
      continue;
    }

    if (globalRuleId && entryGlobalStore) {
      let writeState = globalRulesWrites.get(contextId);
      if (!writeState) {
        const originalText = await entryGlobalStore.read();
        const managedRules = new Map(
          parseManagedRuleBlocks(originalText).map((rule) => [rule.id, rule.content] as const),
        );
        writeState = { store: entryGlobalStore, originalText, managedRules, dirty: false };
        globalRulesWrites.set(contextId, writeState);
      }

      if (status === 'same') {
        sameCount++;
        context.rules[transformedRelativePath] = {
          hash: transformedHash,
          syncedAt: context.rules[transformedRelativePath]?.syncedAt ?? new Date().toISOString(),
        };
        process.stdout.write(`Up-to-date: ${name} (${adapter.label} ${entryGlobalStore.sourceLabel})\n`);
        continue;
      }
      if (status === 'replace' && !force) {
        skippedCount++;
        process.stderr.write(`Conflict: ${name} in ${adapter.label} ${entryGlobalStore.sourceLabel} (use --force to overwrite)\n`);
        continue;
      }

      if (status === 'new') newCount++;
      if (status === 'replace') replaceCount++;

      if (dryRun) {
        process.stdout.write(
          `[dry-run] sync ${name} -> ${adapter.label} ${entryGlobalStore.sourceLabel} as ${transformedRelativePath} [${status}]\n`,
        );
        continue;
      }

      writeState.managedRules.set(globalRuleId, transformedContent);
      writeState.dirty = true;
      context.rules[transformedRelativePath] = { hash: transformedHash, syncedAt: new Date().toISOString() };
      process.stdout.write(
        `Synced: ${name} -> ${adapter.label} ${entryGlobalStore.sourceLabel} ${status === 'new' ? `${ANSI.green}[new]` : `${ANSI.yellow}[replace]`}${ANSI.reset}\n`,
      );
      continue;
    }

    const rulesDir = entry.rulesDir;
    if (!rulesDir) {
      skippedCount++;
      process.stderr.write(`Skipped missing target rules directory: ${name} -> ${adapter.label}\n`);
      continue;
    }
    if (!dryRun) await ensureDir(rulesDir);

    const dest = path.join(rulesDir, transformedRelativePath);
    if (status === 'same') {
      sameCount++;
      context.rules[transformedRelativePath] = {
        hash: transformedHash,
        syncedAt: context.rules[transformedRelativePath]?.syncedAt ?? new Date().toISOString(),
      };
      process.stdout.write(`Up-to-date: ${name} (${adapter.label})\n`);
      continue;
    }

    if (status === 'replace' && !force) {
      skippedCount++;
      process.stderr.write(`Conflict: ${name} in ${adapter.label} (use --force to overwrite)\n`);
      continue;
    }

    if (status === 'new') newCount++;
    if (status === 'replace') replaceCount++;

    if (dryRun) {
      process.stdout.write(`[dry-run] sync ${name} -> ${adapter.label} as ${transformedRelativePath} [${status}]\n`);
      continue;
    }
    await ensureDir(path.dirname(dest));
    await fs.writeFile(dest, transformedContent, 'utf-8');
    context.rules[transformedRelativePath] = { hash: transformedHash, syncedAt: new Date().toISOString() };
    process.stdout.write(
      `Synced: ${name} -> ${adapter.label} ${status === 'new' ? `${ANSI.green}[new]` : `${ANSI.yellow}[replace]`}${ANSI.reset}\n`,
    );
  }

  if (!dryRun) {
    for (const writeState of globalRulesWrites.values()) {
      if (!writeState.dirty) continue;
      const mergedText = renderManagedRulesText(writeState.originalText, writeState.managedRules);
      await writeState.store.write(mergedText);
    }
  }
  if (!dryRun) await saveSyncState(syncState);
  const summaryParts: string[] = [];
  if (newCount > 0) summaryParts.push(`${ANSI.green}${newCount} new${ANSI.reset}`);
  if (replaceCount > 0) summaryParts.push(`${ANSI.yellow}${replaceCount} replace${ANSI.reset}`);
  if (sameCount > 0) summaryParts.push(`${ANSI.dim}${sameCount} same${ANSI.reset}`);
  if (incompatibleCount > 0) summaryParts.push(`${ANSI.red}${incompatibleCount} incompatible${ANSI.reset}`);
  if (lossyCount > 0) summaryParts.push(`${ANSI.magenta}${lossyCount} lossy${ANSI.reset}`);
  if (skippedCount > 0) summaryParts.push(`${ANSI.gray}${skippedCount} skipped${ANSI.reset}`);
  process.stdout.write(`\n${ANSI.dim}Summary:${ANSI.reset} ${summaryParts.length > 0 ? summaryParts.join(', ') : `${ANSI.dim}0 changes${ANSI.reset}`}\n`);
  return 0;
}
