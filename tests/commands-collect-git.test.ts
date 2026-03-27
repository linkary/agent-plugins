import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cmdCommandsCollect } from '../src/commands/commands/collect.js';
import { pathExists } from '../src/util/fs-utils.js';

let tmpHomeDir = '';
let tmpApgHome = '';
let tmpProjectRoot = '';
let originalHome: string | undefined;
let originalApgHome: string | undefined;

beforeEach(async () => {
  tmpHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-commands-collect-home-'));
  tmpApgHome = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-commands-collect-apg-'));
  tmpProjectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-commands-collect-project-'));
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

describe('commands collect .git handling', () => {
  it('treats .git-only resource differences as identical', async () => {
    const targetCommandsDir = path.join(tmpProjectRoot, '.cursor', 'commands');
    await fs.mkdir(path.join(targetCommandsDir, 'demo', '.git'), { recursive: true });
    await fs.writeFile(path.join(targetCommandsDir, 'demo.md'), '# Demo\n', 'utf-8');
    await fs.writeFile(path.join(targetCommandsDir, 'demo', '.git', 'HEAD'), 'ref: refs/heads/source\n', 'utf-8');

    const centralCommandsDir = path.join(tmpApgHome, 'commands');
    await fs.mkdir(centralCommandsDir, { recursive: true });
    await fs.writeFile(path.join(centralCommandsDir, 'demo.md'), '# Demo\n', 'utf-8');

    const exitCode = await cmdCommandsCollect(
      ['demo'],
      { target: 'cursor', scope: 'local', cwd: tmpProjectRoot },
      { cwd: tmpProjectRoot },
    );

    expect(exitCode).toBe(0);
    expect(await pathExists(path.join(centralCommandsDir, 'demo'))).toBe(false);
    expect(await fs.readFile(path.join(centralCommandsDir, 'demo.md'), 'utf-8')).toBe('# Demo\n');
  });

  it('preserves target .git while skipping source .git on overwrite', async () => {
    const targetCommandsDir = path.join(tmpProjectRoot, '.cursor', 'commands');
    await fs.mkdir(path.join(targetCommandsDir, 'demo', '.git'), { recursive: true });
    await fs.writeFile(path.join(targetCommandsDir, 'demo.md'), '# Demo\nsource body\n', 'utf-8');
    await fs.writeFile(path.join(targetCommandsDir, 'demo', 'resource.txt'), 'source resource\n', 'utf-8');
    await fs.writeFile(path.join(targetCommandsDir, 'demo', '.git', 'HEAD'), 'ref: refs/heads/source\n', 'utf-8');

    const centralCommandDir = path.join(tmpApgHome, 'commands', 'demo');
    await fs.mkdir(path.join(centralCommandDir, '.git'), { recursive: true });
    await fs.writeFile(path.join(centralCommandDir, 'demo.md'), '# Demo\nold body\n', 'utf-8');
    await fs.writeFile(path.join(centralCommandDir, 'resource.txt'), 'old resource\n', 'utf-8');
    await fs.writeFile(path.join(centralCommandDir, 'stale.txt'), 'stale\n', 'utf-8');
    await fs.writeFile(path.join(centralCommandDir, '.git', 'HEAD'), 'ref: refs/heads/target\n', 'utf-8');

    const exitCode = await cmdCommandsCollect(
      ['demo'],
      { target: 'cursor', scope: 'local', cwd: tmpProjectRoot, force: true, overwrite: true },
      { cwd: tmpProjectRoot },
    );

    expect(exitCode).toBe(0);
    expect(await fs.readFile(path.join(centralCommandDir, 'demo.md'), 'utf-8')).toBe('# Demo\nsource body\n');
    expect(await fs.readFile(path.join(centralCommandDir, 'resource.txt'), 'utf-8')).toBe('source resource\n');
    expect(await pathExists(path.join(centralCommandDir, 'stale.txt'))).toBe(false);
    expect(await fs.readFile(path.join(centralCommandDir, '.git', 'HEAD'), 'utf-8')).toBe('ref: refs/heads/target\n');
  });
});
