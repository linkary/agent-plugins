import path from 'node:path';
import { ANSI } from '../../util/ansi.js';
import type { TargetAdapter } from '../adapter-base.js';
import { cliBin } from '../builders/detection.js';
import { dotDir, dotRulesLocalOnly } from '../builders/paths.js';
import { jsonMcp } from '../builders/mcp.js';

export const claudeCodeAdapter: TargetAdapter = {
  id: 'claude-code',
  label: 'Claude Code',
  color: ANSI.anthropicClay,
  aliases: ['claude', 'claude-code', 'claudecode'],
  agentFormat: 'filesystem-markdown',
  // CLI:PATH 可执行文件,或原生安装器放置的实际二进制 ~/.claude/bin/claude。
  // 不使用 ~/.claude.json / projects / history / credentials(ap 写入或卸载后残留)。
  detectInstall: cliBin('claude', (ctx) => path.join(ctx.homeDir, '.claude', 'bin', 'claude')),
  ...dotDir('.claude'),
  // Global rules 通过 ~/.claude/CLAUDE.md 处理 (GlobalRulesStore),不使用目录。
  resolveRulesDir: dotRulesLocalOnly('.claude'),
  resolveMcpConfig: jsonMcp(({ scope, projectRoot, homeDir }) =>
    scope === 'global' ? path.join(homeDir, '.claude.json') : path.join(projectRoot, '.mcp.json'),
  ),
};
