import { getSyncStatePath } from '../util/apg-paths.js';
import { pathExists, readJsonFile, writeJsonFileAtomic } from '../util/fs-utils.js';

export type SyncedItemRecord = { hash: string; syncedAt: string };

export type SyncStateV1 = {
  version: 1;
  contexts: Record<
    string,
    {
      skills: Record<string, SyncedItemRecord>;
      commands?: Record<string, SyncedItemRecord>;
      mcp?: Record<string, SyncedItemRecord>;
    }
  >;
};

function emptyState(): SyncStateV1 {
  return { version: 1, contexts: {} };
}

export function makeContextId(params: { target: string; scope: string; projectRoot?: string }): string {
  const base = `${params.target}:${params.scope}`;
  if (!params.projectRoot) return base;
  return `${base}:${encodeURIComponent(params.projectRoot)}`;
}

export async function loadSyncState(): Promise<SyncStateV1> {
  const filePath = getSyncStatePath();
  if (!(await pathExists(filePath))) return emptyState();
  try {
    const parsed = await readJsonFile<SyncStateV1>(filePath);
    if (parsed?.version === 1 && parsed.contexts) return parsed;
  } catch {
    // ignore
  }
  return emptyState();
}

export async function saveSyncState(state: SyncStateV1): Promise<void> {
  await writeJsonFileAtomic(getSyncStatePath(), state);
}
