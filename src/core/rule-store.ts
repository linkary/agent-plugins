import path from 'node:path';
import fs from 'node:fs/promises';
import { ensureDir, pathExists } from '../util/fs-utils.js';
import { getCentralRulesDir } from '../util/apg-paths.js';
import { scanRuleFiles, normalizeRulePath } from '../util/rule-utils.js';
import { toRuleItem, dedupeAndSortItems, type RuleItem } from '../util/global-rules-store.js';

// ---------------------------------------------------------------------------
// 中心全局规则 (_global.json)
// ---------------------------------------------------------------------------

/** 新格式: JSON 数组. */
function getCentralGlobalRulesJsonPath(): string {
  return path.join(getCentralRulesDir(), '_global.json');
}

/** 旧格式: 纯文本 markdown (行级). */
function getCentralGlobalRulesMdPath(): string {
  return path.join(getCentralRulesDir(), '_global.md');
}

export function getCentralGlobalRulesPath(): string {
  return getCentralGlobalRulesJsonPath();
}

/**
 * 从旧 _global.md 迁移到 _global.json。
 * 每行 → 一个 RuleItem。迁移后删除 .md 文件。
 */
async function migrateFromMd(): Promise<RuleItem[]> {
  const mdPath = getCentralGlobalRulesMdPath();
  if (!(await pathExists(mdPath))) return [];
  const content = await fs.readFile(mdPath, 'utf-8');
  const items: RuleItem[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) items.push(toRuleItem(trimmed));
  }
  const sorted = dedupeAndSortItems(items);

  // 写入新格式并删除旧文件
  const jsonPath = getCentralGlobalRulesJsonPath();
  await ensureDir(path.dirname(jsonPath));
  await fs.writeFile(jsonPath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
  await fs.rm(mdPath, { force: true });

  return sorted;
}

/** 读取中心全局规则 (sorted, deduped). 自动迁移旧 .md 格式。 */
export async function readCentralGlobalRuleItems(): Promise<RuleItem[]> {
  const jsonPath = getCentralGlobalRulesJsonPath();
  if (await pathExists(jsonPath)) {
    try {
      const raw = await fs.readFile(jsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item: unknown): item is { content: string; hash: string } =>
          typeof item === 'object' && item !== null && 'content' in item && 'hash' in item,
        )
        .map((item) => ({ content: String(item.content), hash: String(item.hash) }));
    } catch {
      return [];
    }
  }
  // 尝试从旧格式迁移
  return await migrateFromMd();
}

/** 写入中心全局规则文件 (sort by hash). */
export async function writeCentralGlobalRuleItems(items: RuleItem[]): Promise<void> {
  const jsonPath = getCentralGlobalRulesJsonPath();
  await ensureDir(path.dirname(jsonPath));
  const sorted = dedupeAndSortItems(items);
  await fs.writeFile(jsonPath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// 文件级规则 (不变)
// ---------------------------------------------------------------------------

export async function ensureCentralRuleStore(): Promise<void> {
  await ensureDir(getCentralRulesDir());
}

export function getCentralRulePath(relativePath: string): string {
  return path.join(getCentralRulesDir(), normalizeRulePath(relativePath));
}

export async function listCentralRules(): Promise<string[]> {
  await ensureCentralRuleStore();
  return await scanRuleFiles(getCentralRulesDir());
}

export async function readCentralRule(relativePath: string): Promise<string | null> {
  const fullPath = getCentralRulePath(relativePath);
  if (!(await pathExists(fullPath))) return null;
  try {
    return await fs.readFile(fullPath, 'utf-8');
  } catch {
    return null;
  }
}
