import path from 'node:path';
import { ANSI } from '../util/ansi.js';
import type { McpConfigSpec } from '../core/mcp-types.js';

export type Scope = 'local' | 'global';

export type TargetId =
  | 'cursor'
  | 'codex'
  | 'claude-code'
  | 'antigravity'
  | 'agents'
  | 'opencode'
  | 'qoder'
  | 'qodercli';

export type ResolveParams = {
  scope: Scope;
  projectRoot: string;
  homeDir: string;
};

/** 安装检测上下文(可注入 platform/env/homeDir 以便跨平台测试)。 */
export type DetectContext = {
  homeDir: string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
};

/**
 * 「已安装」证据:
 * - bin:  可执行文件在 PATH 中可解析
 * - path: 供应商自有文件/目录存在(应用包、应用数据目录、auth/session 文件等)
 * 证据之间为 OR 关系。切勿使用 agent-plugins 自身会写入的路径(skills/agents/commands/rules、各类 MCP 配置)。
 */
export type InstallEvidence = { kind: 'bin'; name: string } | { kind: 'path'; path: string };

export type TargetAdapter = {
  id: TargetId;
  label: string;
  color: string; // ANSI color code for this adapter
  aliases: string[];
  agentFormat?: 'filesystem-markdown' | 'codex-toml';
  /** true 表示始终可用(如 ~/.agents 全局约定),跳过安装检测。 */
  alwaysAvailable?: boolean;
  /** 返回「已安装」证据(OR 关系);未定义且非 alwaysAvailable 时视为不可检测(默认隐藏)。 */
  detectInstall?(ctx: DetectContext): InstallEvidence[];
  resolveSkillsDir(params: ResolveParams): string;
  resolveAgentsDir(params: ResolveParams): string;
  resolveCommandsDir(params: ResolveParams): string;
  resolveRulesDir(params: ResolveParams): string;
  /** 返回 MCP 配置文件规格；null 表示该工具不支持 MCP */
  resolveMcpConfig?(params: ResolveParams): McpConfigSpec | null;
};

const SKILLS_ONLY_TARGET_IDS = new Set<TargetId>(['agents']);

/** Targets that do not support agents sync. */
const NO_AGENTS_IDS = new Set<TargetId>(['agents', 'antigravity']);

/** Targets that do not support commands sync. */
const NO_COMMANDS_IDS = new Set<TargetId>(['agents']);

/** Windows 下 %LOCALAPPDATA%\Programs\... 安装路径。 */
function winProgramsPath(ctx: DetectContext, ...segments: string[]): string {
  const base = ctx.env.LOCALAPPDATA || path.join(ctx.homeDir, 'AppData', 'Local');
  return path.join(base, 'Programs', ...segments);
}

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
    agentFormat: 'filesystem-markdown',
    // GUI IDE:仅以应用本体为准。数据目录/扩展目录/`cursor` CLI shim 在卸载后都会残留,不能作为依据
    //(例如残留的 `cursor` shim 运行时会报 "No Cursor IDE installation found")。
    detectInstall: (ctx) => {
      if (ctx.platform === 'darwin')
        return [
          { kind: 'path', path: '/Applications/Cursor.app' },
          { kind: 'path', path: path.join(ctx.homeDir, 'Applications', 'Cursor.app') },
        ];
      if (ctx.platform === 'win32') return [{ kind: 'path', path: winProgramsPath(ctx, 'Cursor', 'Cursor.exe') }];
      return [{ kind: 'bin', name: 'cursor' }]; // Linux 等:以 PATH 上的可执行文件为准
    },
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
    id: 'codex',
    label: 'Codex',
    color: ANSI.cyan,
    aliases: ['codex'],
    agentFormat: 'codex-toml',
    // CLI:仅以 PATH 上可解析的可执行文件为准(auth.json/sessions/config.toml 卸载后残留,不能用)。
    detectInstall: () => [{ kind: 'bin', name: 'codex' }],
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
    color: ANSI.anthropicClay,
    aliases: ['claude', 'claude-code', 'claudecode'],
    agentFormat: 'filesystem-markdown',
    // CLI:PATH 可执行文件,或原生安装器放置的实际二进制 ~/.claude/bin/claude。
    // 不使用 ~/.claude.json / projects / history / credentials(ap 写入或卸载后残留)。
    detectInstall: (ctx) => [
      { kind: 'bin', name: 'claude' },
      { kind: 'path', path: path.join(ctx.homeDir, '.claude', 'bin', 'claude') },
    ],
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
    color: ANSI.skyBlue,
    aliases: ['antigravity', 'anti-gravity'],
    // GUI IDE 应用本体,或 agy CLI;不使用应用数据目录(~/Library/Application Support/Antigravity 卸载后残留)。
    detectInstall: (ctx) => {
      const ev: InstallEvidence[] = [{ kind: 'bin', name: 'agy' }];
      if (ctx.platform === 'darwin') {
        ev.push({ kind: 'path', path: '/Applications/Antigravity.app' });
        ev.push({ kind: 'path', path: '/Applications/Antigravity IDE.app' });
        ev.push({ kind: 'path', path: path.join(ctx.homeDir, 'Applications', 'Antigravity.app') });
      }
      if (ctx.platform === 'win32') ev.push({ kind: 'path', path: winProgramsPath(ctx, 'Antigravity', 'Antigravity.exe') });
      return ev;
    },
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
    id: 'agents',
    label: 'Agentskills',
    color: ANSI.orange,
    aliases: ['agents'],
    // ~/.agents 是被多种工具识别的全局约定,并非独立应用;始终可用。
    alwaysAvailable: true,
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
    agentFormat: 'filesystem-markdown',
    // CLI:PATH 可执行文件,或安装脚本放置的实际二进制 ~/.opencode/bin/opencode。
    // 不使用 ~/.local/share/opencode 或 ~/.config/opencode(数据/配置,卸载后残留)。
    detectInstall: (ctx) => [
      { kind: 'bin', name: 'opencode' },
      { kind: 'path', path: path.join(ctx.homeDir, '.opencode', 'bin', 'opencode') },
    ],
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
    color: ANSI.qoderGreen,
    aliases: ['qoder'],
    agentFormat: 'filesystem-markdown',
    // Qoder IDE(GUI):仅以应用本体为准(~/.qoder 子目录及其 CLI 缓存卸载后残留)。
    detectInstall: (ctx) => {
      if (ctx.platform === 'darwin') return [{ kind: 'path', path: '/Applications/Qoder.app' }];
      if (ctx.platform === 'win32') return [{ kind: 'path', path: winProgramsPath(ctx, 'Qoder', 'Qoder.exe') }];
      return [{ kind: 'bin', name: 'qoder' }]; // Linux 等
    },
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.qoder', 'skills') : path.join(projectRoot, '.qoder', 'skills'),
    resolveAgentsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.qoder', 'agents') : path.join(projectRoot, '.qoder', 'agents'),
    resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.qoder', 'commands') : path.join(projectRoot, '.qoder', 'commands'),
    resolveRulesDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? '' : path.join(projectRoot, '.qoder', 'rules'),
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
  {
    id: 'qodercli',
    label: 'QoderCLI',
    color: ANSI.qoderGreen,
    aliases: ['qodercli', 'qoder-cli'],
    agentFormat: 'filesystem-markdown',
    // Qoder CLI:npm 包 @qoder-ai/qodercli 提供的 `qodercli` 可执行文件。
    detectInstall: () => [{ kind: 'bin', name: 'qodercli' }],
    resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.qoder', 'skills') : path.join(projectRoot, '.qoder', 'skills'),
    resolveAgentsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.qoder', 'agents') : path.join(projectRoot, '.qoder', 'agents'),
    resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? path.join(homeDir, '.qoder', 'commands') : path.join(projectRoot, '.qoder', 'commands'),
    resolveRulesDir: ({ scope, projectRoot, homeDir }) =>
      scope === 'global' ? '' : path.join(projectRoot, '.qoder', 'rules'),
    resolveMcpConfig: ({ scope, projectRoot, homeDir }) => ({
      configPath:
        scope === 'global'
          ? path.join(homeDir, '.qoder', 'settings.json')
          : path.join(projectRoot, '.qoder', 'settings.json'),
      format: 'json',
      serversKey: 'mcpServers',
    }),
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

export function isQoderFamily(id: TargetId): boolean {
  return id === 'qoder' || id === 'qodercli';
}
