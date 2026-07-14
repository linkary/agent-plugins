import path from 'node:path';
import { ANSI } from '../../util/ansi.js';
import type { TargetAdapter } from '../adapter-base.js';
import { cliBin } from '../builders/detection.js';

/** Codex home 目录(尊重 CODEX_HOME)。 */
function codexHome(homeDir: string): string {
  const override = process.env.CODEX_HOME;
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(homeDir, '.codex');
}

export const codexAdapter: TargetAdapter = {
  id: 'codex',
  label: 'Codex',
  color: ANSI.cyan,
  aliases: ['codex'],
  agentFormat: 'codex-toml',
  // CLI:仅以 PATH 上可解析的可执行文件为准(auth.json/sessions/config.toml 卸载后残留,不能用)。
  detectInstall: cliBin('codex'),
  resolveSkillsDir: ({ scope, projectRoot, homeDir }) =>
    scope === 'global' ? path.join(codexHome(homeDir), 'skills') : path.join(projectRoot, '.codex', 'skills'),
  resolveAgentsDir: ({ scope, projectRoot, homeDir }) =>
    scope === 'global' ? path.join(codexHome(homeDir), 'agents') : path.join(projectRoot, '.codex', 'agents'),
  resolveCommandsDir: ({ scope, projectRoot, homeDir }) =>
    scope === 'global' ? path.join(codexHome(homeDir), 'commands') : path.join(projectRoot, '.codex', 'commands'),
  resolveRulesDir: ({ scope, projectRoot, homeDir }) =>
    scope === 'global' ? path.join(codexHome(homeDir), 'rules') : path.join(projectRoot, '.codex', 'rules'),
  // Codex 仅支持 global 级别的 MCP 配置 (config.toml)
  resolveMcpConfig: ({ scope, homeDir }) =>
    scope === 'global'
      ? { configPath: path.join(codexHome(homeDir), 'config.toml'), format: 'toml', serversKey: 'mcp_servers' }
      : null,
};
