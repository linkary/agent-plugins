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

export type RepoRecord = {
  url: string;
  ref?: string;
  skills: string[];
  addedAt: string;
  updatedAt: string;
};

export type RegistryFileV1 = {
  version: 1;
  skills: Record<string, SkillRecord>;
  repos?: Record<string, RepoRecord>;
};

function createEmptyRegistry(): RegistryFileV1 {
  return { version: 1, skills: {}, repos: {} };
}

export async function loadRegistry(): Promise<RegistryFileV1> {
  const registryPath = getRegistryPath();
  if (!(await pathExists(registryPath))) return createEmptyRegistry();
  const parsed = await readJsonFile<RegistryFileV1>(registryPath);
  if (parsed.version !== 1 || !parsed.skills) return createEmptyRegistry();
  // Ensure repos exists
  if (!parsed.repos) parsed.repos = {};
  return parsed;
}

export async function saveRegistry(registry: RegistryFileV1): Promise<void> {
  await writeJsonFileAtomic(getRegistryPath(), registry);
}

/** Normalize a git URL to a consistent key for repos lookup */
export function normalizeRepoUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^git@/, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

/** Find repo record by URL (checks normalized form) */
export function findRepoByUrl(registry: RegistryFileV1, url: string): RepoRecord | undefined {
  const key = normalizeRepoUrl(url);
  return registry.repos?.[key];
}

/** Remove a skill from its repo record; returns true if repo record was deleted */
export function removeSkillFromRepo(registry: RegistryFileV1, skillName: string): boolean {
  if (!registry.repos) return false;
  
  for (const [key, repo] of Object.entries(registry.repos)) {
    const idx = repo.skills.indexOf(skillName);
    if (idx !== -1) {
      repo.skills.splice(idx, 1);
      if (repo.skills.length === 0) {
        delete registry.repos[key];
        return true;
      }
      return false;
    }
  }
  return false;
}
