import path from 'node:path';
import { ANSI } from '../util/ansi.js';

export type Scope = 'local' | 'global';

export type TargetId = 'cursor' | 'gemini' | 'codex' | 'claude-code' | 'antigravity' | 'openskills' | 'agents';

export type ResolveParams = {
  scope: Scope;
  projectRoot: string;
  homeDir: string;
};

export type TargetAdapter = {
  id: TargetId;
  label: string;
  color: string; // ANSI color code for this adapter
  aliases: string[];
  resolveSkillsDir(params: ResolveParams): string;
  resolveCommandsDir(params: ResolveParams): string;
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
    color: ANSI.brightMagenta,
    aliases: ['cursor'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.cursor', 'skills') : path.join(projectRoot, '.cursor', 'skills'),
    resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.cursor', 'commands') : path.join(projectRoot, '.cursor', 'commands'),
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    color: ANSI.magenta,
    aliases: ['gemini', 'gemini-cli'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.gemini', 'skills') : path.join(projectRoot, '.gemini', 'skills'),
    resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.gemini', 'commands')
        : path.join(projectRoot, '.gemini', 'commands'),
  },
  {
    id: 'codex',
    label: 'Codex',
    color: ANSI.green,
    aliases: ['codex'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(getCodexHomeDir(homeDir), 'skills') : path.join(projectRoot, '.codex', 'skills'),
    resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(getCodexHomeDir(homeDir), 'commands')
        : path.join(projectRoot, '.codex', 'commands'),
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    color: ANSI.yellow,
    aliases: ['claude', 'claude-code', 'claudecode'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.claude', 'skills') : path.join(projectRoot, '.claude', 'skills'),
    resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.claude', 'commands')
        : path.join(projectRoot, '.claude', 'commands'),
  },
  {
    id: 'antigravity',
    label: 'Google Antigravity',
    color: ANSI.brightBlue,
    aliases: ['antigravity', 'anti-gravity'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.gemini', 'antigravity', 'global_skills')
        : path.join(projectRoot, '.agent', 'skills'),
    resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.gemini', 'antigravity', 'global_commands')
        : path.join(projectRoot, '.agent', 'commands'),
  },
  {
    id: 'openskills',
    label: 'Openskills',
    color: ANSI.brightCyan,
    aliases: ['openskills'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.agent', 'skills') : path.join(projectRoot, '.agent', 'skills'),
    resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.agent', 'commands')
        : path.join(projectRoot, '.agent', 'commands'),
  },
  {
    id: 'agents',
    label: 'Agentskills (Vercel Labs)',
    color: ANSI.orange,
    aliases: ['agents'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.agents', 'skills') : path.join(projectRoot, '.agents', 'skills'),
    resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.agents', 'commands')
        : path.join(projectRoot, '.agents', 'commands'),
  },
];

export function getAdapters(): TargetAdapter[] {
  return adapters.slice();
}

export function getColoredLabel(adapter: TargetAdapter): string {
  return `${adapter.color}${adapter.label}${ANSI.reset}`;
}

export function resolveAdapter(input: string): TargetAdapter | null {
  const normalized = input.trim().toLowerCase();
  for (const adapter of adapters) {
    if (adapter.id === normalized) return adapter;
    if (adapter.aliases.includes(normalized)) return adapter;
  }
  return null;
}
