import path from 'node:path';
import { ANSI } from '../util/ansi.js';
import type { McpConfigSpec } from '../core/mcp-types.js';

export type Scope = 'local' | 'global';

export type TargetId =
  | 'cursor'
  | 'gemini'
  | 'codex'
  | 'claude-code'
  | 'antigravity'
  | 'openskills'
  | 'agents'
  | 'opencode'
  | 'qoder';

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
  resolveAgentsDir(params: ResolveParams): string;
  resolveCommandsDir(params: ResolveParams): string;
  resolveRulesDir(params: ResolveParams): string;
  /** 返回 MCP 配置文件规格；null 表示该工具不支持 MCP */
  resolveMcpConfig?(params: ResolveParams): McpConfigSpec | null;
};

const SKILLS_ONLY_TARGET_IDS = new Set<TargetId>(['openskills', 'agents']);

/** Targets that do not support agents sync. */
const NO_AGENTS_IDS = new Set<TargetId>(['openskills', 'agents', 'antigravity']);

/** Targets that do not support commands sync. */
const NO_COMMANDS_IDS = new Set<TargetId>(['openskills', 'agents']);

function getCodexHomeDir(homeDir: string): string {
  const override = process.env.CODEX_HOME;
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(homeDir, '.codex');
}

function getQoderAppDataDir(homeDir: string): string {
  switch (process.platform) {
    case 'darwin':
      return path.join(homeDir, 'Library', 'Application Support', 'Qoder');
    case 'win32':
      return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'Qoder');
    default: // Linux and others
      return path.join(homeDir, '.config', 'Qoder');
  }
}

const adapters: TargetAdapter[] = [
  {
    id: 'cursor',
    label: 'Cursor',
    color: ANSI.brightMagenta,
    aliases: ['cursor'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.cursor', 'skills') : path.join(projectRoot, '.cursor', 'skills'),
    resolveAgentsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.cursor', 'agents') : path.join(projectRoot, '.cursor', 'agents'),
    resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.cursor', 'commands') : path.join(projectRoot, '.cursor', 'commands'),
    // Global rules 通过 SQLite User Rules 处理 (GlobalRulesStore)，不使用目录
    resolveRulesDir: ({ scope, projectRoot }) =>
      scope === 'global' ? '' : path.join(projectRoot, '.cursor', 'rules'),
    resolveMcpConfig: ({ scope, projectRoot, homeDir }) => ({
      configPath:
        scope === 'global' ? path.join(homeDir, '.cursor', 'mcp.json') : path.join(projectRoot, '.cursor', 'mcp.json'),
      format: 'json',
      serversKey: 'mcpServers',
    }),
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    color: ANSI.magenta,
    aliases: ['gemini', 'gemini-cli'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.gemini', 'skills') : path.join(projectRoot, '.gemini', 'skills'),
    resolveAgentsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.gemini', 'agents') : path.join(projectRoot, '.gemini', 'agents'),
    resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.gemini', 'commands')
        : path.join(projectRoot, '.gemini', 'commands'),
    resolveRulesDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.gemini', 'rules') : path.join(projectRoot, '.gemini', 'rules'),
    resolveMcpConfig: ({ scope, projectRoot, homeDir }) => ({
      configPath:
        scope === 'global'
          ? path.join(homeDir, '.gemini', 'settings.json')
          : path.join(projectRoot, '.gemini', 'settings.json'),
      format: 'json',
      serversKey: 'mcpServers',
    }),
  },
  {
    id: 'codex',
    label: 'Codex',
    color: ANSI.green,
    aliases: ['codex'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(getCodexHomeDir(homeDir), 'skills') : path.join(projectRoot, '.codex', 'skills'),
    resolveAgentsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(getCodexHomeDir(homeDir), 'agents') : path.join(projectRoot, '.codex', 'agents'),
    resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(getCodexHomeDir(homeDir), 'commands')
        : path.join(projectRoot, '.codex', 'commands'),
    resolveRulesDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(getCodexHomeDir(homeDir), 'rules') : path.join(projectRoot, '.codex', 'rules'),
    // Codex 仅支持 global 级别的 MCP 配置 (config.toml)
    resolveMcpConfig: ({ scope, homeDir }) =>
      scope === 'global'
        ? { configPath: path.join(getCodexHomeDir(homeDir), 'config.toml'), format: 'toml', serversKey: 'mcp_servers' }
        : null,
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    color: ANSI.yellow,
    aliases: ['claude', 'claude-code', 'claudecode'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.claude', 'skills') : path.join(projectRoot, '.claude', 'skills'),
    resolveAgentsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.claude', 'agents') : path.join(projectRoot, '.claude', 'agents'),
    resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.claude', 'commands')
        : path.join(projectRoot, '.claude', 'commands'),
    // Global rules 通过 ~/.claude/CLAUDE.md 处理 (GlobalRulesStore)，不使用目录
    resolveRulesDir: ({ scope, projectRoot }) =>
      scope === 'global' ? '' : path.join(projectRoot, '.claude', 'rules'),
    resolveMcpConfig: ({ scope, projectRoot, homeDir }) => ({
      configPath:
        scope === 'global'
          ? path.join(homeDir, '.claude.json')
          : path.join(projectRoot, '.mcp.json'),
      format: 'json',
      serversKey: 'mcpServers',
    }),
  },
  {
    id: 'antigravity',
    label: 'Google Antigravity',
    color: ANSI.brightBlue,
    aliases: ['antigravity', 'anti-gravity'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.gemini', 'antigravity', 'skills')
        : path.join(projectRoot, '.agent', 'skills'),
    // Antigravity 不支持 agents 同步
    resolveAgentsDir: () => '',
    // Antigravity 的 commands 对应 workflows
    resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.gemini', 'antigravity', 'global_workflows')
        : path.join(projectRoot, '.agent', 'workflows'),
    // Global rules 为单文件 (~/.gemini/GEMINI.md)，不兼容目录模式；local rules 使用 .agent/rules/
    resolveRulesDir: ({ scope, projectRoot }) =>
      scope === 'global' ? '' : path.join(projectRoot, '.agent', 'rules'),
    // Antigravity 仅支持 global 级别的 MCP 配置 (~/.gemini/antigravity/mcp_config.json)
    resolveMcpConfig: ({ scope, homeDir }) =>
      scope === 'global'
        ? { configPath: path.join(homeDir, '.gemini', 'antigravity', 'mcp_config.json'), format: 'json', serversKey: 'mcpServers' }
        : null,
  },
  {
    id: 'openskills',
    label: 'Openskills',
    color: ANSI.brightCyan,
    aliases: ['openskills'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.agent', 'skills') : path.join(projectRoot, '.agent', 'skills'),
    resolveAgentsDir: () => '',
    resolveCommandsDir: () => '',
    resolveRulesDir: () => '',
  },
  {
    id: 'agents',
    label: 'Agentskills (Vercel Labs)',
    color: ANSI.orange,
    aliases: ['agents'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.agents', 'skills') : path.join(projectRoot, '.agents', 'skills'),
    resolveAgentsDir: () => '',
    resolveCommandsDir: () => '',
    resolveRulesDir: () => '',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    color: ANSI.teal,
    aliases: ['opencode', 'open-code'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.opencode', 'skills') : path.join(projectRoot, '.opencode', 'skills'),
    resolveAgentsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.opencode', 'agents') : path.join(projectRoot, '.opencode', 'agents'),
    resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? path.join(homeDir, '.opencode', 'commands')
        : path.join(projectRoot, '.opencode', 'commands'),
    resolveRulesDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.opencode', 'rules') : path.join(projectRoot, '.opencode', 'rules'),
    resolveMcpConfig: ({ scope, projectRoot, homeDir }) => ({
      configPath:
        scope === 'global'
          ? path.join(homeDir, '.opencode', 'mcp.json')
          : path.join(projectRoot, '.opencode', 'mcp.json'),
      format: 'json',
      serversKey: 'mcpServers',
    }),
  },
  {
    id: 'qoder',
    label: 'Qoder',
    color: ANSI.pink,
    aliases: ['qoder'],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.qoder', 'skills') : path.join(projectRoot, '.qoder', 'skills'),
    resolveAgentsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.qoder', 'agents') : path.join(projectRoot, '.qoder', 'agents'),
    resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.qoder', 'commands') : path.join(projectRoot, '.qoder', 'commands'),
    resolveRulesDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.qoder', 'rules') : path.join(projectRoot, '.qoder', 'rules'),
    resolveMcpConfig: ({ scope, projectRoot, homeDir }) =>
      scope === 'global'
        ? {
            configPath: path.join(getQoderAppDataDir(homeDir), 'SharedClientCache', 'mcp.json'),
            format: 'json',
            serversKey: 'mcpServers',
          }
        : {
            configPath: path.join(projectRoot, '.mcp.json'),
            format: 'json',
            serversKey: 'mcpServers',
          },
  },
];

export function getAdapters(): TargetAdapter[] {
  return adapters.slice();
}

export function filterCommandAdapters(adapters: TargetAdapter[]): TargetAdapter[] {
  return adapters.filter((adapter) => !NO_COMMANDS_IDS.has(adapter.id));
}

export function filterAgentAdapters(adapters: TargetAdapter[]): TargetAdapter[] {
  return adapters.filter((adapter) => !NO_AGENTS_IDS.has(adapter.id));
}

export function filterRuleAdapters(adapters: TargetAdapter[]): TargetAdapter[] {
  return adapters.filter((adapter) => !SKILLS_ONLY_TARGET_IDS.has(adapter.id));
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
