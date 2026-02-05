import path from 'node:path';
import { pathExists } from './fs-utils.js';

export async function findProjectRoot(startDir: string): Promise<string> {
  const start = path.resolve(startDir);
  let current = start;

  // Walk upward looking for a git root.
  while (true) {
    const gitPath = path.join(current, '.git');
    if (await pathExists(gitPath)) return current;

    const parent = path.dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}
