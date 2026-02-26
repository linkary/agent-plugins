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
import { promptMultiSelect } from '../../util/prompt.js';
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

  type SyncStatus = 'new' | 'identical' | 'preserved';
  const STATUS_LABELS: Record<SyncStatus, string> = {
    new: `${ANSI.green}new${ANSI.reset}`,
    identical: `${ANSI.dim}identical${ANSI.reset}`,
    preserved: `${ANSI.dim}preserved${ANSI.reset}`,
  };

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

    process.stdout.write(`\n${getColoredLabel(adapter)} (${store.sourceLabel}):\n`);

    if (toAdd.length === 0) {
      process.stdout.write(`  ${ANSI.dim}Already in sync (${alreadyIn.length} items)${ANSI.reset}\n`);
      skipped++;
      continue;
    }

    // 合并所有 items 到一个列表, 附加状态
    type ItemWithStatus = { hash: string; content: string; status: SyncStatus };
    const allItems: ItemWithStatus[] = [
      ...toAdd.map((item) => ({ ...item, status: 'new' as const })),
      ...alreadyIn.map((item) => ({ ...item, status: 'identical' as const })),
      ...onlyInTarget.map((item) => ({ ...item, status: 'preserved' as const })),
    ];

    // 统计摘要
    process.stdout.write(
      `  Preview: ${ANSI.green}${toAdd.length} new${ANSI.reset}, ` +
        `${ANSI.dim}${alreadyIn.length} identical${ANSI.reset}` +
        (onlyInTarget.length > 0 ? `, ${ANSI.dim}${onlyInTarget.length} preserved${ANSI.reset}` : '') +
        '\n',
    );

    // 交互式: 合并列表, 默认选中 new
    let selectedToAdd = toAdd;
    if (interactive && !force) {
      const defaultSelected = allItems
        .map((item, i) => (item.status === 'new' ? String(i) : null))
        .filter((v): v is string => v !== null);

      const chosen = await promptMultiSelect({
        message: `Confirm rules to sync to ${getColoredLabel(adapter)}:`,
        options: allItems.map((item, i) => ({
          label: `[${shortHash(item.hash)}] ${displayItem(item)} [${STATUS_LABELS[item.status]}]`,
          value: String(i),
        })),
        defaultSelected,
        searchable: allItems.length > 10,
      });

      if (chosen.length === 0) {
        process.stdout.write(`  ${ANSI.dim}Skipped (nothing selected)${ANSI.reset}\n`);
        skipped++;
        continue;
      }

      // 只取选中的 new items (identical/preserved 选了也是 no-op)
      const chosenIndices = new Set(chosen.map(Number));
      selectedToAdd = allItems.filter((item, i) => chosenIndices.has(i) && item.status === 'new');

      if (selectedToAdd.length === 0) {
        process.stdout.write(`  ${ANSI.dim}No new rules selected${ANSI.reset}\n`);
        skipped++;
        continue;
      }
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
