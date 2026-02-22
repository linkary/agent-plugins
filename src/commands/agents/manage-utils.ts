import path from 'node:path';
import fs from 'node:fs/promises';
import {
  filterAgentAdapters,
  getColoredLabel,
  getAdapters,
  type TargetAdapter,
  type Scope,
} from '../../targets/adapters.js';
import { pathExists } from '../../util/fs-utils.js';
import { resolveTargetContext } from '../../util/scope.js';
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

type AgentItem = { name: string; path: string; form: 'directory' | 'file' };

async function listAgentItems(agentsDir: string): Promise<AgentItem[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.readdir(agentsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const dedup = new Map<string, AgentItem>();
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      dedup.set(entry.name, {
        name: entry.name,
        path: path.join(agentsDir, entry.name),
        form: 'directory',
      });
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const name = entry.name.slice(0, -3);
    if (dedup.has(name)) continue;
    dedup.set(name, {
      name,
      path: path.join(agentsDir, entry.name),
      form: 'file',
    });
  }

  return [...dedup.values()].sort((a, b) => a.name.localeCompare(b.name));
}

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
    const agents = await listAgentItems(agentsDir);

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
      const dirPath = path.join(agentsDir, name);
      const mdPath = path.join(agentsDir, `${name}.md`);
      const [dirExists, fileExists] = await Promise.all([pathExists(dirPath), pathExists(mdPath)]);
      const copyPath = dirExists ? dirPath : fileExists ? mdPath : null;
      if (copyPath) {
        copies.push({
          agentName: name,
          path: copyPath,
          form: dirExists ? 'directory' : 'file',
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
