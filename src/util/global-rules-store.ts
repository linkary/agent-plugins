/**
 * Unified global-rules storage abstraction.
 *
 * Each target's global rules file is treated as a single text blob:
 *   - Cursor → SQLite database (state.vscdb)
 *   - Claude Code → ~/.claude/CLAUDE.md
 *   - Antigravity → ~/.gemini/GEMINI.md
 *
 * 行级管理工具：normalizeRuleLines / diffLines / mergeLines 提供
 * 纯函数式的行级去重、排序、diff 与合并操作。
 */
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ensureDir, pathExists } from './fs-utils.js';
import {
  getCursorUserRulesSourceLabel,
  readCursorUserRules,
  readCursorLocalRulesFallback,
  writeCursorUserRules,
} from './cursor-user-rules.js';
import type { TargetId } from '../targets/adapters.js';

export type GlobalRulesStore = {
  /** Human-readable label for display (e.g. file path or db reference). */
  readonly sourceLabel: string;
  /** Read the entire global rules content. */
  read(): Promise<string>;
  /** Write the entire global rules content. */
  write(text: string): Promise<void>;
};

type SingleFileConfig = {
  filePath: string;
  sourceLabel: string;
};

const SINGLE_FILE_CONFIGS: Partial<Record<TargetId, (homeDir: string) => SingleFileConfig>> = {
  'claude-code': (homeDir) => {
    const filePath = path.join(homeDir, '.claude', 'CLAUDE.md');
    return { filePath, sourceLabel: filePath };
  },
  antigravity: (homeDir) => {
    const filePath = path.join(homeDir, '.gemini', 'GEMINI.md');
    return { filePath, sourceLabel: filePath };
  },
};

function createFileStore(config: SingleFileConfig): GlobalRulesStore {
  return {
    sourceLabel: config.sourceLabel,
    async read() {
      if (!(await pathExists(config.filePath))) return '';
      return await fs.readFile(config.filePath, 'utf-8');
    },
    async write(text: string) {
      await ensureDir(path.dirname(config.filePath));
      await fs.writeFile(config.filePath, text, 'utf-8');
    },
  };
}

function createCursorStore(homeDir: string): GlobalRulesStore {
  // read() 时缓存 apiToken, 供 write() 复用
  let cachedApiToken: string | null = null;
  let labelResolved = false;
  let resolvedLabel = getCursorUserRulesSourceLabel(homeDir, false);

  return {
    get sourceLabel() {
      return resolvedLabel;
    },
    async read() {
      const { text, apiToken } = await readCursorUserRules(homeDir);
      cachedApiToken = apiToken;
      if (!labelResolved) {
        resolvedLabel = getCursorUserRulesSourceLabel(homeDir, apiToken !== null);
        labelResolved = true;
      }
      return text;
    },
    async write(text: string) {
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      await writeCursorUserRules(homeDir, lines, cachedApiToken);
    },
  };
}

/**
 * Get a GlobalRulesStore for the given target, or null if the target
 * does not use single-file global rules.
 */
export function getGlobalRulesStore(targetId: TargetId, homeDir: string): GlobalRulesStore | null {
  if (targetId === 'cursor') return createCursorStore(homeDir);

  const configFn = SINGLE_FILE_CONFIGS[targetId];
  if (!configFn) return null;
  return createFileStore(configFn(homeDir));
}

/**
 * Split global rules content into non-empty lines for display.
 */
export function splitRuleLines(content: string): string[] {
  return content.split('\n').filter((line) => line.trim().length > 0);
}

// ---------------------------------------------------------------------------
// 行级管理
// ---------------------------------------------------------------------------

export type NormalizedLine = { readonly content: string; readonly hash: string };

function computeLineHash(content: string): string {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

/**
 * 纯函数: content → 去重 + 排序的行列表。
 * 管线: split('\n') → trim → filter empty → dedup by content → sort → hash.
 */
export function normalizeRuleLines(content: string): NormalizedLine[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of content.split('\n')) {
    const trimmed = raw.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }
  unique.sort();
  return unique.map((c) => ({ content: c, hash: computeLineHash(c) }));
}

/** 显示用的 hash 短前缀 (8 hex chars). */
export function shortHash(hash: string): string {
  const idx = hash.indexOf(':');
  const hex = idx >= 0 ? hash.slice(idx + 1) : hash;
  return hex.slice(0, 8);
}

export type LinesDiff = {
  readonly onlyInA: NormalizedLine[];
  readonly onlyInB: NormalizedLine[];
  readonly common: NormalizedLine[];
};

/** 计算两组行的差集与交集 (基于 content 比较). */
export function diffLines(a: NormalizedLine[], b: NormalizedLine[]): LinesDiff {
  const setB = new Set(b.map((l) => l.content));
  const setA = new Set(a.map((l) => l.content));
  return {
    onlyInA: a.filter((l) => !setB.has(l.content)),
    onlyInB: b.filter((l) => !setA.has(l.content)),
    common: a.filter((l) => setB.has(l.content)),
  };
}

/** 合并两组行: union → dedup by content → sort. */
export function mergeLines(a: NormalizedLine[], b: NormalizedLine[]): NormalizedLine[] {
  const seen = new Set<string>();
  const merged: NormalizedLine[] = [];
  for (const line of [...a, ...b]) {
    if (seen.has(line.content)) continue;
    seen.add(line.content);
    merged.push(line);
  }
  merged.sort((x, y) => x.content.localeCompare(y.content));
  return merged;
}

/** 将 NormalizedLine[] 序列化为文件内容 (每行一条, 末尾换行). */
export function serializeLines(lines: NormalizedLine[]): string {
  if (lines.length === 0) return '';
  return lines.map((l) => l.content).join('\n') + '\n';
}
