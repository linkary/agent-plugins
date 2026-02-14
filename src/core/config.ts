import { getConfigPath } from '../util/apg-paths.js';
import { pathExists, readJsonFile, writeJsonFileAtomic } from '../util/fs-utils.js';
import type { Scope, TargetId } from '../targets/adapters.js';

export type TargetConfigV1 = {
  defaultScope?: Scope;
  include?: string[]; // skill names; supports ['*']
  includeAgents?: string[]; // agent names; supports ['*']
  includeCommands?: string[]; // command names; supports ['*']
  includeMcp?: string[]; // MCP server names; supports ['*']
};

export type ConfigV1 = {
  version: 1;
  targets: Partial<Record<TargetId, TargetConfigV1>>;
};

function defaultConfig(): ConfigV1 {
  return {
    version: 1,
    targets: {
      cursor: { defaultScope: 'global', include: ['*'], includeAgents: ['*'] },
      gemini: { defaultScope: 'global', include: ['*'], includeAgents: ['*'] },
      codex: { defaultScope: 'global', include: ['*'], includeAgents: ['*'] },
      'claude-code': { defaultScope: 'global', include: ['*'], includeAgents: ['*'] },
      antigravity: { defaultScope: 'global', include: ['*'], includeAgents: ['*'] },
      openskills: { defaultScope: 'global', include: ['*'], includeAgents: ['*'] },
      agents: { defaultScope: 'global', include: ['*'], includeAgents: ['*'] },
      opencode: { defaultScope: 'global', include: ['*'], includeAgents: ['*'] },
      qoder: { defaultScope: 'global', include: ['*'], includeAgents: ['*'] },
    },
  };
}

export async function loadConfig(): Promise<ConfigV1> {
  const filePath = getConfigPath();
  if (!(await pathExists(filePath))) return defaultConfig();
  try {
    const parsed = await readJsonFile<ConfigV1>(filePath);
    if (parsed?.version === 1 && parsed.targets) {
      const base = defaultConfig();
      return { ...base, ...parsed, targets: { ...base.targets, ...parsed.targets } };
    }
  } catch {
    // ignore
  }
  return defaultConfig();
}

export async function saveConfig(config: ConfigV1): Promise<void> {
  await writeJsonFileAtomic(getConfigPath(), config);
}
