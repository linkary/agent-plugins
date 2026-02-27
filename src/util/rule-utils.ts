import path from 'node:path';
import fs from 'node:fs/promises';
import { ensureDir } from './fs-utils.js';

export const RULE_FILE_EXTENSIONS = ['.md', '.mdc'] as const;
const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.turbo']);

export type RuleFileEntry = {
  relativePath: string;
  absolutePath: string;
};

export class InvalidRulePathError extends Error {
  constructor(input: string) {
    super(`Invalid rule path: ${input}`);
    this.name = 'InvalidRulePathError';
  }
}

export function normalizeRulePath(input: string): string {
  const trimmed = input.replace(/\\/g, '/').trim().replace(/^\.\/+/, '').replace(/^\/+/, '');
  if (!trimmed) throw new InvalidRulePathError(input);

  const parts = trimmed.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') throw new InvalidRulePathError(input);
    out.push(part);
  }

  if (out.length === 0) throw new InvalidRulePathError(input);
  return out.join('/');
}

export function isRuleFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return RULE_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export async function scanRuleFiles(rootDir: string): Promise<string[]> {
  const entries = await scanRuleFileEntries(rootDir);
  return entries.map((entry) => entry.relativePath);
}

export async function scanRuleFileEntries(rootDir: string): Promise<RuleFileEntry[]> {
  const out: RuleFileEntry[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    let items: fs.Dirent[];
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    items.sort((a, b) => a.name.localeCompare(b.name));

    for (const item of items) {
      if (item.isDirectory()) {
        if (IGNORED_DIRS.has(item.name)) continue;
        if (item.name.startsWith('.') && item.name !== '.rules') continue;
        const nextPrefix = prefix ? `${prefix}/${item.name}` : item.name;
        await walk(path.join(dir, item.name), nextPrefix);
        continue;
      }
      if (!item.isFile()) continue;
      if (!isRuleFileName(item.name)) continue;
      const rel = normalizeRulePath(prefix ? `${prefix}/${item.name}` : item.name);
      out.push({
        relativePath: rel,
        absolutePath: path.join(dir, item.name),
      });
    }
  }

  await walk(rootDir, '');
  return out;
}

export async function ensureRuleParentDir(rootDir: string, relativePath: string): Promise<string> {
  const normalized = normalizeRulePath(relativePath);
  const fullPath = path.join(rootDir, normalized);
  await ensureDir(path.dirname(fullPath));
  return fullPath;
}

export async function removeFileAndEmptyParents(filePath: string, stopAt: string): Promise<void> {
  await fs.rm(filePath, { force: true });

  let current = path.dirname(filePath);
  const stop = path.resolve(stopAt);
  while (path.resolve(current).startsWith(stop) && path.resolve(current) !== stop) {
    try {
      const entries = await fs.readdir(current);
      if (entries.length > 0) break;
      await fs.rmdir(current);
      current = path.dirname(current);
    } catch {
      break;
    }
  }
}
