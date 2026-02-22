import path from 'node:path';
import fs from 'node:fs/promises';
import { ensureDir, pathExists } from '../util/fs-utils.js';
import { getCentralRulesDir } from '../util/apg-paths.js';
import { scanRuleFiles, normalizeRulePath } from '../util/rule-utils.js';

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
