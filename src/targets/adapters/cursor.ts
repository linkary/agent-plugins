import path from 'node:path';
import { ANSI } from '../../util/ansi.js';
import type { TargetAdapter } from '../adapter-base.js';
import { guiApp } from '../builders/detection.js';
import { dotDir, dotRulesLocalOnly } from '../builders/paths.js';
import { jsonMcp } from '../builders/mcp.js';

export const cursorAdapter: TargetAdapter = {
  id: 'cursor',
  label: 'Cursor',
  color: ANSI.brightMagenta,
  aliases: ['cursor'],
  agentFormat: 'filesystem-markdown',
  // GUI IDE:仅以应用本体为准。数据目录/扩展/`cursor` CLI shim 卸载后残留,不能作为依据。
  detectInstall: guiApp({ macApps: ['Cursor.app'], winExe: ['Cursor', 'Cursor.exe'], linuxBin: 'cursor' }),
  ...dotDir('.cursor'),
  // Global rules 通过 SQLite User Rules 处理 (GlobalRulesStore),不使用目录。
  resolveRulesDir: dotRulesLocalOnly('.cursor'),
  resolveMcpConfig: jsonMcp(({ scope, projectRoot, homeDir }) =>
    scope === 'global' ? path.join(homeDir, '.cursor', 'mcp.json') : path.join(projectRoot, '.cursor', 'mcp.json'),
  ),
};
