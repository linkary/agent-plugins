/**
 * 多态文件/目录操作工具。
 * 支持对文件和目录统一执行 hash、copy、remove 操作。
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { computeDirHash } from './hash-dir.js';
import { copyDir } from './copy-dir.js';
import { ensureDir, pathExists, removeDir } from './fs-utils.js';
import type { CommandForm } from '../core/command-store.js';

const IGNORED_COMMAND_RESOURCE_NAMES = ['.git'];
const EMPTY_DIR_HASH = `sha256:${crypto.createHash('sha256').digest('hex')}`;

export type ItemStats = {
  sizeBytes: number;
  changedAtMs: number;
};

function hasIgnoredPathSegment(filePath: string, ignoreNames: string[]): boolean {
  return path
    .normalize(filePath)
    .split(path.sep)
    .some((part) => ignoreNames.includes(part));
}

function mergeItemStats(current: ItemStats | null, next: ItemStats | null): ItemStats | null {
  if (!next) return current;
  if (!current) return { ...next };
  return {
    sizeBytes: current.sizeBytes + next.sizeBytes,
    changedAtMs: Math.max(current.changedAtMs, next.changedAtMs),
  };
}

async function collectItemStats(
  itemPath: string,
  ignoreNames: string[],
): Promise<ItemStats | null> {
  if (hasIgnoredPathSegment(itemPath, ignoreNames)) return null;

  const stat = await fs.stat(itemPath).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });
  if (!stat) return null;

  if (!stat.isDirectory()) {
    return { sizeBytes: stat.size, changedAtMs: stat.mtimeMs };
  }

  let combined: ItemStats = { sizeBytes: 0, changedAtMs: stat.mtimeMs };
  const entries = await fs.readdir(itemPath, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoreNames.includes(entry.name)) continue;
    combined = mergeItemStats(combined, await collectItemStats(path.join(itemPath, entry.name), ignoreNames)) ?? combined;
  }
  return combined;
}

/**
 * 计算文件或目录的 hash。
 * 文件 -> SHA256(content)
 * 目录 -> computeDirHash
 */
export async function computeItemHash(itemPath: string): Promise<string> {
  const stat = await fs.stat(itemPath);
  if (stat.isDirectory()) {
    return computeDirHash(itemPath);
  }
  const content = await fs.readFile(itemPath);
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

/**
 * 计算命令的综合 hash。
 * - directory-form: hash 整个目录
 * - file-form: hash .md 文件内容 + 各声明资源的 hash
 */
export async function computeCommandHash(params: {
  commandName: string;
  commandsDir: string;
  form: CommandForm;
  sharedResources?: string[];
}): Promise<string> {
  const { commandName, commandsDir, form, sharedResources } = params;

  if (form === 'directory') {
    return computeDirHash(path.join(commandsDir, commandName), { ignoreNames: IGNORED_COMMAND_RESOURCE_NAMES });
  }

  // file-form: 组合 .md 文件 + 声明的共享资源
  const hash = crypto.createHash('sha256');
  const mdPath = path.join(commandsDir, `${commandName}.md`);
  const mdContent = await fs.readFile(mdPath);
  hash.update('md:');
  hash.update(mdContent);
  hash.update('\0');

  if (sharedResources?.length) {
    const sorted = [...sharedResources].sort();
    for (const res of sorted) {
      if (hasIgnoredPathSegment(res, IGNORED_COMMAND_RESOURCE_NAMES)) continue;
      const resPath = path.join(commandsDir, res);
      if (await pathExists(resPath)) {
        const stat = await fs.stat(resPath);
        const resHash = stat.isDirectory()
          ? await computeDirHash(resPath, { ignoreNames: IGNORED_COMMAND_RESOURCE_NAMES })
          : await computeItemHash(resPath);
        if (stat.isDirectory() && resHash === EMPTY_DIR_HASH) continue;
        hash.update(`res:${res}:${resHash}`);
        hash.update('\0');
      }
    }
  }

  return `sha256:${hash.digest('hex')}`;
}

export async function computeItemStats(
  itemPath: string,
  options?: { ignoreNames?: string[] },
): Promise<ItemStats | null> {
  return collectItemStats(itemPath, options?.ignoreNames ?? []);
}

export async function computeCombinedItemStats(
  itemPaths: string[],
  options?: { ignoreNames?: string[] },
): Promise<ItemStats | null> {
  const ignoreNames = options?.ignoreNames ?? [];
  let combined: ItemStats | null = null;
  for (const itemPath of new Set(itemPaths)) {
    combined = mergeItemStats(combined, await collectItemStats(itemPath, ignoreNames));
  }
  return combined;
}

/**
 * 复制文件或目录到目标位置。
 */
export async function copyItem(src: string, dest: string): Promise<void> {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await copyDir(src, dest);
  } else {
    await ensureDir(path.dirname(dest));
    await fs.copyFile(src, dest);
  }
}

/**
 * 删除文件或目录。
 */
export async function removeItem(itemPath: string): Promise<void> {
  const stat = await fs.stat(itemPath).catch(() => null);
  if (!stat) return;
  if (stat.isDirectory()) {
    await removeDir(itemPath);
  } else {
    await fs.rm(itemPath, { force: true });
  }
}
