import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cmdAgentsCollect } from '../src/commands/agents/collect.js';
import { cmdAgentsSync } from '../src/commands/agents/sync.js';
import { pathExists } from '../src/util/fs-utils.js';

let tmpHomeDir = '';
let tmpApgHome = '';
let tmpProjectRoot = '';
let originalHome: string | undefined;
let originalApgHome: string | undefined;

beforeEach(async () => {
  tmpHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-agents-canonical-home-'));
  tmpApgHome = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-agents-canonical-apg-'));
  tmpProjectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-agents-canonical-project-'));
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

describe('agents canonical collect/sync', () => {
  it('collects a target file-form agent into canonical central storage', async () => {
    const targetAgentPath = path.join(tmpProjectRoot, '.cursor', 'agents', 'reviewer.md');
    await fs.mkdir(path.dirname(targetAgentPath), { recursive: true });
    await fs.writeFile(
      targetAgentPath,
      '---\nname: reviewer\ndescription: Reviews changes\ncolor: cyan\ntools: ["Read", "Grep"]\n---\nReview the patch.\n',
      'utf8',
    );

    const code = await cmdAgentsCollect([], { target: 'cursor', scope: 'local', force: true }, { cwd: tmpProjectRoot });
    expect(code).toBe(0);

    const centralDir = path.join(tmpApgHome, 'agents', 'reviewer');
    expect(await pathExists(path.join(centralDir, 'agent.toml'))).toBe(true);
    expect(await pathExists(path.join(centralDir, 'prompt.md'))).toBe(true);
    expect(await pathExists(path.join(tmpApgHome, 'agents', 'reviewer.md'))).toBe(false);
    expect(await fs.readFile(path.join(centralDir, 'prompt.md'), 'utf8')).toBe('Review the patch.\n');
  });

  it('syncs canonical central storage with resources into target directory form', async () => {
    const centralDir = path.join(tmpApgHome, 'agents', 'builder');
    await fs.mkdir(path.join(centralDir, 'resources', 'templates'), { recursive: true });
    await fs.writeFile(
      path.join(centralDir, 'agent.toml'),
      'name = "builder"\ndescription = "Builds things"\ncolor = "green"\ntools = ["Read"]\n',
      'utf8',
    );
    await fs.writeFile(path.join(centralDir, 'prompt.md'), 'Build the thing.\n', 'utf8');
    await fs.writeFile(path.join(centralDir, 'resources', 'templates', 'base.txt'), 'template\n', 'utf8');

    const code = await cmdAgentsSync([], { target: 'cursor', scope: 'local', force: true }, { cwd: tmpProjectRoot });
    expect(code).toBe(0);

    const targetDir = path.join(tmpProjectRoot, '.cursor', 'agents', 'builder');
    expect(await pathExists(path.join(targetDir, 'AGENT.md'))).toBe(true);
    expect(await pathExists(path.join(targetDir, 'templates', 'base.txt'))).toBe(true);

    const prompt = await fs.readFile(path.join(targetDir, 'AGENT.md'), 'utf8');
    expect(prompt).toContain('name: builder');
    expect(prompt).toContain('description: "Builds things"');
  });

  it('collects a codex TOML agent into canonical central storage', async () => {
    const targetAgentPath = path.join(tmpProjectRoot, '.codex', 'agents', 'reviewer.toml');
    await fs.mkdir(path.dirname(targetAgentPath), { recursive: true });
    await fs.writeFile(
      targetAgentPath,
      [
        'name = "reviewer"',
        'description = "Reviews changes"',
        'developer_instructions = """Review the patch carefully."""',
        'model = "gpt-5.4"',
        'sandbox_mode = "workspace-write"',
        '',
      ].join('\n'),
      'utf8',
    );

    const code = await cmdAgentsCollect([], { target: 'codex', scope: 'local', force: true }, { cwd: tmpProjectRoot });
    expect(code).toBe(0);

    const centralDir = path.join(tmpApgHome, 'agents', 'reviewer');
    expect(await pathExists(path.join(centralDir, 'agent.toml'))).toBe(true);
    expect(await fs.readFile(path.join(centralDir, 'prompt.md'), 'utf8')).toBe('Review the patch carefully.\n');
    const meta = await fs.readFile(path.join(centralDir, 'agent.toml'), 'utf8');
    expect(meta).toContain('name = "reviewer"');
    expect(meta).toContain('model = "gpt-5.4"');
    expect(meta).toContain('[extensions.codex]');
    expect(meta).toContain('sandbox_mode = "workspace-write"');
  });

  it('syncs canonical central storage into Codex TOML and removes stale markdown copies', async () => {
    const centralDir = path.join(tmpApgHome, 'agents', 'skill-reviewer');
    await fs.mkdir(centralDir, { recursive: true });
    await fs.writeFile(
      path.join(centralDir, 'agent.toml'),
      [
        'name = "skill-reviewer"',
        'description = "Reviews skills"',
        'model = "gpt-5.4"',
        '',
        '[extensions.codex]',
        'sandbox_mode = "workspace-write"',
        '',
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(path.join(centralDir, 'prompt.md'), 'Review skills carefully.\n', 'utf8');

    const staleMarkdownPath = path.join(tmpProjectRoot, '.codex', 'agents', 'skill-reviewer.md');
    await fs.mkdir(path.dirname(staleMarkdownPath), { recursive: true });
    await fs.writeFile(staleMarkdownPath, '# stale markdown agent\n', 'utf8');

    const code = await cmdAgentsSync([], { target: 'codex', scope: 'local', force: true }, { cwd: tmpProjectRoot });
    expect(code).toBe(0);

    const targetTomlPath = path.join(tmpProjectRoot, '.codex', 'agents', 'skill-reviewer.toml');
    expect(await pathExists(targetTomlPath)).toBe(true);
    expect(await pathExists(staleMarkdownPath)).toBe(false);

    const target = await fs.readFile(targetTomlPath, 'utf8');
    expect(target).toContain('name = "skill-reviewer"');
    expect(target).toContain('description = "Reviews skills"');
    expect(target).toContain('developer_instructions = "Review skills carefully."');
    expect(target).toContain('model = "gpt-5.4"');
    expect(target).toContain('sandbox_mode = "workspace-write"');
  });
});
