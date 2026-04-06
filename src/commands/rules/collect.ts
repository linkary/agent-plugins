/**
 * rules collect — 从目标工具收集全局规则到中心存储 (additive merge).
 *
 * Phased workflow (mirrors skills/collect.ts):
 *   Phase 1: Gather — read rules from all selected targets
 *   Phase 2: Status — diff each item against central store
 *   Phase 3: Preview + Select — aggregated summary, unified multi-select
 *   Phase 4: Write — merge selected items into central store
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
import {
  readCentralGlobalRuleItems,
  writeCentralGlobalRuleItems,
  getCentralGlobalRulesPath,
} from '../../core/rule-store.js';
import { promptMultiSelect } from '../../util/prompt.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

type CollectStatus = 'new' | 'identical' | 'duplicate';

type RuleWithStatus = RuleItem & {
  source: string;
  status: CollectStatus;
};

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

  // ── Phase 1: Gather all items from all targets ────────────────────────
  const centralItems = await readCentralGlobalRuleItems();
  const centralSet = new Set(centralItems.map((i) => i.content));
  const seenContents = new Set<string>();

  const allItems: RuleWithStatus[] = [];

  for (const adapter of selected) {
    if (adapter.id === 'qoder') {
      process.stderr.write(
        `${ANSI.dim}Skipped ${getColoredLabel(adapter)}: global rules are not supported; collect from --scope local is not implemented${ANSI.reset}\n`,
      );
      continue;
    }

    const store = getGlobalRulesStore(adapter.id, homeDir);
    if (!store) {
      process.stderr.write(`${ANSI.dim}Skipped ${getColoredLabel(adapter)}: no global rules store${ANSI.reset}\n`);
      continue;
    }

    const targetItems = await store.readItems();
    if (targetItems.length === 0) {
      process.stderr.write(`${ANSI.dim}${getColoredLabel(adapter)}: (empty)${ANSI.reset}\n`);
      continue;
    }

    // ── Phase 2: Determine status for each item ───────────────────────
    for (const item of targetItems) {
      const isDuplicate = seenContents.has(item.content);
      seenContents.add(item.content);

      let status: CollectStatus;
      if (isDuplicate) {
        status = 'duplicate';
      } else if (centralSet.has(item.content)) {
        status = 'identical';
      } else {
        status = 'new';
      }

      allItems.push({ ...item, source: getColoredLabel(adapter), status });
    }
  }

  if (allItems.length === 0) {
    process.stderr.write(`${ANSI.dim}No rules found from selected targets.${ANSI.reset}\n`);
    return 0;
  }

  // ── Phase 3: Preview + Select ─────────────────────────────────────────
  const newCount = allItems.filter((i) => i.status === 'new').length;
  const identicalCount = allItems.filter((i) => i.status === 'identical').length;
  const dupCount = allItems.filter((i) => i.status === 'duplicate').length;

  if (newCount === 0 && !interactive) {
    process.stderr.write(
      `${ANSI.dim}No new rules to collect. Central has ${centralItems.length} items.${ANSI.reset}\n`,
    );
    return 0;
  }

  const STATUS_LABELS: Record<CollectStatus, string> = {
    new: `${ANSI.green}new${ANSI.reset}`,
    identical: `${ANSI.gray}identical${ANSI.reset}`,
    duplicate: `${ANSI.dim}dup${ANSI.reset}`,
  };

  let selectedItems: RuleWithStatus[];

  if (interactive && !force) {
    // Preview line (on stderr to avoid Ink re-display)
    process.stderr.write(
      `Preview: ${ANSI.green}${newCount} new${ANSI.reset}, ${ANSI.gray}${identicalCount} identical${ANSI.reset}` +
        (dupCount > 0 ? `, ${ANSI.dim}${dupCount} duplicates${ANSI.reset}` : '') +
        '\n',
    );

    // Default: only 'new' items pre-selected
    const defaultSelected = allItems
      .map((item, i) => (item.status === 'new' ? String(i) : null))
      .filter((v): v is string => v !== null);

    const centralStorePath = getCentralGlobalRulesPath();
    const chosen = await promptMultiSelect({
      message: `Select rules to collect (${centralStorePath}):`,
      options: allItems.map((item, i) => ({
        label: `[${shortHash(item.hash)}] ${displayItem(item)} (${item.source}) [${STATUS_LABELS[item.status]}]`,
        value: String(i),
      })),
      defaultSelected,
      sortDefaultSelectedToTop: true,
      searchable: allItems.length > 10,
    });

    if (chosen.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }

    const chosenSet = new Set(chosen);
    selectedItems = allItems.filter((_, i) => chosenSet.has(String(i)));
  } else {
    // Non-interactive or --force: collect only 'new' items
    selectedItems = allItems.filter((item) => item.status === 'new');
  }

  if (selectedItems.length === 0) {
    process.stderr.write(
      `${ANSI.dim}No new rules to collect. Central has ${centralItems.length} items.${ANSI.reset}\n`,
    );
    return 0;
  }

  // ── Phase 4: Write ────────────────────────────────────────────────────
  if (dryRun) {
    process.stdout.write(
      `${ANSI.dim}[dry-run]${ANSI.reset} Would collect ${selectedItems.length} new rules (total ${centralItems.length + selectedItems.length})\n`,
    );
    return 0;
  }

  const merged = mergeItems(centralItems, selectedItems);
  await writeCentralGlobalRuleItems(merged);
  process.stdout.write(
    `${ANSI.green}Collected${ANSI.reset} +${selectedItems.length} new rules (total ${merged.length})\n`,
  );
  return 0;
}
