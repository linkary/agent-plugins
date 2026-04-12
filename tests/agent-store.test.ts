import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ensureCentralAgentStore,
  listCentralAgentItems,
  readCentralAgentSpec,
  resolveCentralAgentPath,
  writeCentralAgentSpec,
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

  it('writes and reads canonical agent storage', async () => {
    const sourceDir = path.join(tmpDir, 'source-agent');
    await fs.mkdir(path.join(sourceDir, 'docs'), { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'AGENT.md'), '---\nname: sample\ncolor: cyan\ntools: ["Read"]\n---\nPrompt body\n');
    await fs.writeFile(path.join(sourceDir, 'docs', 'guide.md'), '# guide\n');

    await writeCentralAgentSpec(
      {
        name: 'sample',
        description: 'Sample agent',
        prompt: 'Prompt body\n',
        color: 'cyan',
        tools: ['Read'],
      },
      { sourceDir },
    );

    const entryPath = await resolveCentralAgentPath('sample');
    expect(entryPath).toBe(path.join(tmpDir, 'agents', 'sample'));

    const read = await readCentralAgentSpec('sample');
    expect(read?.spec.name).toBe('sample');
    expect(read?.spec.description).toBe('Sample agent');
    expect(read?.spec.tools).toEqual(['Read']);
    expect(await fs.readFile(path.join(tmpDir, 'agents', 'sample', 'prompt.md'), 'utf8')).toBe('Prompt body\n');
    expect(await fs.readFile(path.join(tmpDir, 'agents', 'sample', 'resources', 'docs', 'guide.md'), 'utf8')).toBe('# guide\n');
  });
});
