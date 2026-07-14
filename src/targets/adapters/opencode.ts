import path from 'node:path';
import { ANSI } from '../../util/ansi.js';
import type { TargetAdapter } from '../adapter-base.js';
import { cliBin } from '../builders/detection.js';
import { dotDir, dotRules } from '../builders/paths.js';
import { jsonMcp } from '../builders/mcp.js';

export const opencodeAdapter: TargetAdapter = {
  id: 'opencode',
  label: 'OpenCode',
  color: ANSI.teal,
  aliases: ['opencode', 'open-code'],
  agentFormat: 'filesystem-markdown',
  // CLI:PATH 可执行文件,或安装脚本放置的实际二进制 ~/.opencode/bin/opencode。
  // 不使用 ~/.local/share/opencode 或 ~/.config/opencode(数据/配置,卸载后残留)。
  detectInstall: cliBin('opencode', (ctx) => path.join(ctx.homeDir, '.opencode', 'bin', 'opencode')),
  ...dotDir('.opencode'),
  resolveRulesDir: dotRules('.opencode'),
  resolveMcpConfig: jsonMcp(({ scope, projectRoot, homeDir }) =>
    scope === 'global' ? path.join(homeDir, '.opencode', 'mcp.json') : path.join(projectRoot, '.opencode', 'mcp.json'),
  ),
};
