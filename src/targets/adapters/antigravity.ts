import path from 'node:path';
import { ANSI } from '../../util/ansi.js';
import type { TargetAdapter } from '../adapter-base.js';
import { guiApp } from '../builders/detection.js';

export const antigravityAdapter: TargetAdapter = {
  id: 'antigravity',
  label: 'Google Antigravity',
  color: ANSI.skyBlue,
  aliases: ['antigravity', 'anti-gravity'],
  // GUI IDE 应用本体,或 agy CLI;不使用应用数据目录(卸载后残留)。
  detectInstall: guiApp({
    macApps: ['Antigravity.app', 'Antigravity IDE.app'],
    winExe: ['Antigravity', 'Antigravity.exe'],
    cliBin: 'agy',
  }),
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
  // Global rules 为单文件 (~/.gemini/GEMINI.md),不兼容目录模式;local rules 使用 .agent/rules/
  resolveRulesDir: ({ scope, projectRoot }) =>
    scope === 'global' ? '' : path.join(projectRoot, '.agent', 'rules'),
  // Antigravity 仅支持 global 级别的 MCP 配置 (~/.gemini/antigravity/mcp_config.json)
  resolveMcpConfig: ({ scope, homeDir }) =>
    scope === 'global'
      ? {
          configPath: path.join(homeDir, '.gemini', 'antigravity', 'mcp_config.json'),
          format: 'json',
          serversKey: 'mcpServers',
        }
      : null,
};
