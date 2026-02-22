import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cmdAgentsSync } from '../src/commands/agents/sync.js';
import { cmdAgentsRemove } from '../src/commands/agents/rm.js';
import { pathExists } from '../src/util/fs-utils.js';

let tmpHomeDir = '';
let tmpApgHome = '';
let tmpProjectRoot = '';
let originalHome: string | undefined;
let originalApgHome: string | undefined;

beforeEach(async () => {
  tmpHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-agents-file-home-'));
  tmpApgHome = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-agents-file-apg-'));
  tmpProjectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-agents-file-project-'));
  originalHome = process.env.HOME;
  originalApgHome = process.env.APG_HOME;
  process.env.HOME = tmpHomeDir;
  process.env.APG_HOME = tmpApgHome;
});

afterEach(async () => {
  if (originalHome !== undefined) process.env.HOME = originalHome;
  else delete process.env.HOME;

  if (originalApgHome !== undefined) process.env.APG_HOME = originalApgHome;
  else delete process.env.APG_HOME;

  await fs.rm(tmpHomeDir, { recursive: true, force: true });
  await fs.rm(tmpApgHome, { recursive: true, force: true });
  await fs.rm(tmpProjectRoot, { recursive: true, force: true });
});

describe('agents file-form', () => {
  it('syncs central .md agent into target agents directory', async () => {
    const centralAgentsDir = path.join(tmpApgHome, 'agents');
    await fs.mkdir(centralAgentsDir, { recursive: true });
    await fs.writeFile(path.join(centralAgentsDir, 'agent-creator.md'), '# agent creator\n', 'utf-8');

    const code = await cmdAgentsSync([], { target: 'cursor', scope: 'local', force: true }, { cwd: tmpProjectRoot });
    expect(code).toBe(0);

    const targetAgentPath = path.join(tmpProjectRoot, '.cursor', 'agents', 'agent-creator.md');
    expect(await pathExists(targetAgentPath)).toBe(true);
  });

  it('removes central .md agent by name', async () => {
    const centralAgentsDir = path.join(tmpApgHome, 'agents');
    const centralAgentPath = path.join(centralAgentsDir, 'plugin-validator.md');
    await fs.mkdir(centralAgentsDir, { recursive: true });
    await fs.writeFile(centralAgentPath, '# plugin validator\n', 'utf-8');

    const code = await cmdAgentsRemove(['plugin-validator'], {}, { cwd: tmpProjectRoot });
    expect(code).toBe(0);
    expect(await pathExists(centralAgentPath)).toBe(false);
  });

  it('replaces target directory-form agent with central .md file on --force', async () => {
    const centralAgentsDir = path.join(tmpApgHome, 'agents');
    await fs.mkdir(centralAgentsDir, { recursive: true });
    await fs.writeFile(path.join(centralAgentsDir, 'skill-reviewer.md'), '# new file form\n', 'utf-8');

    const targetAgentDir = path.join(tmpProjectRoot, '.cursor', 'agents', 'skill-reviewer');
    await fs.mkdir(targetAgentDir, { recursive: true });
    await fs.writeFile(path.join(targetAgentDir, 'AGENT.md'), '# old directory form\n', 'utf-8');

    const code = await cmdAgentsSync([], { target: 'cursor', scope: 'local', force: true }, { cwd: tmpProjectRoot });
    expect(code).toBe(0);

    const targetAgentFile = path.join(tmpProjectRoot, '.cursor', 'agents', 'skill-reviewer.md');
    expect(await pathExists(targetAgentFile)).toBe(true);
    expect(await pathExists(targetAgentDir)).toBe(false);
  });

  it('removes target .md agent by name with --target', async () => {
    const targetAgentPath = path.join(tmpProjectRoot, '.cursor', 'agents', 'agent-creator.md');
    await fs.mkdir(path.dirname(targetAgentPath), { recursive: true });
    await fs.writeFile(targetAgentPath, '# target file agent\n', 'utf-8');

    const code = await cmdAgentsRemove(
      ['agent-creator'],
      { target: 'cursor', scope: 'local', cwd: tmpProjectRoot },
      { cwd: tmpProjectRoot },
    );
    expect(code).toBe(0);
    expect(await pathExists(targetAgentPath)).toBe(false);
  });
});
