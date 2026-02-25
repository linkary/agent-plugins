import path from 'node:path';
import fs from 'node:fs/promises';
import { ensureDir, pathExists } from '../util/fs-utils.js';
import { getCentralRulesDir } from '../util/apg-paths.js';
import { scanRuleFiles, normalizeRulePath } from '../util/rule-utils.js';
import { normalizeRuleLines, serializeLines, type NormalizedLine } from '../util/global-rules-store.js';

/** Path to the single global rules file in central store. */
export function getCentralGlobalRulesPath(): string {
  return path.join(getCentralRulesDir(), '_global.md');
}

export async function ensureCentralRuleStore(): Promise<void> {
  await ensureDir(getCentralRulesDir());
}

/** 读取中心全局规则并规范化为行列表 (sorted, deduped). */
export async function readCentralGlobalRuleLines(): Promise<NormalizedLine[]> {
  const filePath = getCentralGlobalRulesPath();
  if (!(await pathExists(filePath))) return [];
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return normalizeRuleLines(content);
  } catch {
    return [];
  }
}

/** 将行列表写入中心全局规则文件. */
export async function writeCentralGlobalRuleLines(lines: NormalizedLine[]): Promise<void> {
  const filePath = getCentralGlobalRulesPath();
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, serializeLines(lines), 'utf-8');
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
