import { getConfigPath } from '../util/apg-paths.js';
import { pathExists, readJsonFile, writeJsonFileAtomic } from '../util/fs-utils.js';
import type { Scope, TargetId } from '../targets/adapters.js';

export type TargetConfigV1 = {
  defaultScope?: Scope;
  include?: string[]; // skill names; supports ['*']
};

export type ConfigV1 = {
  version: 1;
  targets: Partial<Record<TargetId, TargetConfigV1>>;
};

function defaultConfig(): ConfigV1 {
  return {
    version: 1,
    targets: {
      cursor: { defaultScope: 'local', include: ['*'] },
      gemini: { defaultScope: 'local', include: ['*'] },
      codex: { defaultScope: 'local', include: ['*'] },
      'claude-code': { defaultScope: 'local', include: ['*'] },
      antigravity: { defaultScope: 'local', include: ['*'] },
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
