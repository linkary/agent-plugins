import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ensureCentralAgentStore,
  listCentralAgentItems,
  resolveCentralAgentPath,
} from '../src/core/agent-store.js';

let tmpDir: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-agent-store-'));
  originalEnv = process.env.APG_HOME;
  process.env.APG_HOME = tmpDir;
});

afterEach(async () => {
  if (originalEnv !== undefined) process.env.APG_HOME = originalEnv;
  else delete process.env.APG_HOME;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('agent-store', () => {
  it('should list central agent directories and .md files', async () => {
    await ensureCentralAgentStore();
    const agentsDir = path.join(tmpDir, 'agents');
    await fs.mkdir(path.join(agentsDir, 'directory-agent'), { recursive: true });
    await fs.writeFile(path.join(agentsDir, 'file-agent.md'), '# file agent');
    await fs.writeFile(path.join(agentsDir, 'ignore.txt'), 'n/a');

    const items = await listCentralAgentItems();
    expect(items.map((item) => `${item.name}:${item.form}`)).toEqual([
      'directory-agent:directory',
      'file-agent:file',
    ]);
  });

  it('should prefer directory form when both directory and .md file exist', async () => {
    await ensureCentralAgentStore();
    const agentsDir = path.join(tmpDir, 'agents');
    await fs.mkdir(path.join(agentsDir, 'dupe'), { recursive: true });
    await fs.writeFile(path.join(agentsDir, 'dupe.md'), '# file dupe');

    const items = await listCentralAgentItems();
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('dupe');
    expect(items[0]!.form).toBe('directory');
  });

  it('should resolve agent path to directory first and fallback to .md file', async () => {
    await ensureCentralAgentStore();
    const agentsDir = path.join(tmpDir, 'agents');

    await fs.mkdir(path.join(agentsDir, 'dir-only'), { recursive: true });
    await fs.writeFile(path.join(agentsDir, 'file-only.md'), '# file only');

    expect(await resolveCentralAgentPath('dir-only')).toBe(path.join(agentsDir, 'dir-only'));
    expect(await resolveCentralAgentPath('file-only')).toBe(path.join(agentsDir, 'file-only.md'));
    expect(await resolveCentralAgentPath('missing')).toBeNull();
  });
});
