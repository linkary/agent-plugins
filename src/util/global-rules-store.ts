/**
 * Unified global-rules storage abstraction (item-level).
 *
 * 每条 rule 是一个完整的条目 (可能多行), 不再按 \n 拆分。
 *
 *   - Cursor → Knowledge Base API (每个 KB item = 一条 rule)
 *   - Claude Code → ~/.claude/CLAUDE.md  (段落分隔)
 *   - Antigravity → ~/.gemini/GEMINI.md (段落分隔)
 *
 * 纯函数工具: parseRuleItems / diffItems / mergeItems 提供
 * 基于 content hash 的去重、排序、diff 与合并操作。
 */
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ensureDir, pathExists } from './fs-utils.js';
import {
  getCursorUserRulesSourceLabel,
  readCursorUserRules,
  writeCursorUserRules,
} from './cursor-user-rules.js';
import type { TargetId } from '../targets/adapters.js';

// ---------------------------------------------------------------------------
// RuleItem 数据模型
// ---------------------------------------------------------------------------

export type RuleItem = { readonly content: string; readonly hash: string };

export function computeItemHash(content: string): string {
  return `sha256:${crypto.createHash('sha256').update(content.trim()).digest('hex')}`;
}

/** 从 content 构造 RuleItem (trim 后 hash). */
export function toRuleItem(content: string): RuleItem {
  const trimmed = content.trim();
  return { content: trimmed, hash: computeItemHash(trimmed) };
}

// ---------------------------------------------------------------------------
// 解析: text → RuleItem[]
// ---------------------------------------------------------------------------

/**
 * 按段落 (空行分隔) 解析文本为 RuleItem[]。
 * 去重 (基于 trimmed content) + 按 hash 排序。
 */
export function parseRuleItems(text: string): RuleItem[] {
  const blocks = text.split(/\n\n+/);
  const seen = new Set<string>();
  const items: RuleItem[] = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    items.push(toRuleItem(trimmed));
  }
  items.sort((a, b) => a.hash.localeCompare(b.hash));
  return items;
}

/** 从已有的 RuleItem[] 去重 + 排序 (用于从外部构造的 items). */
export function dedupeAndSortItems(items: RuleItem[]): RuleItem[] {
  const seen = new Set<string>();
  const unique: RuleItem[] = [];
  for (const item of items) {
    const key = item.content.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  unique.sort((a, b) => a.hash.localeCompare(b.hash));
  return unique;
}

// ---------------------------------------------------------------------------
// Diff / Merge
// ---------------------------------------------------------------------------

export type ItemsDiff = {
  readonly onlyInA: RuleItem[];
  readonly onlyInB: RuleItem[];
  readonly common: RuleItem[];
};

/** 基于 content 比较两组 items 的差集与交集。 */
export function diffItems(a: RuleItem[], b: RuleItem[]): ItemsDiff {
  const setB = new Set(b.map((i) => i.content));
  const setA = new Set(a.map((i) => i.content));
  return {
    onlyInA: a.filter((i) => !setB.has(i.content)),
    onlyInB: b.filter((i) => !setA.has(i.content)),
    common: a.filter((i) => setB.has(i.content)),
  };
}

/** 合并两组 items: union → dedup → sort by hash. */
export function mergeItems(a: RuleItem[], b: RuleItem[]): RuleItem[] {
  return dedupeAndSortItems([...a, ...b]);
}

/** 将 RuleItem[] 序列化为文件内容 (段落间空行分隔, 末尾换行). */
export function serializeItems(items: RuleItem[]): string {
  if (items.length === 0) return '';
  return items.map((i) => i.content).join('\n\n') + '\n';
}

// ---------------------------------------------------------------------------
// 显示辅助
// ---------------------------------------------------------------------------

/** hash 短前缀 (8 hex chars). */
export function shortHash(hash: string): string {
  const idx = hash.indexOf(':');
  const hex = idx >= 0 ? hash.slice(idx + 1) : hash;
  return hex.slice(0, 8);
}

const DISPLAY_MAX_LEN = 80;

/** 用于 CLI 输出的单行摘要: 首行 + 截断 + "(N lines)" 标注. */
export function displayItem(item: RuleItem): string {
  const lines = item.content.split('\n');
  if (lines.length === 1) {
    return item.content.length <= DISPLAY_MAX_LEN ? item.content : item.content.slice(0, DISPLAY_MAX_LEN - 3) + '...';
  }
  const firstLine = lines[0]!;
  const truncated =
    firstLine.length <= DISPLAY_MAX_LEN - 12 ? firstLine : firstLine.slice(0, DISPLAY_MAX_LEN - 15) + '...';
  return `${truncated} (${lines.length} lines)`;
}

// ---------------------------------------------------------------------------
// GlobalRulesStore (item-based)
// ---------------------------------------------------------------------------

export type GlobalRulesStore = {
  readonly sourceLabel: string;
  readItems(): Promise<RuleItem[]>;
  writeItems(items: RuleItem[]): Promise<void>;
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
    async readItems() {
      if (!(await pathExists(config.filePath))) return [];
      const text = await fs.readFile(config.filePath, 'utf-8');
      return parseRuleItems(text);
    },
    async writeItems(items: RuleItem[]) {
      await ensureDir(path.dirname(config.filePath));
      await fs.writeFile(config.filePath, serializeItems(items), 'utf-8');
    },
  };
}

function createCursorStore(homeDir: string): GlobalRulesStore {
  let cachedApiToken: string | null = null;
  let labelResolved = false;
  let resolvedLabel = getCursorUserRulesSourceLabel(homeDir, false);

  return {
    get sourceLabel() {
      return resolvedLabel;
    },
    async readItems() {
      const { items, apiToken } = await readCursorUserRules(homeDir);
      cachedApiToken = apiToken;
      if (!labelResolved) {
        resolvedLabel = getCursorUserRulesSourceLabel(homeDir, apiToken !== null);
        labelResolved = true;
      }
      return items;
    },
    async writeItems(items: RuleItem[]) {
      await writeCursorUserRules(homeDir, items, cachedApiToken);
    },
  };
}

export function getGlobalRulesStore(targetId: TargetId, homeDir: string): GlobalRulesStore | null {
  if (targetId === 'cursor') return createCursorStore(homeDir);
  const configFn = SINGLE_FILE_CONFIGS[targetId];
  if (!configFn) return null;
  return createFileStore(configFn(homeDir));
}
