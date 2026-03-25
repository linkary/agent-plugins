import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeRepoUrl } from '../src/core/registry.js';

let tmpHome = '';
let repoFixture = '';

mock.module('../src/util/git-utils.js', () => ({
  runGit: async (args: string[]) => {
    if (args[0] === 'clone') {
      const cloneDest = args[args.length - 1]!;
      await fs.cp(repoFixture, cloneDest, { recursive: true });
      return 0;
    }
    return 0;
  },
  isSkillDir: async (dir: string) => {
    try {
      await fs.stat(path.join(dir, 'SKILL.md'));
      return true;
    } catch {
      return false;
    }
  },
}));

mock.module('../src/util/skill-compare.js', () => ({
  detectSkillStatus: async (srcDir: string) => {
    if (srcDir.includes('skill-missing')) {
      await fs.rm(srcDir, { recursive: true, force: true });
    }
    return { status: 'update', srcHash: 'x', destHash: 'y' };
  },
}));

const { cmdSkillsUpdate } = await import('../src/commands/skills/update.js');

describe('skills update', () => {
  const repoUrl = 'https://example.com/skills';

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-skills-update-'));
    process.env.APG_HOME = tmpHome;

    repoFixture = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-skills-repo-'));
    await fs.mkdir(path.join(repoFixture, 'skills', 'skill-a'), { recursive: true });
    await fs.mkdir(path.join(repoFixture, 'skills', 'skill-missing'), { recursive: true });
    await fs.writeFile(path.join(repoFixture, 'skills', 'skill-a', 'SKILL.md'), 'new-a');
    await fs.writeFile(path.join(repoFixture, 'skills', 'skill-missing', 'SKILL.md'), 'new-missing');

    const centralSkillsDir = path.join(tmpHome, 'skills');
    await fs.mkdir(path.join(centralSkillsDir, 'skill-a'), { recursive: true });
    await fs.mkdir(path.join(centralSkillsDir, 'skill-missing'), { recursive: true });
    await fs.writeFile(path.join(centralSkillsDir, 'skill-a', 'SKILL.md'), 'old-a');
    await fs.writeFile(path.join(centralSkillsDir, 'skill-missing', 'SKILL.md'), 'old-missing');

    const now = '2024-01-01T00:00:00Z';
    const registry = {
      version: 1,
      skills: {
        'skill-a': { name: 'skill-a', addedAt: now, updatedAt: now, source: { type: 'git', url: repoUrl } },
        'skill-missing': { name: 'skill-missing', addedAt: now, updatedAt: now, source: { type: 'git', url: repoUrl } },
      },
      repos: {
        [normalizeRepoUrl(repoUrl)]: {
          url: repoUrl,
          skills: ['skill-a', 'skill-missing'],
          addedAt: now,
          updatedAt: now,
        },
      },
      agents: {},
      commands: {},
      rules: {},
      mcp: {},
      agentRepos: {},
      commandRepos: {},
      ruleRepos: {},
    };

    await fs.writeFile(path.join(tmpHome, 'registry.json'), JSON.stringify(registry, null, 2));
  });

  afterEach(async () => {
    if (tmpHome) await fs.rm(tmpHome, { recursive: true, force: true });
    if (repoFixture) await fs.rm(repoFixture, { recursive: true, force: true });
    delete process.env.APG_HOME;
  });

  it('skips missing skills without failing the update run', async () => {
    const code = await cmdSkillsUpdate([], { all: true }, { cwd: tmpHome });
    expect(code).toBe(0);

    const updated = await fs.readFile(path.join(tmpHome, 'skills', 'skill-a', 'SKILL.md'), 'utf8');
    expect(updated).toBe('new-a');

    const missing = await fs.readFile(path.join(tmpHome, 'skills', 'skill-missing', 'SKILL.md'), 'utf8');
    expect(missing).toBe('old-missing');

    const registry = JSON.parse(await fs.readFile(path.join(tmpHome, 'registry.json'), 'utf8'));
    expect(registry.skills['skill-a'].updatedAt).not.toBe('2024-01-01T00:00:00Z');
    expect(registry.skills['skill-missing'].updatedAt).toBe('2024-01-01T00:00:00Z');
  });
});
