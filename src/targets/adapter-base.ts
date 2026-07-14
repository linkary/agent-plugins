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
 * - path: 供应商自有文件/目录存在(应用包、安装目录等)
 * 证据之间为 OR 关系。切勿使用会在卸载后残留、或 agent-plugins 自身会写入的路径
 * (数据目录、auth/session、skills/agents/commands/rules、各类 MCP 配置)。
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
