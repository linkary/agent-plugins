import {
  filterAgentAdapters,
  getColoredLabel,
  getAdapters,
  type TargetAdapter,
  type Scope,
} from '../../targets/adapters.js';
import { resolveTargetContext } from '../../util/scope.js';
import { resolveNamedTargetAgentPath, scanFilesystemAgents } from '../../util/agent-transform.js';
import type { ConfigV1 } from '../../core/config.js';

export type TargetAgent = {
  name: string;
  path: string;
  form: 'directory' | 'file';
  adapterId: string;
  adapterLabel: string;
  scope: Scope;
  projectRoot?: string;
};

export async function gatherTargetAgents(params: {
  adapters: TargetAdapter[];
  config: ConfigV1;
  scopeFlag?: string;
  cwdFlag?: string;
  currentCwd: string;
}): Promise<TargetAgent[]> {
  const { adapters, config, scopeFlag, cwdFlag, currentCwd } = params;
  const allAgents: TargetAgent[] = [];

  for (const adapter of adapters) {
    const targetConfig = config.targets[adapter.id];
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag,
      cwdFlag,
      defaultScope: targetConfig?.defaultScope,
      currentCwd,
    });

    const agentsDir = adapter.resolveAgentsDir({ scope, projectRoot, homeDir });
    const agents = await scanFilesystemAgents(agentsDir);

    for (const agent of agents) {
      allAgents.push({
        name: agent.name,
        path: agent.path,
        form: agent.form,
        adapterId: adapter.id,
        adapterLabel: getColoredLabel(adapter),
        scope,
        projectRoot: scope === 'local' ? projectRoot : undefined,
      });
    }
  }

  return allAgents;
}

export type SyncedAgentCopy = {
  agentName: string;
  path: string;
  form: 'directory' | 'file';
  adapterId: string;
  adapterLabel: string;
  scope: Scope;
  projectRoot?: string;
};

export async function findSyncedAgentCopies(params: {
  agentNames: string[];
  config: ConfigV1;
  currentCwd: string;
}): Promise<SyncedAgentCopy[]> {
  const { agentNames, config, currentCwd } = params;
  const adapters = filterAgentAdapters(getAdapters());
  const copies: SyncedAgentCopy[] = [];

  for (const adapter of adapters) {
    const targetConfig = config.targets[adapter.id];
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      defaultScope: targetConfig?.defaultScope ?? 'global',
      currentCwd,
    });

    const agentsDir = adapter.resolveAgentsDir({ scope, projectRoot, homeDir });

    for (const name of agentNames) {
      const copy = await resolveNamedTargetAgentPath(adapter, agentsDir, name);
      if (!copy) continue;
      copies.push({
        agentName: name,
        path: copy.path,
        form: copy.form,
        adapterId: adapter.id,
        adapterLabel: getColoredLabel(adapter),
        scope,
        projectRoot: scope === 'local' ? projectRoot : undefined,
      });
    }
  }

  return copies;
}
