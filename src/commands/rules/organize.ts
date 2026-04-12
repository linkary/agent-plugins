import fs from 'node:fs/promises';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';
import { loadConfig } from '../../core/config.js';
import { filterRuleAdapters, getAdapters, getColoredLabel } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { resolveTargetContext } from '../../util/scope.js';
import { scanRuleFileEntries } from '../../util/rule-utils.js';
import { computeCanonicalRuleHash, getRuleCapability, parseRuleToCanonical } from '../../util/rule-transform.js';
import { runOrganizePlan, type OrganizePlanEntry } from '../../util/organize.js';

type RuleScanItem = {
  name: string;
  hash: string;
  path: string;
  targetLabel: string;
};

export async function cmdRulesOrganize(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const scopeFlag = typeof flags.scope === 'string' ? flags.scope : undefined;
  const cwdFlag = typeof flags.cwd === 'string' ? flags.cwd : undefined;

  const adapters = filterRuleAdapters(getAdapters());
  const selectedAdapters = await selectTargetAdapters({
    adapters,
    flags,
    interactive,
    mode: 'multi',
    promptMessage: 'Select organize target(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const config = await loadConfig();
  const entries: OrganizePlanEntry[] = [];
  const scanned: RuleScanItem[] = [];
  const skipNotes: string[] = [];

  for (const adapter of selectedAdapters) {
    const targetConfig = config.targets[adapter.id];
    const defaultScope = !scopeFlag && adapter.id === 'qoder' ? 'local' : targetConfig?.defaultScope;
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag,
      cwdFlag,
      defaultScope,
      currentCwd: ctx.cwd,
    });

    const capability = getRuleCapability(adapter.id);
    if (capability.kind !== 'prompt') {
      skipNotes.push(`${getColoredLabel(adapter)}: ${capability.reason}`);
      continue;
    }

    const rulesDir = adapter.resolveRulesDir({ scope, projectRoot, homeDir });
    if (!rulesDir) continue;
    const ruleFiles = await scanRuleFileEntries(rulesDir);
    for (const ruleFile of ruleFiles) {
      const content = await fs.readFile(ruleFile.absolutePath, 'utf-8');
      const canonical = parseRuleToCanonical(ruleFile.relativePath, content);
      if (positionals.length > 0 && !positionals.includes(canonical.id) && !positionals.includes(ruleFile.relativePath)) continue;
      scanned.push({
        name: canonical.id,
        hash: computeCanonicalRuleHash(canonical),
        path: ruleFile.absolutePath,
        targetLabel: getColoredLabel(adapter),
      });
    }
  }

  if (skipNotes.length > 0) {
    process.stdout.write(`${skipNotes.join('\n')}\n`);
  }

  const byName = new Map<string, RuleScanItem[]>();
  for (const item of scanned) {
    const current = byName.get(item.name);
    if (current) current.push(item);
    else byName.set(item.name, [item]);
  }

  for (const [name, items] of [...byName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const hashes = new Set(items.map((item) => item.hash));
    const detail =
      hashes.size === 1
        ? 'exact duplicate prompt-rule exists, but rules have no shared destination in v1'
        : 'same rule id exists with different canonical content';
    if (items.length > 1) {
      for (const item of items) {
        entries.push({
          name,
          targetLabel: item.targetLabel,
          action: 'report-only',
          path: item.path,
          detail,
          mutates: false,
        });
      }
    }
  }

  return await runOrganizePlan({
    groupLabel: 'Rules',
    entries,
    interactive,
    dryRun,
    force,
  });
}
