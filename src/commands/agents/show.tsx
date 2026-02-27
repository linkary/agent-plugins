import React, { useCallback, useState } from 'react';
import { render } from 'ink';
import { loadConfig } from '../../core/config.js';
import { loadRegistry } from '../../core/registry.js';
import { listCentralAgentItems } from '../../core/agent-store.js';
import { filterAgentAdapters, getAdapters } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { gatherTargetAgents, findSyncedAgentCopies } from './manage-utils.js';
import { SkillBrowser, type SkillEntry } from '../../ui/skill-browser.js';
import { FileBrowser } from '../../ui/file-browser.js';
import { FileViewer } from '../../ui/file-viewer.js';
import { readAgentDescription } from '../../util/agent-meta.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdAgentsShow(_positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('show requires an interactive terminal (TTY).\n');
    return 1;
  }

  const hasTargetFlag = Boolean(flags.target);
  let agentEntries: SkillEntry[];

  if (hasTargetFlag) {
    const adapters = filterAgentAdapters(getAdapters());
    const config = await loadConfig();
    const selectedAdapters = await selectTargetAdapters({
      adapters,
      flags,
      interactive: true,
      mode: 'single',
      promptMessage: 'Select target to browse:',
    });
    if (selectedAdapters.length === 0) return 1;

    const targetAgents = await gatherTargetAgents({
      adapters: selectedAdapters,
      config,
      scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
      cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
      currentCwd: ctx.cwd,
    });

    agentEntries = targetAgents.map((agent) => ({
      name: agent.name,
      path: agent.path,
    }));
  } else {
    const agents = await listCentralAgentItems();
    const registry = await loadRegistry();
    agentEntries = agents.map((agent) => ({
      name: agent.name,
      path: agent.path,
      record: registry.agents?.[agent.name],
    }));
  }

  if (agentEntries.length === 0) {
    process.stdout.write('(no agents found)\n');
    return 0;
  }

  return new Promise<number>((resolve) => {
    const instance = render(
      <ShowApp
        agents={agentEntries}
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
  agents: SkillEntry[];
  currentCwd: string;
  onExit: () => void;
};

function ShowApp(props: ShowAppProps) {
  const { agents, currentCwd, onExit } = props;
  const [view, setView] = useState<'browser' | 'files' | 'viewer'>('browser');
  const [selectedAgent, setSelectedAgent] = useState<SkillEntry | null>(null);

  const handleSelect = useCallback((agent: SkillEntry) => {
    setSelectedAgent(agent);
    if (agent.path.toLowerCase().endsWith('.md')) {
      setView('viewer');
      return;
    }
    setView('files');
  }, []);

  const handleBack = useCallback(() => {
    setView('browser');
  }, []);

  if (view === 'viewer' && selectedAgent) {
    return (
      <FileViewer
        filePath={selectedAgent.path}
        title={selectedAgent.name}
        onBack={handleBack}
      />
    );
  }

  if (view === 'files' && selectedAgent) {
    return (
      <FileBrowser
        rootPath={selectedAgent.path}
        skillName={selectedAgent.name}
        onBack={handleBack}
      />
    );
  }

  return (
    <SkillBrowser
      skills={agents}
      currentCwd={currentCwd}
      initialSkillName={selectedAgent?.name}
      onSelect={handleSelect}
      onExit={onExit}
      listLabel="Agents"
      readDescription={(agentPath) => readAgentDescription(agentPath)}
      findSynced={async ({ skillNames, config, currentCwd: cwd }) => {
        const copies = await findSyncedAgentCopies({ agentNames: skillNames, config, currentCwd: cwd });
        return copies.map((copy) => ({
          adapterId: copy.adapterId,
          adapterLabel: copy.adapterLabel,
          scope: copy.scope,
        }));
      }}
    />
  );
}
