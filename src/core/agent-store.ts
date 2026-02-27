import path from 'node:path';
import fs from 'node:fs/promises';
import { getCentralAgentsDir } from '../util/apg-paths.js';
import { ensureDir, listDirNames, pathExists } from '../util/fs-utils.js';

export async function ensureCentralAgentStore(): Promise<void> {
  await ensureDir(getCentralAgentsDir());
}

export function getCentralAgentPath(agentName: string): string {
  return path.join(getCentralAgentsDir(), agentName);
}

export async function listCentralAgents(): Promise<string[]> {
  await ensureCentralAgentStore();
  return await listDirNames(getCentralAgentsDir());
}

export type CentralAgentItem = {
  name: string;
  form: 'directory' | 'file';
  path: string;
};

export async function listCentralAgentItems(): Promise<CentralAgentItem[]> {
  await ensureCentralAgentStore();
  const root = getCentralAgentsDir();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const dedup = new Map<string, CentralAgentItem>();

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      dedup.set(entry.name, {
        name: entry.name,
        form: 'directory',
        path: path.join(root, entry.name),
      });
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const base = entry.name.slice(0, -3);
    if (dedup.has(base)) continue;
    dedup.set(base, {
      name: base,
      form: 'file',
      path: path.join(root, entry.name),
    });
  }

  return [...dedup.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveCentralAgentPath(agentName: string): Promise<string | null> {
  const dirPath = getCentralAgentPath(agentName);
  if (await pathExists(dirPath)) return dirPath;
  const filePath = `${dirPath}.md`;
  if (await pathExists(filePath)) return filePath;
  return null;
}
