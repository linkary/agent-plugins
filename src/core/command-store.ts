/**
 * 中央命令存储管理。
 * 命令以两种形式存储：
 * - directory-form: <name>/ 包含 <name>.md 或 index.md + 资源文件
 * - file-form: <name>.md 顶级文件（独立或通过 frontmatter 声明共享资源）
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { getCentralCommandsDir } from '../util/apg-paths.js';
import { ensureDir, pathExists } from '../util/fs-utils.js';

export type CommandForm = 'directory' | 'file';

export type CommandEntry = {
  /** 命令名称（不含 .md 扩展名） */
  name: string;
  /** 存储形式 */
  form: CommandForm;
  /** 命令入口 .md 文件的绝对路径 */
  mdPath: string;
  /** directory-form 时为目录路径；file-form 时为 .md 文件路径 */
  path: string;
};

export async function ensureCentralCommandStore(): Promise<void> {
  await ensureDir(getCentralCommandsDir());
}

/** 获取 directory-form 命令的目录路径 */
export function getCentralCommandDir(name: string): string {
  return path.join(getCentralCommandsDir(), name);
}

/** 获取 file-form 命令的 .md 文件路径 */
export function getCentralCommandFile(name: string): string {
  return path.join(getCentralCommandsDir(), `${name}.md`);
}

/**
 * 检测命令的存储形式。
 * - 'directory': <name>/ 中包含 <name>.md 或 index.md
 * - 'file': <name>.md 存在于顶级
 * - null: 不存在
 */
export async function detectCommandForm(name: string): Promise<CommandForm | null> {
  const dirPath = getCentralCommandDir(name);
  const filePath = getCentralCommandFile(name);

  // 优先检查 directory-form
  if (await pathExists(dirPath)) {
    const entryMd = await findEntryMd(dirPath, name);
    if (entryMd) return 'directory';
  }

  // 检查 file-form
  if (await pathExists(filePath)) {
    return 'file';
  }

  return null;
}

/**
 * 在目录中查找命令入口 .md 文件。
 * 按优先级: <dir-name>.md > index.md
 * 返回绝对路径或 null。
 */
export async function findEntryMd(dirPath: string, dirName: string): Promise<string | null> {
  const namedMd = path.join(dirPath, `${dirName}.md`);
  if (await pathExists(namedMd)) return namedMd;

  const indexMd = path.join(dirPath, 'index.md');
  if (await pathExists(indexMd)) return indexMd;

  return null;
}

/**
 * 列举中央存储中的所有命令。
 * 扫描两类入口：
 * 1. 顶级 .md 文件 -> file-form
 * 2. 包含入口 .md 的目录 -> directory-form
 * 过滤掉纯资源目录（不含入口 .md 的目录）和非 .md 文件。
 */
export async function listCentralCommands(): Promise<CommandEntry[]> {
  await ensureCentralCommandStore();
  const root = getCentralCommandsDir();
  const entries: CommandEntry[] = [];

  let dirEntries: import('node:fs').Dirent[];
  try {
    dirEntries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  // 收集 directory-form 命令名，用于排除同名 .md 文件的冲突
  const dirCommandNames = new Set<string>();

  // 先扫描目录
  for (const entry of dirEntries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const dirPath = path.join(root, name);
    const entryMd = await findEntryMd(dirPath, name);
    if (entryMd) {
      dirCommandNames.add(name);
      entries.push({ name, form: 'directory', mdPath: entryMd, path: dirPath });
    }
  }

  // 扫描顶级 .md 文件
  for (const entry of dirEntries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    const name = entry.name.slice(0, -3); // 去掉 .md
    if (!name) continue;
    // 如果已有同名 directory-form，跳过（directory-form 优先）
    if (dirCommandNames.has(name)) continue;
    const mdPath = path.join(root, entry.name);
    entries.push({ name, form: 'file', mdPath, path: mdPath });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

/**
 * 获取命令入口 .md 文件路径（自动检测形式）。
 */
export async function getCommandMdPath(name: string): Promise<string | null> {
  const form = await detectCommandForm(name);
  if (!form) return null;
  if (form === 'directory') {
    return await findEntryMd(getCentralCommandDir(name), name);
  }
  return getCentralCommandFile(name);
}
