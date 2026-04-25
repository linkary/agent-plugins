import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeRepoUrl } from '../src/core/registry.js';

let tmpHome = '';
let repoFixture = '';
let cloneFailures = new Set<string>();
let credentialFailures = new Set<string>();
let missingRepos = new Set<string>();

mock.module('../src/util/git-utils.js', () => ({
  runGit: async (args: string[], opts?: { env?: NodeJS.ProcessEnv }) => {
    if (args[0] === 'clone') {
      const repoUrl = args[args.length - 2]!;
      if (cloneFailures.has(repoUrl) || missingRepos.has(repoUrl) || (credentialFailures.has(repoUrl) && !opts?.env?.GIT_ASKPASS)) {
        return 1;
      }
      const cloneDest = args[args.length - 1]!;
      await fs.cp(repoFixture, cloneDest, { recursive: true });
      return 0;
    }
    return 0;
  },
  runGitCapture: async (args: string[], opts?: { env?: NodeJS.ProcessEnv }) => {
    if (args.includes('clone')) {
      const repoUrl = args[args.length - 2]!;
      if (cloneFailures.has(repoUrl) || missingRepos.has(repoUrl) || (credentialFailures.has(repoUrl) && !opts?.env?.GIT_ASKPASS)) {
        return {
          code: 128,
          stdout: '',
          stderr: cloneFailures.has(repoUrl) ? 'fatal: clone failed' : 'ERROR: Repository not found.',
        };
      }
      const cloneDest = args[args.length - 1]!;
      await fs.cp(repoFixture, cloneDest, { recursive: true });
      return { code: 0, stdout: '', stderr: '' };
    }

    const repoUrl = args[args.length - 1]!;
    if (credentialFailures.has(repoUrl)) {
      return {
        code: 128,
        stdout: '',
        stderr: "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
      };
    }
    if (missingRepos.has(repoUrl)) {
      return {
        code: 128,
        stdout: '',
        stderr: 'ERROR: Repository not found.',
      };
    }
    return { code: 0, stdout: '', stderr: '' };
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
    cloneFailures = new Set<string>();
    credentialFailures = new Set<string>();
    missingRepos = new Set<string>();
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

  it('keeps updating successful repos when another repo clone fails', async () => {
    const badRepoUrl = 'https://example.com/bad-skills';
    cloneFailures.add(badRepoUrl);

    const now = '2024-01-01T00:00:00Z';
    const registryPath = path.join(tmpHome, 'registry.json');
    const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
    registry.skills['skill-bad'] = {
      name: 'skill-bad',
      addedAt: now,
      updatedAt: now,
      source: { type: 'git', url: badRepoUrl },
    };
    registry.repos[normalizeRepoUrl(badRepoUrl)] = {
      url: badRepoUrl,
      skills: ['skill-bad'],
      addedAt: now,
      updatedAt: now,
    };
    await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));

    let stderr = '';
    const originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += chunk.toString();
      return true;
    }) as typeof process.stderr.write;
    try {
      const code = await cmdSkillsUpdate([], { all: true }, { cwd: tmpHome });
      expect(code).toBe(0);
    } finally {
      process.stderr.write = originalWrite;
    }

    const updated = await fs.readFile(path.join(tmpHome, 'skills', 'skill-a', 'SKILL.md'), 'utf8');
    expect(updated).toBe('new-a');
    expect(stderr).toContain(`Failed to clone ${badRepoUrl}`);
  });

  it('does not print a duplicate credentials-required line before non-interactive failure', async () => {
    const privateRepoUrl = 'https://github.com/example/private-skills';
    credentialFailures.add(privateRepoUrl);

    const now = '2024-01-01T00:00:00Z';
    const registryPath = path.join(tmpHome, 'registry.json');
    const registry = {
      version: 1,
      skills: {
        private: { name: 'private', addedAt: now, updatedAt: now, source: { type: 'git', url: privateRepoUrl } },
      },
      repos: {
        [normalizeRepoUrl(privateRepoUrl)]: {
          url: privateRepoUrl,
          skills: ['private'],
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
    await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));

    let stderr = '';
    const originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += chunk.toString();
      return true;
    }) as typeof process.stderr.write;
    try {
      const code = await cmdSkillsUpdate([], { all: true }, { cwd: tmpHome });
      expect(code).toBe(1);
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(stderr).toContain(`Cannot prompt for credentials in non-interactive mode: ${privateRepoUrl}`);
    expect(stderr).not.toContain('Credentials required for repo');
  });

  it('marks missing GitHub repos failed without prompting for credentials', async () => {
    const missingRepoUrl = 'https://github.com/example/deleted-skills';
    missingRepos.add(missingRepoUrl);

    const now = '2024-01-01T00:00:00Z';
    const registryPath = path.join(tmpHome, 'registry.json');
    const registry = {
      version: 1,
      skills: {
        deleted: { name: 'deleted', addedAt: now, updatedAt: now, source: { type: 'git', url: missingRepoUrl } },
      },
      repos: {
        [normalizeRepoUrl(missingRepoUrl)]: {
          url: missingRepoUrl,
          skills: ['deleted'],
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
    await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));

    let stderr = '';
    const originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += chunk.toString();
      return true;
    }) as typeof process.stderr.write;
    try {
      const code = await cmdSkillsUpdate([], { all: true }, { cwd: tmpHome });
      expect(code).toBe(1);
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(stderr).toContain(`Failed to access ${missingRepoUrl}`);
    expect(stderr).toContain('Repository not found');
    expect(stderr).not.toContain('Credentials required');
  });
});
