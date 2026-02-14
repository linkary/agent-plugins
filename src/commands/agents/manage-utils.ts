import path from 'node:path';
import { getColoredLabel, getAdapters, type TargetAdapter, type Scope } from '../../targets/adapters.js';
import { listDirNames, pathExists } from '../../util/fs-utils.js';
import { resolveTargetContext } from '../../util/scope.js';
import type { ConfigV1 } from '../../core/config.js';

export type TargetAgent = {
  name: string;
  path: string;
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
    const agents = await listDirNames(agentsDir);

    for (const name of agents) {
      allAgents.push({
        name,
        path: path.join(agentsDir, name),
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
  const adapters = getAdapters();
  const copies: SyncedAgentCopy[] = [];

  for (const adapter of adapters) {
    const targetConfig = config.targets[adapter.id];
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      defaultScope: targetConfig?.defaultScope ?? 'global',
      currentCwd,
    });

    const agentsDir = adapter.resolveAgentsDir({ scope, projectRoot, homeDir });

    for (const name of agentNames) {
      const agentPath = path.join(agentsDir, name);
      if (await pathExists(agentPath)) {
        copies.push({
          agentName: name,
          path: agentPath,
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
