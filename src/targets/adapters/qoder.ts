import path from 'node:path';
import { ANSI } from '../../util/ansi.js';
import type { TargetAdapter } from '../adapter-base.js';
import { guiApp } from '../builders/detection.js';
import { dotDir, dotRulesLocalOnly } from '../builders/paths.js';
import { jsonMcp } from '../builders/mcp.js';

/** Qoder 应用数据目录(各平台);用于 global MCP 配置位置。 */
function qoderAppDataDir(homeDir: string): string {
  switch (process.platform) {
    case 'darwin':
      return path.join(homeDir, 'Library', 'Application Support', 'Qoder');
    case 'win32':
      return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'Qoder');
    default: // Linux and others
      return path.join(homeDir, '.config', 'Qoder');
  }
}

export const qoderAdapter: TargetAdapter = {
  id: 'qoder',
  label: 'Qoder',
  color: ANSI.qoderGreen,
  aliases: ['qoder'],
  agentFormat: 'filesystem-markdown',
  // Qoder IDE(GUI):仅以应用本体为准(~/.qoder 子目录及其 CLI 缓存卸载后残留)。
  detectInstall: guiApp({ macApps: ['Qoder.app'], winExe: ['Qoder', 'Qoder.exe'], linuxBin: 'qoder' }),
  ...dotDir('.qoder'),
  resolveRulesDir: dotRulesLocalOnly('.qoder'),
  resolveMcpConfig: jsonMcp(({ scope, projectRoot, homeDir }) =>
    scope === 'global'
      ? path.join(qoderAppDataDir(homeDir), 'SharedClientCache', 'mcp.json')
      : path.join(projectRoot, '.mcp.json'),
  ),
};
