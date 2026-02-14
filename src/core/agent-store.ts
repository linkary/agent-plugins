import path from 'node:path';
import { getCentralAgentsDir } from '../util/apg-paths.js';
import { ensureDir, listDirNames } from '../util/fs-utils.js';

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
