import { describe, expect, it } from 'bun:test';
import { formatSourceShort, formatRelativeTime } from '../src/util/skill-meta.js';
import type { SkillSource, McpSource } from '../src/core/registry.js';

// ─── formatSourceShort ──────────────────────────────────────────────────

describe('formatSourceShort', () => {
  it('undefined 时返回空字符串', () => {
    expect(formatSourceShort(undefined)).toBe('');
  });

  // ── SkillSource 变体 ──

  it('git 类型：应去除 GitHub 前缀和 .git 后缀', () => {
    const source: SkillSource = { type: 'git', url: 'https://github.com/user/repo.git' };
    expect(formatSourceShort(source)).toBe('user/repo');
  });

  it('git 类型：非 GitHub URL 应保留完整路径', () => {
    const source: SkillSource = { type: 'git', url: 'https://gitlab.com/user/repo.git' };
    expect(formatSourceShort(source)).toBe('https://gitlab.com/user/repo');
  });

  it('local 类型：应返回 "local"', () => {
    const source: SkillSource = { type: 'local', path: '/some/path' };
    expect(formatSourceShort(source)).toBe('local');
  });

  it('collected (skill) 类型：应返回 "from <target>"', () => {
    const source: SkillSource = { type: 'collected', from: { target: 'cursor', scope: 'global', path: '/p' } };
    expect(formatSourceShort(source)).toBe('from cursor');
  });

  // ── McpSource 变体 ──

  it('manual 类型：应返回 "manual"', () => {
    const source: McpSource = { type: 'manual' };
    expect(formatSourceShort(source)).toBe('manual');
  });

  it('collected (mcp) 类型：应返回 "from <target>"', () => {
    const source: McpSource = { type: 'collected', from: { target: 'claude-code', scope: 'global' } };
    expect(formatSourceShort(source)).toBe('from claude-code');
  });
});

// ─── formatRelativeTime ─────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  it('undefined 时返回空字符串', () => {
    expect(formatRelativeTime(undefined)).toBe('');
  });

  it('今天的日期应返回 "today"', () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe('today');
  });

  it('昨天的日期应返回 "yesterday"', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(yesterday)).toBe('yesterday');
  });

  it('3 天前应返回 "3d ago"', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(threeDaysAgo)).toBe('3d ago');
  });

  it('14 天前应返回 "2w ago"', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoWeeksAgo)).toBe('2w ago');
  });

  it('60 天前应返回 "2mo ago"', () => {
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoMonthsAgo)).toBe('2mo ago');
  });

  it('400 天前应返回 "1y ago"', () => {
    const overOneYear = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(overOneYear)).toBe('1y ago');
  });
});
