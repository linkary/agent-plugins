import { getRegistryPath } from '../util/apg-paths.js';
import { pathExists, readJsonFile, writeJsonFileAtomic } from '../util/fs-utils.js';

export type SkillSource =
  | { type: 'git'; url: string; ref?: string }
  | { type: 'local'; path: string }
  | { type: 'collected'; from: { target: string; scope: string; path: string } };

export type SkillRecord = {
  name: string;
  addedAt: string;
  updatedAt: string;
  source: SkillSource;
};

export type RegistryFileV1 = {
  version: 1;
  skills: Record<string, SkillRecord>;
};

function createEmptyRegistry(): RegistryFileV1 {
  return { version: 1, skills: {} };
}

export async function loadRegistry(): Promise<RegistryFileV1> {
  const registryPath = getRegistryPath();
  if (!(await pathExists(registryPath))) return createEmptyRegistry();
  const parsed = await readJsonFile<RegistryFileV1>(registryPath);
  if (parsed.version !== 1 || !parsed.skills) return createEmptyRegistry();
  return parsed;
}

export async function saveRegistry(registry: RegistryFileV1): Promise<void> {
  await writeJsonFileAtomic(getRegistryPath(), registry);
}
