import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cmdSkillsCollect } from '../src/commands/skills/collect.js';
import { pathExists } from '../src/util/fs-utils.js';

let tmpHomeDir = '';
let tmpApgHome = '';
let tmpProjectRoot = '';
let originalHome: string | undefined;
let originalApgHome: string | undefined;

beforeEach(async () => {
  tmpHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-collect-home-'));
  tmpApgHome = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-collect-apg-'));
  tmpProjectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-collect-project-'));
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

describe('skills collect', () => {
  it('preserves target .git while skipping source .git on overwrite', async () => {
    const sourceSkillDir = path.join(tmpProjectRoot, '.cursor', 'skills', 'demo-skill');
    await fs.mkdir(path.join(sourceSkillDir, '.git'), { recursive: true });
    await fs.writeFile(path.join(sourceSkillDir, 'SKILL.md'), '# Demo\nsource body\n', 'utf-8');
    await fs.writeFile(path.join(sourceSkillDir, '.git', 'HEAD'), 'ref: refs/heads/source\n', 'utf-8');

    const centralSkillDir = path.join(tmpApgHome, 'skills', 'demo-skill');
    await fs.mkdir(path.join(centralSkillDir, '.git'), { recursive: true });
    await fs.writeFile(path.join(centralSkillDir, 'SKILL.md'), '# Demo\nold body\n', 'utf-8');
    await fs.writeFile(path.join(centralSkillDir, 'stale.txt'), 'stale\n', 'utf-8');
    await fs.writeFile(path.join(centralSkillDir, '.git', 'HEAD'), 'ref: refs/heads/target\n', 'utf-8');

    const exitCode = await cmdSkillsCollect(
      ['demo-skill'],
      { target: 'cursor', scope: 'local', cwd: tmpProjectRoot, force: true, overwrite: true },
      { cwd: tmpProjectRoot },
    );

    expect(exitCode).toBe(0);
    expect(await fs.readFile(path.join(centralSkillDir, 'SKILL.md'), 'utf-8')).toBe('# Demo\nsource body\n');
    expect(await pathExists(path.join(centralSkillDir, 'stale.txt'))).toBe(false);
    expect(await fs.readFile(path.join(centralSkillDir, '.git', 'HEAD'), 'utf-8')).toBe('ref: refs/heads/target\n');
  });
});
