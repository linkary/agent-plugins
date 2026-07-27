import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cmdSkillsAdd } from '../src/commands/skills/add.js';
import { loadRegistry, saveRegistry } from '../src/core/registry.js';
import { pathExists } from '../src/util/fs-utils.js';

let tmpHomeDir = '';
let tmpApgHome = '';
let tmpSrcRoot = '';
let originalHome: string | undefined;
let originalApgHome: string | undefined;

const centralSkill = (name: string) => path.join(tmpApgHome, 'skills', name);

async function writeSkill(dir: string, body: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), body, 'utf-8');
}

beforeEach(async () => {
  tmpHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-add-home-'));
  tmpApgHome = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-add-apg-'));
  tmpSrcRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-add-src-'));
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
  await fs.rm(tmpSrcRoot, { recursive: true, force: true });
});

describe('skills add — local path', () => {
  it('adds a single skill directory under its basename', async () => {
    const src = path.join(tmpSrcRoot, 'my-skill');
    await writeSkill(src, '# My Skill\nbody\n');

    const exitCode = await cmdSkillsAdd([src], {}, { cwd: tmpSrcRoot });

    expect(exitCode).toBe(0);
    expect(await pathExists(path.join(centralSkill('my-skill'), 'SKILL.md'))).toBe(true);
    const registry = await loadRegistry();
    expect(registry.skills['my-skill']?.source).toEqual({ type: 'local', path: src });
  });

  it('honors --name for a single skill directory', async () => {
    const src = path.join(tmpSrcRoot, 'my-skill');
    await writeSkill(src, '# My Skill\nbody\n');

    const exitCode = await cmdSkillsAdd([src], { name: 'renamed' }, { cwd: tmpSrcRoot });

    expect(exitCode).toBe(0);
    expect(await pathExists(centralSkill('renamed'))).toBe(true);
    expect(await pathExists(centralSkill('my-skill'))).toBe(false);
  });

  it('adds all skills from a collection directory, skipping non-skill subdirs', async () => {
    const col = path.join(tmpSrcRoot, 'collection');
    await writeSkill(path.join(col, 'alpha'), '# Alpha\n');
    await writeSkill(path.join(col, 'beta'), '# Beta\n');
    await fs.mkdir(path.join(col, 'not-a-skill'), { recursive: true });
    await fs.writeFile(path.join(col, 'not-a-skill', 'readme.txt'), 'nope\n', 'utf-8');

    const exitCode = await cmdSkillsAdd([col], {}, { cwd: tmpSrcRoot });

    expect(exitCode).toBe(0);
    expect(await pathExists(centralSkill('alpha'))).toBe(true);
    expect(await pathExists(centralSkill('beta'))).toBe(true);
    expect(await pathExists(centralSkill('not-a-skill'))).toBe(false);
    // The collection root is not itself a skill and must not be added under its basename.
    expect(await pathExists(centralSkill('collection'))).toBe(false);
  });

  it('prefers a skills/ subdirectory when the root is not a skill', async () => {
    const wrap = path.join(tmpSrcRoot, 'wrap');
    await writeSkill(path.join(wrap, 'skills', 'inside'), '# Inside\n');
    // A skill directly under the root should be ignored once skills/ is chosen.
    await writeSkill(path.join(wrap, 'outside'), '# Outside\n');

    const exitCode = await cmdSkillsAdd([wrap], {}, { cwd: tmpSrcRoot });

    expect(exitCode).toBe(0);
    expect(await pathExists(centralSkill('inside'))).toBe(true);
    expect(await pathExists(centralSkill('outside'))).toBe(false);
  });

  it('fails when the directory contains no SKILL.md anywhere', async () => {
    const empty = path.join(tmpSrcRoot, 'empty');
    await fs.mkdir(empty, { recursive: true });
    await fs.writeFile(path.join(empty, 'random.txt'), 'x\n', 'utf-8');

    const exitCode = await cmdSkillsAdd([empty], {}, { cwd: tmpSrcRoot });

    expect(exitCode).toBe(1);
    expect(await pathExists(centralSkill('empty'))).toBe(false);
  });

  it('fails when the path does not exist', async () => {
    const missing = path.join(tmpSrcRoot, 'does-not-exist');
    const exitCode = await cmdSkillsAdd([missing], {}, { cwd: tmpSrcRoot });
    expect(exitCode).toBe(1);
  });

  it('does not overwrite a different-source skill without --force (non-interactive)', async () => {
    // Seed central store + registry with a skill owned by a git source.
    await writeSkill(centralSkill('shared'), '# Shared\nGIT VERSION\n');
    const registry = await loadRegistry();
    const now = new Date().toISOString();
    registry.skills['shared'] = {
      name: 'shared',
      addedAt: now,
      updatedAt: now,
      source: { type: 'git', url: 'https://github.com/owner/repo.git' },
    };
    await saveRegistry(registry);

    const src = path.join(tmpSrcRoot, 'shared');
    await writeSkill(src, '# Shared\nLOCAL VERSION\n');

    const exitCode = await cmdSkillsAdd([src], {}, { cwd: tmpSrcRoot });

    expect(exitCode).toBe(1);
    // Central content untouched, registry source still git.
    expect(await fs.readFile(path.join(centralSkill('shared'), 'SKILL.md'), 'utf-8')).toBe('# Shared\nGIT VERSION\n');
    const after = await loadRegistry();
    expect(after.skills['shared']?.source).toEqual({ type: 'git', url: 'https://github.com/owner/repo.git' });
  });

  it('overwrites a different-source skill with --force', async () => {
    await writeSkill(centralSkill('shared'), '# Shared\nGIT VERSION\n');
    const registry = await loadRegistry();
    const now = new Date().toISOString();
    registry.skills['shared'] = {
      name: 'shared',
      addedAt: now,
      updatedAt: now,
      source: { type: 'git', url: 'https://github.com/owner/repo.git' },
    };
    await saveRegistry(registry);

    const src = path.join(tmpSrcRoot, 'shared');
    await writeSkill(src, '# Shared\nLOCAL VERSION\n');

    const exitCode = await cmdSkillsAdd([src], { force: true }, { cwd: tmpSrcRoot });

    expect(exitCode).toBe(0);
    expect(await fs.readFile(path.join(centralSkill('shared'), 'SKILL.md'), 'utf-8')).toBe('# Shared\nLOCAL VERSION\n');
    const after = await loadRegistry();
    expect(after.skills['shared']?.source).toEqual({ type: 'local', path: src });
  });

  it('does not persist anything on --dry-run', async () => {
    const src = path.join(tmpSrcRoot, 'dry');
    await writeSkill(src, '# Dry\n');

    const exitCode = await cmdSkillsAdd([src], { 'dry-run': true }, { cwd: tmpSrcRoot });

    expect(exitCode).toBe(0);
    expect(await pathExists(centralSkill('dry'))).toBe(false);
    const registry = await loadRegistry();
    expect(registry.skills['dry']).toBeUndefined();
  });
});
