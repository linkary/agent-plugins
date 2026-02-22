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

export type CommandRecord = {
  name: string;
  form: 'directory' | 'file';
  addedAt: string;
  updatedAt: string;
  source: SkillSource;
};

export type AgentRecord = {
  name: string;
  addedAt: string;
  updatedAt: string;
  source: SkillSource;
};

export type RuleRecord = {
  name: string;
  addedAt: string;
  updatedAt: string;
  source: SkillSource;
};

export type McpSource =
  | { type: 'manual' }
  | { type: 'collected'; from: { target: string; scope: string } };

export type McpRecord = {
  name: string;
  addedAt: string;
  updatedAt: string;
  source: McpSource;
};

export type RegistryFileV1 = {
  version: 1;
  skills: Record<string, SkillRecord>;
  agents?: Record<string, AgentRecord>;
  commands?: Record<string, CommandRecord>;
  rules?: Record<string, RuleRecord>;
  mcp?: Record<string, McpRecord>;
  repos?: Record<string, RepoRecord>;
  agentRepos?: Record<string, RepoRecord>;
  commandRepos?: Record<string, RepoRecord>;
  ruleRepos?: Record<string, RepoRecord>;
};

function createEmptyRegistry(): RegistryFileV1 {
  return {
    version: 1,
    skills: {},
    agents: {},
    commands: {},
    rules: {},
    mcp: {},
    repos: {},
    agentRepos: {},
    commandRepos: {},
    ruleRepos: {},
  };
}

export async function loadRegistry(): Promise<RegistryFileV1> {
  const registryPath = getRegistryPath();
  if (!(await pathExists(registryPath))) return createEmptyRegistry();
  const parsed = await readJsonFile<RegistryFileV1>(registryPath);
  if (parsed.version !== 1 || !parsed.skills) return createEmptyRegistry();
  // 确保可选字段存在
  if (!parsed.repos) parsed.repos = {};
  if (!parsed.agents) parsed.agents = {};
  if (!parsed.commands) parsed.commands = {};
  if (!parsed.rules) parsed.rules = {};
  if (!parsed.mcp) parsed.mcp = {};
  if (!parsed.agentRepos) parsed.agentRepos = {};
  if (!parsed.commandRepos) parsed.commandRepos = {};
  if (!parsed.ruleRepos) parsed.ruleRepos = {};
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
    .replace(/:(?!\/)/, '/') // git@github.com:user/repo -> github.com/user/repo
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

/** Remove an agent from its agent-repo record; returns true if repo record was deleted */
export function removeAgentFromRepo(registry: RegistryFileV1, agentName: string): boolean {
  if (!registry.agentRepos) return false;

  for (const [key, repo] of Object.entries(registry.agentRepos)) {
    const idx = repo.skills.indexOf(agentName);
    if (idx !== -1) {
      repo.skills.splice(idx, 1);
      if (repo.skills.length === 0) {
        delete registry.agentRepos[key];
        return true;
      }
      return false;
    }
  }
  return false;
}

/** Remove a command from its command-repo record; returns true if repo record was deleted */
export function removeCommandFromRepo(registry: RegistryFileV1, commandName: string): boolean {
  if (!registry.commandRepos) return false;

  for (const [key, repo] of Object.entries(registry.commandRepos)) {
    const idx = repo.skills.indexOf(commandName);
    if (idx !== -1) {
      repo.skills.splice(idx, 1);
      if (repo.skills.length === 0) {
        delete registry.commandRepos[key];
        return true;
      }
      return false;
    }
  }
  return false;
}

/** Remove a rule from its rule-repo record; returns true if repo record was deleted */
export function removeRuleFromRepo(registry: RegistryFileV1, ruleName: string): boolean {
  if (!registry.ruleRepos) return false;

  for (const [key, repo] of Object.entries(registry.ruleRepos)) {
    const idx = repo.skills.indexOf(ruleName);
    if (idx !== -1) {
      repo.skills.splice(idx, 1);
      if (repo.skills.length === 0) {
        delete registry.ruleRepos[key];
        return true;
      }
      return false;
    }
  }
  return false;
}
