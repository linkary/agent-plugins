/**
 * rules sync — 将中心全局规则同步到目标工具 (additive).
 *
 * item 级管理: 读取中心规则 → 与目标已有 items 做 diff →
 * 用户选择要添加的 items → 合并写入目标.
 *
 * sync 只增不减 — 目标中已有但中心没有的 items 会保留.
 */
import os from 'node:os';
import { filterRuleAdapters, getAdapters, getColoredLabel } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { ANSI } from '../../util/ansi.js';
import {
  getGlobalRulesStore,
  diffItems,
  mergeItems,
  shortHash,
  displayItem,
} from '../../util/global-rules-store.js';
import { readCentralGlobalRuleItems } from '../../core/rule-store.js';
import { promptMultiSelect, promptConfirm } from '../../util/prompt.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdRulesSync(
  positionals: string[],
  flags: ParsedFlags,
  ctx: CliRunContext,
): Promise<number> {
  const homeDir = os.homedir();
  const dryRun = !!flags['dry-run'];
  const force = !!flags.force;
  const interactive = process.stdin.isTTY ?? false;

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

  let synced = 0;
  let skipped = 0;

  for (const adapter of selected) {
    const store = getGlobalRulesStore(adapter.id, homeDir);
    if (!store) {
      process.stderr.write(`${ANSI.dim}Skipped ${getColoredLabel(adapter)}: no global rules store${ANSI.reset}\n`);
      skipped++;
      continue;
    }

    const targetItems = await store.readItems();
    const { onlyInA: toAdd, common: alreadyIn } = diffItems(centralItems, targetItems);
    const onlyInTarget = diffItems(targetItems, centralItems).onlyInA;

    process.stdout.write(`${getColoredLabel(adapter)} (${store.sourceLabel}):\n`);

    if (toAdd.length === 0) {
      process.stdout.write(`  ${ANSI.dim}Already in sync (${alreadyIn.length} items)${ANSI.reset}\n`);
      skipped++;
      continue;
    }

    for (const item of toAdd) {
      process.stdout.write(`  ${ANSI.green}+${ANSI.reset} ${ANSI.dim}[${shortHash(item.hash)}]${ANSI.reset} ${displayItem(item)}\n`);
    }
    for (const item of alreadyIn) {
      process.stdout.write(`  ${ANSI.dim}= [${shortHash(item.hash)}] ${displayItem(item)}${ANSI.reset}\n`);
    }
    for (const item of onlyInTarget) {
      process.stdout.write(`  ${ANSI.dim}· [${shortHash(item.hash)}] ${displayItem(item)} (preserved)${ANSI.reset}\n`);
    }

    // 交互式选择要添加的 items
    let selectedToAdd = toAdd;
    if (interactive && !force && toAdd.length > 1) {
      const chosen = await promptMultiSelect({
        message: `Select rules to add to ${adapter.label} (${toAdd.length} new):`,
        options: toAdd.map((item) => ({
          label: `[${shortHash(item.hash)}] ${displayItem(item)}`,
          value: item.hash,
        })),
        defaultSelected: 'all',
        searchable: toAdd.length > 10,
      });
      selectedToAdd = toAdd.filter((item) => chosen.includes(item.hash));
      if (selectedToAdd.length === 0) {
        process.stdout.write(`  ${ANSI.dim}Skipped (nothing selected)${ANSI.reset}\n`);
        skipped++;
        continue;
      }
    }

    if (dryRun) {
      process.stdout.write(`  ${ANSI.dim}[dry-run]${ANSI.reset} Would add ${selectedToAdd.length} rules\n`);
      synced++;
      continue;
    }

    // 确认
    if (interactive && !force) {
      const confirmed = await promptConfirm({
        message: `Add ${selectedToAdd.length} rule(s) to ${adapter.label}?`,
        default: true,
      });
      if (!confirmed) {
        process.stdout.write(`  ${ANSI.dim}Skipped (cancelled)${ANSI.reset}\n`);
        skipped++;
        continue;
      }
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
