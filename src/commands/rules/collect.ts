/**
 * rules collect — 从目标工具收集全局规则到中心存储 (additive merge).
 *
 * 行级管理: 读取各目标的全局规则 → 拆分为行 → 与中心已有行做并集 →
 * 排序去重后写入 ~/.agent-plugins/rules/_global.md.
 *
 * collect 只增不减 — 行仅通过 rm 删除.
 */
import os from 'node:os';
import { filterRuleAdapters, getAdapters, getColoredLabel } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { ANSI } from '../../util/ansi.js';
import {
  getGlobalRulesStore,
  normalizeRuleLines,
  diffLines,
  mergeLines,
  shortHash,
  type NormalizedLine,
} from '../../util/global-rules-store.js';
import { readCentralGlobalRuleLines, writeCentralGlobalRuleLines } from '../../core/rule-store.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdRulesCollect(
  positionals: string[],
  flags: ParsedFlags,
  ctx: CliRunContext,
): Promise<number> {
  const homeDir = os.homedir();
  const dryRun = !!flags['dry-run'];

  const adapters = filterRuleAdapters(getAdapters());
  const selected = await selectTargetAdapters({
    adapters,
    flags,
    interactive: process.stdin.isTTY ?? false,
    mode: 'multi',
    promptMessage: 'Select collect target(s):',
  });

  if (selected.length === 0) return 0;

  // 读取中心已有行
  let accumulated: NormalizedLine[] = await readCentralGlobalRuleLines();
  let totalNew = 0;

  for (const adapter of selected) {
    const store = getGlobalRulesStore(adapter.id, homeDir);
    if (!store) {
      process.stderr.write(`${ANSI.dim}Skipped ${getColoredLabel(adapter)}: no global rules store${ANSI.reset}\n`);
      continue;
    }

    const content = (await store.read()).trim();
    if (!content) {
      process.stdout.write(`${ANSI.dim}${getColoredLabel(adapter)}: (empty)${ANSI.reset}\n`);
      continue;
    }

    const targetLines = normalizeRuleLines(content);
    const { onlyInA: newLines, common } = diffLines(targetLines, accumulated);

    process.stdout.write(`\n${getColoredLabel(adapter)} (${store.sourceLabel}):\n`);

    for (const line of newLines) {
      process.stdout.write(`  ${ANSI.green}+${ANSI.reset} ${ANSI.dim}[${shortHash(line.hash)}]${ANSI.reset} ${line.content}\n`);
    }
    for (const line of common) {
      process.stdout.write(`  ${ANSI.dim}= [${shortHash(line.hash)}] ${line.content}${ANSI.reset}\n`);
    }

    totalNew += newLines.length;
    accumulated = mergeLines(accumulated, targetLines);
  }

  if (totalNew === 0) {
    process.stdout.write(`\n${ANSI.dim}No new lines to collect. Central has ${accumulated.length} lines.${ANSI.reset}\n`);
    return 0;
  }

  if (dryRun) {
    process.stdout.write(
      `\n${ANSI.dim}[dry-run]${ANSI.reset} Would add ${totalNew} new lines (total ${accumulated.length})\n`,
    );
    return 0;
  }

  await writeCentralGlobalRuleLines(accumulated);
  process.stdout.write(
    `\n${ANSI.green}Collected${ANSI.reset} +${totalNew} new lines (total ${accumulated.length})\n`,
  );
  return 0;
}
