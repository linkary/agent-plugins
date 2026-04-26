import path from 'node:path';
import { normalizeRepoUrl, type RegistryFileV1, type SkillSource } from '../core/registry.js';

export type ArtifactKind = 'skills' | 'agents' | 'commands' | 'rules';

export type ConflictStatus = 'new' | 'identical' | 'same-source update' | 'different-source conflict';

export function sourceIdentity(source: SkillSource): string {
  if (source.type === 'git') {
    return `git:${normalizeRepoUrl(source.url)}${source.ref ? `#${source.ref}` : ''}`;
  }
  if (source.type === 'local') {
    return `local:${path.resolve(source.path)}`;
  }
  return `collected:${source.from.target}:${source.from.scope}:${path.resolve(source.from.path)}`;
}

export function sameSource(a: SkillSource | undefined, b: SkillSource): boolean {
  return Boolean(a && sourceIdentity(a) === sourceIdentity(b));
}

export function classifySourceConflict(params: {
  existingSource?: SkillSource;
  incomingSource: SkillSource;
  contentStatus: 'new' | 'identical' | 'update' | 'conflict';
}): ConflictStatus {
  if (params.contentStatus === 'new') {
    return 'new';
  }
  if (params.contentStatus === 'identical') {
    return 'identical';
  }
  if (!params.existingSource) {
    return 'different-source conflict';
  }
  return sameSource(params.existingSource, params.incomingSource) ? 'same-source update' : 'different-source conflict';
}

export function sourceLabel(source: SkillSource | undefined): string {
  if (!source) return 'unknown source';
  if (source.type === 'git') return source.ref ? `${source.url}#${source.ref}` : source.url;
  if (source.type === 'local') return path.resolve(source.path);
  return `${source.from.target}/${source.from.scope}:${source.from.path}`;
}

export function suggestAliasName(name: string, source: SkillSource): string {
  let suffix = 'alias';
  if (source.type === 'git') {
    suffix = ownerFromGitUrl(source.url) ?? suffix;
  } else if (source.type === 'local') {
    suffix = path.basename(path.resolve(source.path)) || suffix;
  } else {
    suffix = source.from.target;
  }
  return sanitizeArtifactName(`${name}-${suffix}`);
}

export async function uniqueAliasName(
  baseName: string,
  exists: (name: string) => Promise<boolean>,
): Promise<string> {
  if (!(await exists(baseName))) return baseName;
  let counter = 2;
  while (await exists(`${baseName}-${counter}`)) {
    counter++;
  }
  return `${baseName}-${counter}`;
}

export function removeGitSourceTracking(params: {
  registry: RegistryFileV1;
  kind: ArtifactKind;
  name: string;
  source?: SkillSource;
}): void {
  if (!params.source || params.source.type !== 'git') return;
  const repos = repoMapForKind(params.registry, params.kind);
  const repoKey = normalizeRepoUrl(params.source.url);
  const repo = repos[repoKey];
  if (!repo) return;
  repo.skills = repo.skills.filter((entry) => entry !== params.name);
  if (repo.skills.length === 0) {
    delete repos[repoKey];
  }
}

export function repoMapForKind(registry: RegistryFileV1, kind: ArtifactKind) {
  if (kind === 'skills') {
    registry.repos ??= {};
    return registry.repos;
  }
  if (kind === 'agents') {
    registry.agentRepos ??= {};
    return registry.agentRepos;
  }
  if (kind === 'commands') {
    registry.commandRepos ??= {};
    return registry.commandRepos;
  }
  registry.ruleRepos ??= {};
  return registry.ruleRepos;
}

function ownerFromGitUrl(url: string): string | null {
  const normalized = normalizeRepoUrl(url);
  const parts = normalized.split('/');
  return parts.length >= 2 ? parts[parts.length - 2] ?? null : null;
}

function sanitizeArtifactName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
