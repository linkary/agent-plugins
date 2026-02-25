/**
 * rules sync — 将中心全局规则同步到目标工具 (additive).
 *
 * 行级管理: 读取中心规则行 → 与目标已有行做 diff →
 * 用户选择要添加的行 → 合并写入目标.
 *
 * sync 只增不减 — 目标中已有但中心没有的行会保留.
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
  serializeLines,
  shortHash,
} from '../../util/global-rules-store.js';
import { readCentralGlobalRuleLines } from '../../core/rule-store.js';
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
  const interactive = process.stdin.isTTY ?? false;

  const centralLines = await readCentralGlobalRuleLines();
  if (centralLines.length === 0) {
    process.stderr.write(
      `${ANSI.red}No central global rules found.${ANSI.reset}\n` +
        `Run ${ANSI.bold}ap rules collect${ANSI.reset} first to collect rules from a target.\n`,
    );
    return 1;
  }

  process.stdout.write(`\n${ANSI.bold}Central global rules (${centralLines.length} lines):${ANSI.reset}\n`);
  for (const line of centralLines) {
    process.stdout.write(`  ${ANSI.dim}[${shortHash(line.hash)}]${ANSI.reset} ${line.content}\n`);
  }
  process.stdout.write('\n');

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

    const targetLines = normalizeRuleLines((await store.read()).trim());
    const { onlyInA: toAdd, common: alreadyIn } = diffLines(centralLines, targetLines);
    const onlyInTarget = diffLines(targetLines, centralLines).onlyInA;

    process.stdout.write(`${getColoredLabel(adapter)} (${store.sourceLabel}):\n`);

    if (toAdd.length === 0) {
      process.stdout.write(`  ${ANSI.dim}Already in sync (${alreadyIn.length} lines)${ANSI.reset}\n`);
      skipped++;
      continue;
    }

    for (const line of toAdd) {
      process.stdout.write(`  ${ANSI.green}+${ANSI.reset} ${ANSI.dim}[${shortHash(line.hash)}]${ANSI.reset} ${line.content}\n`);
    }
    for (const line of alreadyIn) {
      process.stdout.write(`  ${ANSI.dim}= [${shortHash(line.hash)}] ${line.content}${ANSI.reset}\n`);
    }
    for (const line of onlyInTarget) {
      process.stdout.write(`  ${ANSI.dim}· [${shortHash(line.hash)}] ${line.content} (preserved)${ANSI.reset}\n`);
    }

    // 交互模式下让用户选择要添加哪些行
    let selectedToAdd = toAdd;
    if (interactive && toAdd.length > 1) {
      const chosen = await promptMultiSelect({
        message: `Select lines to add to ${adapter.label} (${toAdd.length} new):`,
        options: toAdd.map((l) => ({ label: `[${shortHash(l.hash)}] ${l.content}`, value: l.content })),
        defaultSelected: 'all',
      });
      selectedToAdd = toAdd.filter((l) => chosen.includes(l.content));
      if (selectedToAdd.length === 0) {
        process.stdout.write(`  ${ANSI.dim}Skipped (nothing selected)${ANSI.reset}\n`);
        skipped++;
        continue;
      }
    }

    if (dryRun) {
      process.stdout.write(`  ${ANSI.dim}[dry-run]${ANSI.reset} Would add ${selectedToAdd.length} lines\n`);
      synced++;
      continue;
    }

    const merged = mergeLines(targetLines, selectedToAdd);
    await store.write(serializeLines(merged));
    process.stdout.write(`  ${ANSI.green}Synced${ANSI.reset} +${selectedToAdd.length} lines (target now ${merged.length} lines)\n`);
    synced++;
  }

  process.stdout.write(
    `\n${ANSI.dim}Summary:${ANSI.reset} ${synced} synced${skipped > 0 ? `, ${skipped} skipped` : ''}\n`,
  );
  return 0;
}
