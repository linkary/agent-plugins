/**
 * 共享的 skill 元数据读取工具。
 * 从 SKILL.md 中解析描述、frontmatter，列出 skill 目录文件等。
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import type { SkillSource, McpSource } from '../core/registry.js';

// ─── Description ────────────────────────────────────────────────────────

/**
 * 从 skill 目录的 SKILL.md 中提取描述。
 * 优先使用 YAML frontmatter 的 description 字段，
 * 否则使用第一行非标题、非 frontmatter 文本。
 */
export async function readSkillDescription(skillPath: string): Promise<string | undefined> {
  try {
    const content = await fs.readFile(path.join(skillPath, 'SKILL.md'), 'utf-8');

    // 解析 YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1]!;
      const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
      if (descMatch) {
        return descMatch[1]!.trim().replace(/^["']|["']$/g, '');
      }
    }

    // 回退：第一行非标题文本
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
        return trimmed.slice(0, 80) + (trimmed.length > 80 ? '...' : '');
      }
    }
  } catch {
    // skill 目录可能没有 SKILL.md
  }
  return undefined;
}

// ─── Full SKILL.md content ──────────────────────────────────────────────

/**
 * 读取 SKILL.md 的完整内容（不含 frontmatter 分隔符部分）。
 */
export async function readSkillMdBody(skillPath: string): Promise<string | undefined> {
  try {
    const content = await fs.readFile(path.join(skillPath, 'SKILL.md'), 'utf-8');
    // 去掉 frontmatter
    const stripped = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
    return stripped.trim() || undefined;
  } catch {
    return undefined;
  }
}

// ─── File listing ───────────────────────────────────────────────────────

export type SkillFileEntry = {
  /** 相对于 skill 根目录的路径 */
  relativePath: string;
  /** 是否为目录 */
  isDirectory: boolean;
};

/**
 * 递归列出 skill 目录下的所有文件和子目录。
 */
export async function listSkillFiles(skillPath: string): Promise<SkillFileEntry[]> {
  const entries: SkillFileEntry[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    let items: string[];
    try {
      items = await fs.readdir(dir);
    } catch {
      return;
    }
    // 排序：目录在前，文件在后
    const stats = await Promise.all(
      items.map(async (name) => {
        try {
          const stat = await fs.stat(path.join(dir, name));
          return { name, isDir: stat.isDirectory() };
        } catch {
          return { name, isDir: false };
        }
      }),
    );
    stats.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const { name, isDir } of stats) {
      const rel = prefix ? `${prefix}/${name}` : name;
      entries.push({ relativePath: rel, isDirectory: isDir });
      if (isDir) {
        await walk(path.join(dir, name), rel);
      }
    }
  }

  await walk(skillPath, '');
  return entries;
}

// ─── Relative time formatting ───────────────────────────────────────────

/**
 * 将 ISO 日期字符串转换为 "3d ago" 风格的相对时间。
 */
export function formatRelativeTime(isoDate: string | undefined): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

// ─── Source formatting ──────────────────────────────────────────────────

/**
 * 将 SkillSource / McpSource 格式化为简短的可读字符串。
 */
export function formatSourceShort(source: SkillSource | McpSource | undefined): string {
  if (!source) return '';
  switch (source.type) {
    case 'git':
      return source.url.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
    case 'local':
      return 'local';
    case 'manual':
      return 'manual';
    case 'collected':
      return `from ${source.from.target}`;
    default:
      return '';
  }
}
