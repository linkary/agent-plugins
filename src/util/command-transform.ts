/**
 * 命令同步转换工具。
 * 处理 directory-form <-> flat-form 之间的确定性转换。
 *
 * Central store (directory-form):
 *   migrate-to-typescript/
 *     migrate-to-typescript.md  (或 index.md)
 *     core.mdx
 *
 * Target (flat-form):
 *   migrate-to-typescript.md
 *   migrate-to-typescript/
 *     core.mdx
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { copyDir } from './copy-dir.js';
import { ensureDir, pathExists } from './fs-utils.js';
import { findEntryMd } from '../core/command-store.js';

const IGNORED_COMMAND_RESOURCE_NAMES = ['.git'];

function hasIgnoredPathSegment(filePath: string, ignoreNames: string[]): boolean {
  return path
    .normalize(filePath)
    .split(path.sep)
    .some((part) => ignoreNames.includes(part));
}

// ─── Sync: Central -> Target ────────────────────────────────────────────

/**
 * 将 directory-form 命令同步到 target（转换为 flat-form）。
 * 1. 找到入口 .md 文件 -> 复制为 targetDir/<name>.md
 * 2. 其余文件/目录 -> 复制到 targetDir/<name>/
 */
export async function syncDirectoryCommand(params: {
  srcDir: string;
  targetDir: string;
  commandName: string;
}): Promise<void> {
  const { srcDir, targetDir, commandName } = params;
  const dirName = path.basename(srcDir);

  // 查找入口 .md 文件
  const entryMd = await findEntryMd(srcDir, dirName);
  if (!entryMd) {
    throw new Error(`No entry .md found in directory command: ${srcDir}`);
  }

  await ensureDir(targetDir);

  // 复制入口 .md -> targetDir/<commandName>.md
  const targetMdPath = path.join(targetDir, `${commandName}.md`);
  await fs.copyFile(entryMd, targetMdPath);

  // 复制其余文件到 targetDir/<commandName>/
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  const entryMdName = path.basename(entryMd);
  const hasResources = entries.some(
    (e) => e.name !== entryMdName && !IGNORED_COMMAND_RESOURCE_NAMES.includes(e.name),
  );

  if (hasResources) {
    const targetResourceDir = path.join(targetDir, commandName);
    await ensureDir(targetResourceDir);

    for (const entry of entries) {
      if (entry.name === entryMdName) continue; // 跳过入口 .md
      if (IGNORED_COMMAND_RESOURCE_NAMES.includes(entry.name)) continue;
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(targetResourceDir, entry.name);

      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath, { ignoreNames: IGNORED_COMMAND_RESOURCE_NAMES });
      } else if (entry.isFile()) {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

/**
 * 将 file-form 命令同步到 target（直接复制 .md + 共享资源）。
 */
export async function syncFileCommand(params: {
  mdFilePath: string;
  sharedResources: string[];
  centralRoot: string;
  targetDir: string;
  commandName: string;
}): Promise<void> {
  const { mdFilePath, sharedResources, centralRoot, targetDir, commandName } = params;

  await ensureDir(targetDir);

  // 复制 .md 文件
  const targetMdPath = path.join(targetDir, `${commandName}.md`);
  await fs.copyFile(mdFilePath, targetMdPath);

  // 复制声明的共享资源
  for (const res of sharedResources) {
    if (hasIgnoredPathSegment(res, IGNORED_COMMAND_RESOURCE_NAMES)) continue;
    const srcPath = path.join(centralRoot, res);
    if (!(await pathExists(srcPath))) continue;

    const destPath = path.join(targetDir, res);
    const stat = await fs.stat(srcPath);
    if (stat.isDirectory()) {
      await copyDir(srcPath, destPath, { ignoreNames: IGNORED_COMMAND_RESOURCE_NAMES });
    } else {
      await ensureDir(path.dirname(destPath));
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// ─── Collect: Target -> Central ─────────────────────────────────────────

/**
 * 将 target 中的 flat-form 命令收集为 central 的 directory-form。
 * 1. 创建 destDir/
 * 2. 复制 <name>.md -> destDir/<name>.md
 * 3. 如果存在 <name>/ 资源目录，复制内容到 destDir/
 */
export async function collectToDirectory(params: {
  mdFilePath: string;
  resourceDirPath?: string;
  destDir: string;
  commandName: string;
}): Promise<void> {
  const { mdFilePath, resourceDirPath, destDir, commandName } = params;

  await ensureDir(destDir);

  // 复制 .md 文件到目录内
  const destMd = path.join(destDir, `${commandName}.md`);
  await fs.copyFile(mdFilePath, destMd);

  // 复制资源目录内容到 destDir/
  if (resourceDirPath && (await pathExists(resourceDirPath))) {
    const entries = await fs.readdir(resourceDirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_COMMAND_RESOURCE_NAMES.includes(entry.name)) continue;
      const srcPath = path.join(resourceDirPath, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath, { ignoreNames: IGNORED_COMMAND_RESOURCE_NAMES });
      } else if (entry.isFile()) {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

/**
 * 将 target 中的 flat-form 命令直接收集为 central 的 file-form。
 */
export async function collectToFile(params: {
  mdFilePath: string;
  destMdPath: string;
}): Promise<void> {
  await ensureDir(path.dirname(params.destMdPath));
  await fs.copyFile(params.mdFilePath, params.destMdPath);
}

// ─── Target scanning ────────────────────────────────────────────────────

export type TargetCommandEntry = {
  name: string;
  mdPath: string;
  /** 同名资源目录路径（如果存在） */
  resourceDirPath?: string;
};

/**
 * 扫描 target commands 目录中的命令。
 * 检测 .md 文件并关联同名资源目录。
 */
export async function detectTargetCommands(targetDir: string): Promise<TargetCommandEntry[]> {
  if (!(await pathExists(targetDir))) return [];

  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  const dirNames = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
  const result: TargetCommandEntry[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    const name = entry.name.slice(0, -3);
    if (!name) continue;

    const mdPath = path.join(targetDir, entry.name);
    const resourceDirPath = dirNames.has(name) ? path.join(targetDir, name) : undefined;

    result.push({ name, mdPath, resourceDirPath });
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
