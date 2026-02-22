import path from 'node:path';
import {
  filterRuleAdapters,
  getColoredLabel,
  getAdapters,
  type TargetAdapter,
  type Scope,
} from '../../targets/adapters.js';
import { resolveTargetContext } from '../../util/scope.js';
import { scanRuleFiles } from '../../util/rule-utils.js';
import { pathExists } from '../../util/fs-utils.js';
import { canonicalRuleIdFromPath } from '../../util/rule-transform.js';
import { parseManagedCursorUserRules, readCursorUserRules } from '../../util/cursor-user-rules.js';
import type { ConfigV1 } from '../../core/config.js';

export type TargetRule = {
  name: string;
  path: string;
  rulesDir: string;
  adapterId: string;
  adapterLabel: string;
  scope: Scope;
  projectRoot?: string;
};

export async function gatherTargetRules(params: {
  adapters: TargetAdapter[];
  config: ConfigV1;
  scopeFlag?: string;
  cwdFlag?: string;
  currentCwd: string;
}): Promise<TargetRule[]> {
  const { adapters, config, scopeFlag, cwdFlag, currentCwd } = params;
  const allRules: TargetRule[] = [];

  for (const adapter of adapters) {
    const targetConfig = config.targets[adapter.id];
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag,
      cwdFlag,
      defaultScope: targetConfig?.defaultScope,
      currentCwd,
    });

    const rulesDir = adapter.resolveRulesDir({ scope, projectRoot, homeDir });
    const rules = await scanRuleFiles(rulesDir);

    for (const name of rules) {
      allRules.push({
        name,
        path: path.join(rulesDir, name),
        rulesDir,
        adapterId: adapter.id,
        adapterLabel: getColoredLabel(adapter),
        scope,
        projectRoot: scope === 'local' ? projectRoot : undefined,
      });
    }
  }

  return allRules;
}

export type SyncedRuleCopy = {
  ruleName: string;
  path: string;
  rulesDir: string;
  storageType?: 'file' | 'cursor-user-rules';
  ruleId?: string;
  homeDir?: string;
  adapterId: string;
  adapterLabel: string;
  scope: Scope;
  projectRoot?: string;
};

export async function findSyncedRuleCopies(params: {
  ruleNames: string[];
  config: ConfigV1;
  currentCwd: string;
}): Promise<SyncedRuleCopy[]> {
  const { ruleNames, config, currentCwd } = params;
  const requestedIds = new Set(ruleNames.map((name) => canonicalRuleIdFromPath(name)));
  const adapters = filterRuleAdapters(getAdapters());
  const copies: SyncedRuleCopy[] = [];

  for (const adapter of adapters) {
    const targetConfig = config.targets[adapter.id];
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      defaultScope: targetConfig?.defaultScope ?? 'global',
      currentCwd,
    });

    const rulesDir = adapter.resolveRulesDir({ scope, projectRoot, homeDir });
    const rules = await scanRuleFiles(rulesDir);
    for (const name of rules) {
      const ruleId = canonicalRuleIdFromPath(name);
      if (!requestedIds.has(ruleId)) continue;
      const rulePath = path.join(rulesDir, name);
      if (!(await pathExists(rulePath))) continue;
      copies.push({
        ruleName: name,
        path: rulePath,
        rulesDir,
        storageType: 'file',
        adapterId: adapter.id,
        adapterLabel: getColoredLabel(adapter),
        scope,
        projectRoot: scope === 'local' ? projectRoot : undefined,
      });
    }

    if (adapter.id === 'cursor' && scope === 'global') {
      const userRulesText = (await readCursorUserRules(homeDir)) ?? '';
      const managedRules = parseManagedCursorUserRules(userRulesText);
      for (const managedRule of managedRules) {
        const ruleId = canonicalRuleIdFromPath(managedRule.relativePath);
        if (!requestedIds.has(ruleId)) continue;
        copies.push({
          ruleName: managedRule.relativePath,
          path: `<cursor-user-rules:${ruleId}>`,
          rulesDir: '',
          storageType: 'cursor-user-rules',
          ruleId,
          homeDir,
          adapterId: adapter.id,
          adapterLabel: getColoredLabel(adapter),
          scope,
          projectRoot: scope === 'local' ? projectRoot : undefined,
        });
      }
    }
  }

  return copies;
}
