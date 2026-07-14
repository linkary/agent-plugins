import path from 'node:path';
import { ANSI } from '../../util/ansi.js';
import type { TargetAdapter } from '../adapter-base.js';
import { cliBin } from '../builders/detection.js';
import { dotDir, dotRulesLocalOnly } from '../builders/paths.js';
import { jsonMcp } from '../builders/mcp.js';

export const qodercliAdapter: TargetAdapter = {
  id: 'qodercli',
  label: 'QoderCLI',
  color: ANSI.qoderGreen,
  aliases: ['qodercli', 'qoder-cli'],
  agentFormat: 'filesystem-markdown',
  // Qoder CLI:npm 包 @qoder-ai/qodercli 提供的 `qodercli` 可执行文件。
  detectInstall: cliBin('qodercli'),
  ...dotDir('.qoder'),
  resolveRulesDir: dotRulesLocalOnly('.qoder'),
  resolveMcpConfig: jsonMcp(({ scope, projectRoot, homeDir }) =>
    scope === 'global' ? path.join(homeDir, '.qoder', 'settings.json') : path.join(projectRoot, '.qoder', 'settings.json'),
  ),
};
