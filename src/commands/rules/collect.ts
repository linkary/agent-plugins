/**
 * rules collect — 从目标工具收集全局规则到中心存储 (additive merge).
 *
 * item 级管理: 读取各目标的全局规则 → 与中心已有 items 做并集 →
 * 用户选择 → 写入 ~/.agent-plugins/rules/_global.json.
 *
 * collect 只增不减 — item 仅通过 rm 删除.
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
  type RuleItem,
} from '../../util/global-rules-store.js';
import { readCentralGlobalRuleItems, writeCentralGlobalRuleItems } from '../../core/rule-store.js';
import { promptMultiSelect, promptConfirm } from '../../util/prompt.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdRulesCollect(
  positionals: string[],
  flags: ParsedFlags,
  ctx: CliRunContext,
): Promise<number> {
  const homeDir = os.homedir();
  const dryRun = !!flags['dry-run'];
  const force = !!flags.force;
  const interactive = process.stdin.isTTY ?? false;

  const adapters = filterRuleAdapters(getAdapters());
  const selected = await selectTargetAdapters({
    adapters,
    flags,
    interactive,
    mode: 'multi',
    promptMessage: 'Select collect target(s):',
  });

  if (selected.length === 0) return 0;

  let accumulated: RuleItem[] = await readCentralGlobalRuleItems();
  // 收集各目标的新 items (source 保存带颜色的 label)
  const allNew: Array<RuleItem & { source: string }> = [];

  for (const adapter of selected) {
    const store = getGlobalRulesStore(adapter.id, homeDir);
    if (!store) {
      process.stderr.write(`${ANSI.dim}Skipped ${getColoredLabel(adapter)}: no global rules store${ANSI.reset}\n`);
      continue;
    }

    const targetItems = await store.readItems();
    if (targetItems.length === 0) {
      process.stdout.write(`${ANSI.dim}${getColoredLabel(adapter)}: (empty)${ANSI.reset}\n`);
      continue;
    }

    const { onlyInA: newItems, common } = diffItems(targetItems, accumulated);

    process.stdout.write(`\n${getColoredLabel(adapter)} (${store.sourceLabel}):\n`);
    for (const item of newItems) {
      process.stdout.write(`  ${ANSI.green}+${ANSI.reset} ${ANSI.dim}[${shortHash(item.hash)}]${ANSI.reset} ${displayItem(item)}\n`);
    }
    for (const item of common) {
      process.stdout.write(`  ${ANSI.dim}= [${shortHash(item.hash)}] ${displayItem(item)}${ANSI.reset}\n`);
    }

    for (const item of newItems) {
      allNew.push({ ...item, source: getColoredLabel(adapter) });
    }
    // 为后续目标的 diff 预合并
    accumulated = mergeItems(accumulated, targetItems);
  }

  if (allNew.length === 0) {
    process.stdout.write(`\n${ANSI.dim}No new rules to collect. Central has ${accumulated.length} items.${ANSI.reset}\n`);
    return 0;
  }

  // 交互式选择
  let selectedNew = allNew;
  if (interactive && !force && allNew.length > 1) {
    const chosen = await promptMultiSelect({
      message: `Select rules to collect (${allNew.length} new):`,
      options: allNew.map((item) => ({
        label: `[${shortHash(item.hash)}] ${displayItem(item)} (${item.source})`,
        value: item.hash,
      })),
      defaultSelected: 'all',
      searchable: allNew.length > 10,
    });
    if (chosen.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
    const chosenSet = new Set(chosen);
    selectedNew = allNew.filter((item) => chosenSet.has(item.hash));
  }

  if (dryRun) {
    process.stdout.write(
      `\n${ANSI.dim}[dry-run]${ANSI.reset} Would collect ${selectedNew.length} new rules (total ${accumulated.length})\n`,
    );
    return 0;
  }

  // 确认
  if (interactive && !force) {
    const confirmed = await promptConfirm({
      message: `Collect ${selectedNew.length} new rule(s) into central store?`,
      default: true,
    });
    if (!confirmed) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
  }

  // 写入 — 将选中的新 items 与原有 central items 合并
  const centralItems = await readCentralGlobalRuleItems();
  const merged = mergeItems(centralItems, selectedNew);
  await writeCentralGlobalRuleItems(merged);
  process.stdout.write(
    `\n${ANSI.green}Collected${ANSI.reset} +${selectedNew.length} new rules (total ${merged.length})\n`,
  );
  return 0;
}
