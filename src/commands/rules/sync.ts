/**
 * rules sync — 将中心全局规则同步到目标工具 (additive).
 *
 * item 级管理: 读取中心规则 → 与目标已有 items 做 diff →
 * 用户选择要添加的 items → 合并写入目标.
 *
 * sync 只增不减 — 目标中已有但中心没有的 items 会保留.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { filterRuleAdapters, getAdapters, getColoredLabel, isQoderFamily } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { ANSI } from '../../util/ansi.js';
import {
  getGlobalRulesStore,
  diffItems,
  mergeItems,
  shortHash,
  displayItem,
  dedupeAndSortItems,
  toRuleItem,
  type RuleItem,
} from '../../util/global-rules-store.js';
import { readCentralGlobalRuleItems } from '../../core/rule-store.js';
import { loadConfig } from '../../core/config.js';
import { resolveTargetContext } from '../../util/scope.js';
import { ensureDir, pathExists } from '../../util/fs-utils.js';
import { promptMultiSelect } from '../../util/prompt.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

const QODER_MANAGED_RULE_FILE = 'agent-plugins-global.md';
const QODER_MANAGED_RULE_STATE_FILE = '.agent-plugins-global.json';

function renderQoderManagedRule(items: RuleItem[]): string {
  const lines = [
    '---',
    'description: Synced from agent-plugins central global rules',
    'alwaysApply: true',
    '---',
    '',
    '# Project Rules',
    '',
  ];

  for (const [index, item] of items.entries()) {
    lines.push(`## Rule ${index + 1}`);
    lines.push('');
    lines.push(item.content.trim());
    lines.push('');
  }

  return `${lines.join('\n').replace(/\n+$/, '\n')}\n`;
}

function parseLegacyQoderManagedRule(content: string): RuleItem[] {
  const withoutFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, '').trim();
  if (!withoutFrontmatter) return [];

  const withoutTitle = withoutFrontmatter.replace(/^# Project Rules\r?\n?/u, '').trim();
  if (!withoutTitle) return [];

  const matches = [...withoutTitle.matchAll(/^## Rule \d+\s*$/gmu)];
  if (matches.length === 0) return [toRuleItem(withoutTitle)];

  const items: RuleItem[] = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]!;
    const start = (current.index ?? 0) + current[0].length;
    const end = matches[i + 1]?.index ?? withoutTitle.length;
    const block = withoutTitle.slice(start, end).trim();
    if (block) items.push(toRuleItem(block));
  }
  return dedupeAndSortItems(items);
}

async function readQoderManagedItems(rulesDir: string): Promise<RuleItem[]> {
  const statePath = path.join(rulesDir, QODER_MANAGED_RULE_STATE_FILE);
  if (await pathExists(statePath)) {
    try {
      const raw = await fs.readFile(statePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      const itemsRaw =
        typeof parsed === 'object' && parsed !== null && 'items' in parsed && Array.isArray((parsed as { items: unknown }).items)
          ? (parsed as { items: Array<{ content?: unknown }> }).items
          : [];
      return dedupeAndSortItems(
        itemsRaw
          .map((item) => (typeof item?.content === 'string' ? toRuleItem(item.content) : null))
          .filter((item): item is RuleItem => item !== null),
      );
    } catch {
      // Fall back to parsing the managed markdown file below.
    }
  }

  const targetPath = path.join(rulesDir, QODER_MANAGED_RULE_FILE);
  if (!(await pathExists(targetPath))) return [];
  try {
    const content = await fs.readFile(targetPath, 'utf-8');
    return parseLegacyQoderManagedRule(content);
  } catch {
    return [];
  }
}

async function writeQoderManagedItems(rulesDir: string, items: RuleItem[]): Promise<void> {
  const sorted = dedupeAndSortItems(items);
  await ensureDir(rulesDir);
  await fs.writeFile(path.join(rulesDir, QODER_MANAGED_RULE_FILE), renderQoderManagedRule(sorted), 'utf-8');
  await fs.writeFile(
    path.join(rulesDir, QODER_MANAGED_RULE_STATE_FILE),
    JSON.stringify({ version: 1, items: sorted }, null, 2) + '\n',
    'utf-8',
  );
}

type SyncStatus = 'new' | 'identical' | 'preserved';
const STATUS_LABELS: Record<SyncStatus, string> = {
  new: `${ANSI.green}new${ANSI.reset}`,
  identical: `${ANSI.dim}identical${ANSI.reset}`,
  preserved: `${ANSI.dim}preserved${ANSI.reset}`,
};

function buildSyncPreview(centralItems: RuleItem[], targetItems: RuleItem[]) {
  const { onlyInA: toAdd, common: alreadyIn } = diffItems(centralItems, targetItems);
  const onlyInTarget = diffItems(targetItems, centralItems).onlyInA;

  const allItems: Array<RuleItem & { status: SyncStatus }> = [
    ...toAdd.map((item) => ({ ...item, status: 'new' as const })),
    ...alreadyIn.map((item) => ({ ...item, status: 'identical' as const })),
    ...onlyInTarget.map((item) => ({ ...item, status: 'preserved' as const })),
  ];

  return { toAdd, alreadyIn, onlyInTarget, allItems };
}

async function selectItemsToAdd(params: {
  adapterLabel: string;
  interactive: boolean;
  force: boolean;
  allItems: Array<RuleItem & { status: SyncStatus }>;
  toAdd: RuleItem[];
}): Promise<RuleItem[] | null> {
  const { adapterLabel, interactive, force, allItems, toAdd } = params;
  if (!interactive || force) return toAdd;

  const defaultSelected = allItems
    .map((item, i) => (item.status === 'new' ? String(i) : null))
    .filter((v): v is string => v !== null);

  const chosen = await promptMultiSelect({
    message: `Confirm rules to sync to ${adapterLabel}:`,
    options: allItems.map((item, i) => ({
      label: `[${shortHash(item.hash)}] ${displayItem(item)} [${STATUS_LABELS[item.status]}]`,
      value: String(i),
    })),
    defaultSelected,
    sortDefaultSelectedToTop: true,
    searchable: allItems.length > 10,
  });

  if (chosen.length === 0) return null;

  const chosenIndices = new Set(chosen.map(Number));
  return allItems.filter((item, i) => chosenIndices.has(i) && item.status === 'new');
}

export async function cmdRulesSync(
  positionals: string[],
  flags: ParsedFlags,
  ctx: CliRunContext,
): Promise<number> {
  const homeDir = os.homedir();
  const dryRun = !!flags['dry-run'];
  const force = !!flags.force;
  const interactive = process.stdin.isTTY ?? false;
  const scopeFlag = typeof flags.scope === 'string' ? flags.scope : undefined;
  const cwdFlag = typeof flags.cwd === 'string' ? flags.cwd : undefined;

  const centralItems = await readCentralGlobalRuleItems();
  if (centralItems.length === 0) {
    process.stderr.write(
      `${ANSI.red}No central global rules found.${ANSI.reset}\n` +
        `Run ${ANSI.bold}ap rules collect${ANSI.reset} first to collect rules from a target.\n`,
    );
    return 1;
  }

  process.stdout.write(`\n${ANSI.bold}Central global rules: ${centralItems.length} items${ANSI.reset}\n\n`);

  const adapters = filterRuleAdapters(getAdapters());
  const selected = await selectTargetAdapters({
    adapters,
    flags,
    interactive,
    mode: 'multi',
    promptMessage: 'Select sync target(s):',
  });
  const config = await loadConfig();

  let synced = 0;
  let skipped = 0;

  for (const adapter of selected) {
    const targetConfig = config.targets[adapter.id];
    const defaultScope = scopeFlag ? targetConfig?.defaultScope : isQoderFamily(adapter.id) ? 'local' : targetConfig?.defaultScope;
    const { scope, projectRoot } = await resolveTargetContext({
      scopeFlag,
      cwdFlag,
      defaultScope,
      currentCwd: ctx.cwd,
    });

    if (isQoderFamily(adapter.id) && scope === 'local') {
      const rulesDir = adapter.resolveRulesDir({ scope, projectRoot, homeDir });
      const targetPath = path.join(rulesDir, QODER_MANAGED_RULE_FILE);
      const targetItems = await readQoderManagedItems(rulesDir);
      const { toAdd, alreadyIn, onlyInTarget, allItems } = buildSyncPreview(centralItems, targetItems);

      process.stdout.write(`\n${getColoredLabel(adapter)} (${targetPath}):\n`);

      if (toAdd.length === 0) {
        process.stdout.write(`  ${ANSI.dim}Already in sync (${alreadyIn.length} items)${ANSI.reset}\n`);
        skipped++;
        continue;
      }

      process.stdout.write(
        `  Preview: ${ANSI.green}${toAdd.length} new${ANSI.reset}, ` +
          `${ANSI.dim}${alreadyIn.length} identical${ANSI.reset}` +
          (onlyInTarget.length > 0 ? `, ${ANSI.dim}${onlyInTarget.length} preserved${ANSI.reset}` : '') +
          '\n',
      );

      const selectedToAdd = await selectItemsToAdd({
        adapterLabel: getColoredLabel(adapter),
        interactive,
        force,
        allItems,
        toAdd,
      });
      if (selectedToAdd === null) {
        process.stdout.write(`  ${ANSI.dim}Skipped (nothing selected)${ANSI.reset}\n`);
        skipped++;
        continue;
      }
      if (selectedToAdd.length === 0) {
        process.stdout.write(`  ${ANSI.dim}No new rules selected${ANSI.reset}\n`);
        skipped++;
        continue;
      }

      if (dryRun) {
        process.stdout.write(`  ${ANSI.dim}[dry-run]${ANSI.reset} Would add ${selectedToAdd.length} rules\n`);
        synced++;
        continue;
      }

      const merged = mergeItems(targetItems, selectedToAdd);
      await writeQoderManagedItems(rulesDir, merged);
      process.stdout.write(
        `  ${ANSI.green}Synced${ANSI.reset} +${selectedToAdd.length} rules (target now ${merged.length} items)\n`,
      );
      synced++;
      continue;
    }

    if (isQoderFamily(adapter.id) && scope === 'global') {
      process.stderr.write(
        `${ANSI.dim}Skipped ${getColoredLabel(adapter)}: global rules are not supported; use --scope local${ANSI.reset}\n`,
      );
      skipped++;
      continue;
    }

    const store = getGlobalRulesStore(adapter.id, homeDir);
    if (!store) {
      process.stderr.write(`${ANSI.dim}Skipped ${getColoredLabel(adapter)}: no global rules store${ANSI.reset}\n`);
      skipped++;
      continue;
    }

    const targetItems = await store.readItems();
    const { toAdd, alreadyIn, onlyInTarget, allItems } = buildSyncPreview(centralItems, targetItems);

    process.stdout.write(`\n${getColoredLabel(adapter)} (${store.sourceLabel}):\n`);

    if (toAdd.length === 0) {
      process.stdout.write(`  ${ANSI.dim}Already in sync (${alreadyIn.length} items)${ANSI.reset}\n`);
      skipped++;
      continue;
    }

    // 统计摘要
    process.stdout.write(
      `  Preview: ${ANSI.green}${toAdd.length} new${ANSI.reset}, ` +
        `${ANSI.dim}${alreadyIn.length} identical${ANSI.reset}` +
        (onlyInTarget.length > 0 ? `, ${ANSI.dim}${onlyInTarget.length} preserved${ANSI.reset}` : '') +
        '\n',
    );

    const selectedToAdd = await selectItemsToAdd({
      adapterLabel: getColoredLabel(adapter),
      interactive,
      force,
      allItems,
      toAdd,
    });
    if (selectedToAdd === null) {
      process.stdout.write(`  ${ANSI.dim}Skipped (nothing selected)${ANSI.reset}\n`);
      skipped++;
      continue;
    }
    if (selectedToAdd.length === 0) {
      process.stdout.write(`  ${ANSI.dim}No new rules selected${ANSI.reset}\n`);
      skipped++;
      continue;
    }

    if (dryRun) {
      process.stdout.write(`  ${ANSI.dim}[dry-run]${ANSI.reset} Would add ${selectedToAdd.length} rules\n`);
      synced++;
      continue;
    }

    const merged = mergeItems(targetItems, selectedToAdd);
    await store.writeItems(merged);
    process.stdout.write(`  ${ANSI.green}Synced${ANSI.reset} +${selectedToAdd.length} rules (target now ${merged.length} items)\n`);
    synced++;
  }

  process.stdout.write(
    `\n${ANSI.dim}Summary:${ANSI.reset} ${synced} synced${skipped > 0 ? `, ${skipped} skipped` : ''}\n`,
  );
  return 0;
}
