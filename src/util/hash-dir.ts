import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type DirHashOptions = {
  ignoreNames?: string[];
};

type WalkItem = {
  absPath: string;
  relPath: string;
};

async function walkDir(
  rootDir: string,
  currentDir: string,
  relBase: string,
  opts: DirHashOptions,
  out: WalkItem[],
  visitedRealDirs: Set<string>,
): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (opts.ignoreNames?.includes(entry.name)) continue;
    const absPath = path.join(currentDir, entry.name);
    const relPath = relBase ? path.join(relBase, entry.name) : entry.name;

    if (entry.isDirectory()) {
      const real = await fs.realpath(absPath).catch(() => absPath);
      if (visitedRealDirs.has(real)) continue;
      visitedRealDirs.add(real);
      await walkDir(rootDir, absPath, relPath, opts, out, visitedRealDirs);
      continue;
    }

    if (entry.isSymbolicLink()) {
      const real = await fs.realpath(absPath).catch(() => absPath);
      const stat = await fs.stat(real).catch(() => null);
      if (stat?.isDirectory()) {
        if (visitedRealDirs.has(real)) continue;
        visitedRealDirs.add(real);
        await walkDir(rootDir, real, relPath, opts, out, visitedRealDirs);
        continue;
      }
      out.push({ absPath, relPath });
      continue;
    }

    if (entry.isFile()) {
      out.push({ absPath, relPath });
    }
  }
}

export async function computeDirHash(dirPath: string, opts: DirHashOptions = {}): Promise<string> {
  const root = path.resolve(dirPath);
  const items: WalkItem[] = [];
  const visited = new Set<string>([await fs.realpath(root).catch(() => root)]);
  await walkDir(root, root, '', opts, items, visited);

  items.sort((a, b) => a.relPath.localeCompare(b.relPath));
  const hash = crypto.createHash('sha256');

  for (const item of items) {
    hash.update(item.relPath);
    hash.update('\0');
    const data = await fs.readFile(item.absPath);
    hash.update(data);
    hash.update('\0');
  }

  return `sha256:${hash.digest('hex')}`;
}
