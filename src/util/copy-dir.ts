import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir } from './fs-utils.js';

export type CopyDirOptions = {
  ignoreNames?: string[];
};

export async function copyDir(srcDir: string, destDir: string, opts: CopyDirOptions = {}): Promise<void> {
  if (opts.ignoreNames?.includes(path.basename(srcDir))) return;
  const entries = (await fs.readdir(srcDir, { withFileTypes: true })).filter(
    (entry) => !opts.ignoreNames?.includes(entry.name),
  );
  if (entries.length === 0) return;
  await ensureDir(destDir);
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, opts);
      continue;
    }

    if (entry.isSymbolicLink()) {
      const real = await fs.realpath(srcPath).catch(() => srcPath);
      const stat = await fs.stat(real).catch(() => null);
      if (stat?.isDirectory()) {
        await copyDir(real, destPath, opts);
      } else {
        await fs.copyFile(real, destPath);
      }
      continue;
    }

    if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
