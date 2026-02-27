import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gatherTargetAgents, findSyncedAgentCopies } from '../src/commands/agents/manage-utils.js';
import { getAdapters } from '../src/targets/adapters.js';

let tmpDir = '';
let tmpProjectRoot = '';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-agents-manage-'));
  tmpProjectRoot = path.join(tmpDir, 'project');
  await fs.mkdir(tmpProjectRoot, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('agents manage-utils', () => {
  it('gatherTargetAgents includes directory and .md file forms, preferring directory on duplicate name', async () => {
    const agentsDir = path.join(tmpProjectRoot, '.cursor', 'agents');
    await fs.mkdir(path.join(agentsDir, 'directory-agent'), { recursive: true });
    await fs.writeFile(path.join(agentsDir, 'file-agent.md'), '# file agent\n', 'utf-8');
    await fs.mkdir(path.join(agentsDir, 'dupe-agent'), { recursive: true });
    await fs.writeFile(path.join(agentsDir, 'dupe-agent.md'), '# duplicate file\n', 'utf-8');

    const adapters = getAdapters().filter((adapter) => adapter.id === 'cursor');
    const config = { version: 1, targets: { cursor: { defaultScope: 'local' } } } as any;
    const agents = await gatherTargetAgents({
      adapters,
      config,
      scopeFlag: 'local',
      currentCwd: tmpProjectRoot,
    });

    expect(agents.find((agent) => agent.name === 'directory-agent')?.form).toBe('directory');
    expect(agents.find((agent) => agent.name === 'file-agent')?.form).toBe('file');
    expect(agents.find((agent) => agent.name === 'dupe-agent')?.form).toBe('directory');
  });

  it('findSyncedAgentCopies detects file-form synced copies', async () => {
    const filePath = path.join(tmpProjectRoot, '.cursor', 'agents', 'sync-file-agent.md');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '# sync file\n', 'utf-8');

    const config = { version: 1, targets: { cursor: { defaultScope: 'local' } } } as any;
    const copies = await findSyncedAgentCopies({
      agentNames: ['sync-file-agent'],
      config,
      currentCwd: tmpProjectRoot,
    });

    expect(copies).toHaveLength(1);
    expect(copies[0]!.form).toBe('file');
    expect(copies[0]!.path).toBe(filePath);
  });
});
