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
    return computeDirHash(path.join(commandsDir, commandName));
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
      const resPath = path.join(commandsDir, res);
      if (await pathExists(resPath)) {
        const resHash = await computeItemHash(resPath);
        hash.update(`res:${res}:${resHash}`);
        hash.update('\0');
      }
    }
  }

  return `sha256:${hash.digest('hex')}`;
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
