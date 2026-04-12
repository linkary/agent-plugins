import path from 'node:path';
import fs from 'node:fs/promises';
import { pathExists } from './fs-utils.js';
import { readAgentSpecFromEntry } from './agent-transform.js';
import type { AgentEntry } from '../core/agent-types.js';

async function classifyAgentPath(agentPath: string): Promise<AgentEntry | null> {
  try {
    const stat = await fs.stat(agentPath);
    if (stat.isFile()) {
      const ext = path.extname(agentPath).toLowerCase();
      const name = path.basename(agentPath, path.extname(agentPath));
      return {
        name,
        path: agentPath,
        storage: ext === '.toml' ? 'codex-toml' : 'legacy-file',
        form: 'file',
      };
    }

    if (!stat.isDirectory()) return null;
    const canonicalMeta = path.join(agentPath, 'agent.toml');
    const canonicalPrompt = path.join(agentPath, 'prompt.md');
    const storage =
      (await pathExists(canonicalMeta)) && (await pathExists(canonicalPrompt))
        ? 'canonical'
        : (await pathExists(canonicalMeta))
          ? 'codex-toml'
          : 'legacy-directory';
    return {
      name: path.basename(agentPath),
      path: agentPath,
      storage,
      form: 'directory',
    };
  } catch {
    return null;
  }
}

export async function readAgentDescription(agentPath: string): Promise<string | undefined> {
  const entry = await classifyAgentPath(agentPath);
  if (!entry) return undefined;

  const spec = await readAgentSpecFromEntry(entry);
  if (!spec) return undefined;
  if (spec.description) return spec.description;

  for (const line of spec.prompt.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed === '---') continue;
    return trimmed.slice(0, 80) + (trimmed.length > 80 ? '...' : '');
  }

  return undefined;
}
