import React, { useCallback, useState } from 'react';
import { render } from 'ink';
import { listCentralRules, getCentralRulePath } from '../../core/rule-store.js';
import { loadRegistry } from '../../core/registry.js';
import { loadConfig } from '../../core/config.js';
import { filterRuleAdapters, getAdapters } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { gatherTargetRules, findSyncedRuleCopies } from './manage-utils.js';
import { SkillBrowser, type SkillEntry } from '../../ui/skill-browser.js';
import { FileViewer } from '../../ui/file-viewer.js';
import { readCommandDescription } from '../../util/command-meta.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdRulesShow(_positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('show requires an interactive terminal (TTY).\n');
    return 1;
  }

  const hasTargetFlag = Boolean(flags.target);
  let ruleEntries: SkillEntry[];

  if (hasTargetFlag) {
    const adapters = filterRuleAdapters(getAdapters());
    const config = await loadConfig();
    const selectedAdapters = await selectTargetAdapters({
      adapters,
      flags,
      interactive: true,
      mode: 'single',
      promptMessage: 'Select target to browse:',
    });
    if (selectedAdapters.length === 0) return 1;

    const targetRules = await gatherTargetRules({
      adapters: selectedAdapters,
      config,
      scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
      cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
      currentCwd: ctx.cwd,
    });

    ruleEntries = targetRules.map((rule) => ({
      name: rule.name,
      path: rule.path,
    }));
  } else {
    const rules = await listCentralRules();
    const registry = await loadRegistry();
    ruleEntries = rules.map((name) => ({
      name,
      path: getCentralRulePath(name),
      record: registry.rules?.[name],
    }));
  }

  if (ruleEntries.length === 0) {
    process.stdout.write('(no rules found)\n');
    return 0;
  }

  return new Promise<number>((resolve) => {
    const instance = render(
      <ShowApp
        rules={ruleEntries}
        currentCwd={ctx.cwd}
        onExit={() => {
          instance.unmount();
          resolve(0);
        }}
      />,
    );
  });
}

type ShowAppProps = {
  rules: SkillEntry[];
  currentCwd: string;
  onExit: () => void;
};

function ShowApp(props: ShowAppProps) {
  const { rules, currentCwd, onExit } = props;
  const [view, setView] = useState<'browser' | 'viewer'>('browser');
  const [selectedRule, setSelectedRule] = useState<SkillEntry | null>(null);

  const handleSelect = useCallback((rule: SkillEntry) => {
    setSelectedRule(rule);
    setView('viewer');
  }, []);

  const handleBack = useCallback(() => {
    setView('browser');
  }, []);

  if (view === 'viewer' && selectedRule) {
    return (
      <FileViewer
        filePath={selectedRule.path}
        title={selectedRule.name}
        onBack={handleBack}
      />
    );
  }

  return (
    <SkillBrowser
      skills={rules}
      currentCwd={currentCwd}
      initialSkillName={selectedRule?.name}
      onSelect={handleSelect}
      onExit={onExit}
      listLabel="Rules"
      readDescription={(rulePath) => readCommandDescription(rulePath)}
      findSynced={async ({ skillNames, config, currentCwd: cwd }) => {
        const copies = await findSyncedRuleCopies({ ruleNames: skillNames, config, currentCwd: cwd });
        return copies.map((copy) => ({
          adapterId: copy.adapterId,
          adapterLabel: copy.adapterLabel,
          scope: copy.scope,
        }));
      }}
    />
  );
}
