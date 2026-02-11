import fs from 'node:fs/promises';
import { copyDir } from './copy-dir.js';
import { removeDir } from './fs-utils.js';

/** 尝试 rename，跨设备时回退到 copy + remove */
export async function fsRenameOrCopy(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest);
  } catch {
    await copyDir(src, dest, { ignoreNames: ['.git'] });
    await removeDir(src);
  }
}

/** 生成时间戳 ID，格式：YYYYMMDDHHmmss */
export function timestampId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
