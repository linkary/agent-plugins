import path from 'node:path';

export type Scope = 'local' | 'global';

export type TargetId = 'cursor' | 'gemini' | 'codex' | 'claude-code' | 'antigravity' | 'openskills';

export type ResolveParams = {
  scope: Scope;
  projectRoot: string;
  homeDir: string;
};

/** ANSI color codes for terminal output */
export const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  brightCyan: '\x1b[96m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
} as const;

export type TargetAdapter = {
  id: TargetId;
  label: string;
  color: string; // ANSI color code for this adapter
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
    color: ANSI.cyan,
    aliases: ['cursor'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.cursor', 'skills')
        : path.join(projectRoot, '.cursor', 'skills'),
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    color: ANSI.magenta,
    aliases: ['gemini', 'gemini-cli'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.gemini', 'skills')
        : path.join(projectRoot, '.gemini', 'skills'),
  },
  {
    id: 'codex',
    label: 'Codex',
    color: ANSI.green,
    aliases: ['codex'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(getCodexHomeDir(homeDir), 'skills')
        : path.join(projectRoot, '.codex', 'skills'),
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    color: ANSI.yellow,
    aliases: ['claude', 'claude-code', 'claudecode'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.claude', 'skills')
        : path.join(projectRoot, '.claude', 'skills'),
  },
  {
    id: 'antigravity',
    label: 'Google Antigravity',
    color: ANSI.blue,
    aliases: ['antigravity', 'anti-gravity'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.gemini', 'antigravity', 'global_skills')
        : path.join(projectRoot, '.agent', 'skills'),
  },
  {
    id: 'openskills',
    label: 'Openskills',
    color: ANSI.brightCyan,
    aliases: ['openskills'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.agent', 'skills')
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
