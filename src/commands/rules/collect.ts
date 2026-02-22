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
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import { getCentralRulePath } from '../../core/rule-store.js';
import { ensureDir, pathExists } from '../../util/fs-utils.js';
import { computeItemHash } from '../../util/item-utils.js';
import { InvalidRulePathError, normalizeRulePath, scanRuleFiles } from '../../util/rule-utils.js';
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
  serializeCanonicalRule,
} from '../../util/rule-transform.js';
import {
  getCursorUserRulesSourceLabel,
  parseManagedCursorUserRules,
  readCursorUserRules,
} from '../../util/cursor-user-rules.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

type RuleCollectStatus = 'new' | 'replace' | 'same' | 'incompatible' | 'lossy';

type RuleCollectEntry = {
  name: string;
  sourceName: string;
  sourcePath?: string;
  adapter: TargetAdapter;
  scope: Scope;
  status: RuleCollectStatus;
  reason?: string;
  transformedContent?: string;
  transformedHash?: string;
};
const RULE_COLLECT_STATUS_ORDER = ['new', 'replace', 'same', 'incompatible', 'lossy'] as const;
const RULE_COLLECT_STATUS_STYLES: StatusStyle<RuleCollectStatus> = {
  new: { color: 'green' },
  replace: { color: 'yellow' },
  same: { color: 'dim' },
  incompatible: { color: 'red' },
  lossy: { color: 'magenta' },
};

export async function cmdRulesCollect(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
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
    promptMessage: 'Select collect target(s):',
  });
  if (selected.length === 0) return 1;

  const config = await loadConfig();
  const allEntries: RuleCollectEntry[] = [];

  // Phase 1: gather entries and statuses
  for (const adapter of selected) {
    const targetConfig = config.targets[adapter.id];
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag,
      cwdFlag,
      defaultScope: targetConfig?.defaultScope,
      currentCwd: ctx.cwd,
    });

    if (adapter.id === 'cursor' && scope === 'global') {
      const sourceLabel = getCursorUserRulesSourceLabel(homeDir);
      const userRulesText = (await readCursorUserRules(homeDir)) ?? '';
      const managedRules = parseManagedCursorUserRules(userRulesText)
        .filter((rule) => {
          if (requested.size === 0) return true;
          if (requested.has(rule.relativePath)) return true;
          return requestedIds.has(canonicalRuleIdFromPath(rule.relativePath));
        })
        .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
      for (const managedRule of managedRules) {
        const sourceName = managedRule.relativePath;
        const sourcePath = sourceLabel;
        const canonical = parseRuleToCanonical(sourceName, managedRule.content);
        const transformed = serializeCanonicalRule(canonical, 'claude-md');
        const normalized = normalizeRulePath(transformed.relativePath);
        const transformedHash = computeRuleContentHash(transformed.content);
        const dest = getCentralRulePath(normalized);
        const destExists = await pathExists(dest);
        let status: RuleCollectStatus = 'new';
        if (destExists) {
          const destHash = await computeItemHash(dest);
          status = destHash === transformedHash ? 'same' : 'replace';
        }
        allEntries.push({
          name: normalized,
          sourceName,
          sourcePath,
          adapter,
          scope,
          status,
          transformedContent: transformed.content,
          transformedHash,
        });
      }
      continue;
    }

    const rulesDir = adapter.resolveRulesDir({ scope, projectRoot, homeDir });
    const rules = await scanRuleFiles(rulesDir);
    const filteredRules = rules
      .filter((name) => {
        if (requested.size === 0) return true;
        if (requested.has(name)) return true;
        return requestedIds.has(canonicalRuleIdFromPath(name));
      })
      .sort((a, b) => a.localeCompare(b));
    if (filteredRules.length === 0) continue;

    const capability = getRuleCapability(adapter.id);
    if (capability.kind !== 'prompt') {
      for (const sourceName of filteredRules) {
        allEntries.push({
          name: sourceName,
          sourceName,
          sourcePath: path.join(rulesDir, sourceName),
          adapter,
          scope,
          status: 'incompatible',
          reason: capability.reason,
        });
      }
      continue;
    }

    for (const sourceName of filteredRules) {
      const sourcePath = path.join(rulesDir, sourceName);
      const sourceContent = await fs.readFile(sourcePath, 'utf-8');
      const canonical = parseRuleToCanonical(sourceName, sourceContent);
      const transformed = serializeCanonicalRule(canonical, 'claude-md');
      const normalized = normalizeRulePath(transformed.relativePath);
      const transformedHash = computeRuleContentHash(transformed.content);

      if (transformed.lossy && !force) {
        allEntries.push({
          name: normalized,
          sourceName,
          sourcePath,
          adapter,
          scope,
          status: 'lossy',
          reason: 'requires --force to allow lossy conversion',
          transformedContent: transformed.content,
          transformedHash,
        });
        continue;
      }

      const dest = getCentralRulePath(normalized);
      const destExists = await pathExists(dest);
      let status: RuleCollectStatus = 'new';
      if (destExists) {
        const destHash = await computeItemHash(dest);
        status = destHash === transformedHash ? 'same' : 'replace';
      }

      allEntries.push({
        name: normalized,
        sourceName,
        sourcePath,
        adapter,
        scope,
        status,
        transformedContent: transformed.content,
        transformedHash,
      });
    }
  }

  if (allEntries.length === 0) {
    process.stdout.write('(no rules found in selected targets)\n');
    return 0;
  }

  // Phase 2: confirm entries in interactive mode
  let finalEntries: RuleCollectEntry[];
  if (positionals.length > 0) {
    finalEntries = allEntries;
  } else if (interactive && !force) {
    const previewCounts = countByStatus(allEntries, RULE_COLLECT_STATUS_ORDER);
    process.stdout.write(
      `\nPreview: ${formatCountSummary(previewCounts, RULE_COLLECT_STATUS_ORDER, RULE_COLLECT_STATUS_STYLES)}\n`,
    );

    const grouped = groupEntriesByName(allEntries);
    const groupedItems = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
    const defaultSelected = groupedItems
      .filter(([, entries]) => entries.some((entry) => entry.status === 'new'))
      .map(([name]) => name);

    const selectedNames = await promptMultiSelect({
      message: `Confirm rules to collect (${formatScopeTitle(allEntries.map((entry) => entry.scope))}):`,
      options: groupedItems.map(([name, entries]) => {
        const status = formatCountSummary(
          countByStatus(entries, RULE_COLLECT_STATUS_ORDER),
          RULE_COLLECT_STATUS_ORDER,
          RULE_COLLECT_STATUS_STYLES,
        );
        return {
          label: `${name} <- ${entries
            .map((entry) => `${getColoredLabel(entry.adapter)} (${formatStatusLabel(entry.status, RULE_COLLECT_STATUS_STYLES)})`)
            .join(', ')} [${status}]`,
          value: name,
        };
      }),
      defaultSelected,
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
      `\nCollect ${allEntries.length} rule target(s) (${formatScopeTitle(allEntries.map((entry) => entry.scope))}):\n`,
    );
    for (const entry of allEntries) {
      process.stdout.write(
        `  ${entry.name} <- ${getColoredLabel(entry.adapter)} (${formatStatusLabel(entry.status, RULE_COLLECT_STATUS_STYLES)})\n`,
      );
    }
    finalEntries = allEntries;
  }

  const registry = await loadRegistry();
  registry.rules ??= {};
  let newCount = 0;
  let replaceCount = 0;
  let sameCount = 0;
  let incompatibleCount = 0;
  let lossyCount = 0;
  let skippedCount = 0;

  // Phase 3: execute
  for (const entry of finalEntries) {
    const { name, sourceName, sourcePath, adapter, scope, status, reason, transformedContent, transformedHash } = entry;

    if (status === 'incompatible') {
      incompatibleCount++;
      skippedCount++;
      process.stderr.write(`Skipped incompatible: ${sourceName} from ${adapter.label}${reason ? ` (${reason})` : ''}\n`);
      continue;
    }
    if (status === 'lossy') {
      lossyCount++;
      skippedCount++;
      process.stderr.write(`Skipped lossy: ${sourceName} from ${adapter.label}${reason ? ` (${reason})` : ''}\n`);
      continue;
    }
    if (!transformedContent || !transformedHash || !sourcePath) {
      skippedCount++;
      process.stderr.write(`Skipped invalid transformed rule payload: ${sourceName} from ${adapter.label}\n`);
      continue;
    }

    const dest = getCentralRulePath(name);

    if (status === 'same') {
      sameCount++;
      process.stdout.write(`Up-to-date: ${name} (${adapter.label})\n`);
      continue;
    }

    if (status === 'replace' && !force) {
      skippedCount++;
      process.stderr.write(`Conflict: ${name} differs from central (use --force to replace)\n`);
      continue;
    }

    if (status === 'new') newCount++;
    if (status === 'replace') replaceCount++;

    if (dryRun) {
      process.stdout.write(`[dry-run] collect ${sourceName} from ${adapter.label} as ${name} [${status}]\n`);
      continue;
    }
    await ensureDir(path.dirname(dest));
    await fs.writeFile(dest, transformedContent, 'utf-8');
    const now = new Date().toISOString();
    registry.rules[name] = {
      name,
      addedAt: registry.rules[name]?.addedAt ?? now,
      updatedAt: now,
      source: { type: 'collected', from: { target: adapter.id, scope, path: sourcePath } },
    };
    process.stdout.write(
      `Collected: ${name} from ${adapter.label} ${status === 'new' ? `${ANSI.green}[new]` : `${ANSI.yellow}[replace]`}${ANSI.reset}\n`,
    );
  }

  if (!dryRun) await saveRegistry(registry);
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
