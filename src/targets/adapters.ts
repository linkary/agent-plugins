import path from 'node:path';

export type Scope = 'local' | 'global';

export type TargetId = 'cursor' | 'gemini' | 'codex' | 'claude-code' | 'antigravity';

export type ResolveParams = {
  scope: Scope;
  projectRoot: string;
  homeDir: string;
};

export type TargetAdapter = {
  id: TargetId;
  label: string;
  aliases: string[];
  resolveSkillsDir(params: ResolveParams): string;
};

function getCodexHomeDir(homeDir: string): string {
  const override = process.env.CODEX_HOME;
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(homeDir, '.codex');
}

const adapters: TargetAdapter[] = [
  {
    id: 'cursor',
    label: 'Cursor',
    aliases: ['cursor'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.cursor', 'skills')
        : path.join(projectRoot, '.cursor', 'skills'),
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    aliases: ['gemini', 'gemini-cli'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.gemini', 'skills')
        : path.join(projectRoot, '.gemini', 'skills'),
  },
  {
    id: 'codex',
    label: 'Codex',
    aliases: ['codex'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(getCodexHomeDir(homeDir), 'skills')
        : path.join(projectRoot, '.codex', 'skills'),
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    aliases: ['claude', 'claude-code', 'claudecode'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.claude', 'skills')
        : path.join(projectRoot, '.claude', 'skills'),
  },
  {
    id: 'antigravity',
    label: 'Google Antigravity',
    aliases: ['antigravity', 'anti-gravity'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.gemini', 'antigravity', 'global_skills')
        : path.join(projectRoot, '.agent', 'skills'),
  },
];

export function getAdapters(): TargetAdapter[] {
  return adapters.slice();
}

export function resolveAdapter(input: string): TargetAdapter | null {
  const normalized = input.trim().toLowerCase();
  for (const adapter of adapters) {
    if (adapter.id === normalized) return adapter;
    if (adapter.aliases.includes(normalized)) return adapter;
  }
  return null;
}
