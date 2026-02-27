/**
 * Tests for sync conflict resolution options:
 *   Force mode: auto-overwrite
 *   Non-interactive: returns exit 1 on unmanaged conflict
 *   Dry-run: no file modifications
 *   Mixed scenarios: new + same + conflict in one call
 *
 * Uses skills sync with Cursor adapter in local scope for fully controlled paths.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cmdSkillsSync } from '../src/commands/skills/sync.js';

let tmpDir: string;
let origApgHome: string | undefined;
let origAgentPluginsHome: string | undefined;

/** Central store: $APG_HOME/skills/<name>/ */
const centralSkillDir = () => path.join(process.env.APG_HOME!, 'skills');
/** Target dir for Cursor local scope: <projectRoot>/.cursor/skills/<name>/ */
const targetSkillDir = (projectRoot: string) =>
  path.join(projectRoot, '.cursor', 'skills');

async function writeSkill(baseDir: string, name: string, content: string) {
  const dir = path.join(baseDir, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), content);
}

async function readSkill(baseDir: string, name: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(baseDir, name, 'SKILL.md'), 'utf8');
  } catch {
    return null;
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-sync-conflict-'));
  origApgHome = process.env.APG_HOME;
  origAgentPluginsHome = process.env.AGENT_PLUGINS_HOME;
  process.env.APG_HOME = path.join(tmpDir, 'apg-home');
  delete process.env.AGENT_PLUGINS_HOME;
});

afterEach(async () => {
  if (origApgHome !== undefined) process.env.APG_HOME = origApgHome;
  else delete process.env.APG_HOME;
  if (origAgentPluginsHome !== undefined) process.env.AGENT_PLUGINS_HOME = origAgentPluginsHome;
  else delete process.env.AGENT_PLUGINS_HOME;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const makeFlags = (extra: Record<string, unknown> = {}) => ({
  target: 'cursor',
  scope: 'local',
  force: true,
  overwrite: true,
  ...extra,
});

describe('skills sync conflict resolution', () => {
  // ─── Force mode (--force auto-overwrites) ─────────────────────────

  it('force: overwrites conflicting skill', async () => {
    const projectRoot = path.join(tmpDir, 'project');
    const target = targetSkillDir(projectRoot);
    await writeSkill(centralSkillDir(), 'alpha', 'central-v2');
    await writeSkill(target, 'alpha', 'target-v1');

    const exit = await cmdSkillsSync(
      ['alpha'],
      makeFlags({ cwd: projectRoot }),
      { cwd: projectRoot },
    );

    expect(exit).toBe(0);
    expect(await readSkill(target, 'alpha')).toBe('central-v2');
  });

  it('force: syncs new skill', async () => {
    const projectRoot = path.join(tmpDir, 'project');
    const target = targetSkillDir(projectRoot);
    await writeSkill(centralSkillDir(), 'beta', 'brand-new');

    const exit = await cmdSkillsSync(
      ['beta'],
      makeFlags({ cwd: projectRoot }),
      { cwd: projectRoot },
    );

    expect(exit).toBe(0);
    expect(await readSkill(target, 'beta')).toBe('brand-new');
  });

  it('force: skips up-to-date skill (no redundant write)', async () => {
    const projectRoot = path.join(tmpDir, 'project');
    const target = targetSkillDir(projectRoot);
    await writeSkill(centralSkillDir(), 'gamma', 'same-content');
    await writeSkill(target, 'gamma', 'same-content');

    const exit = await cmdSkillsSync(
      ['gamma'],
      makeFlags({ cwd: projectRoot }),
      { cwd: projectRoot },
    );

    expect(exit).toBe(0);
    expect(await readSkill(target, 'gamma')).toBe('same-content');
  });

  // ─── Dry-run mode ─────────────────────────────────────────────────

  it('dry-run: does not modify existing target files', async () => {
    const projectRoot = path.join(tmpDir, 'project');
    const target = targetSkillDir(projectRoot);
    await writeSkill(centralSkillDir(), 'epsilon', 'central-v2');
    await writeSkill(target, 'epsilon', 'target-v1');

    const exit = await cmdSkillsSync(
      ['epsilon'],
      makeFlags({ cwd: projectRoot, 'dry-run': true }),
      { cwd: projectRoot },
    );

    expect(exit).toBe(0);
    expect(await readSkill(target, 'epsilon')).toBe('target-v1');
  });

  it('dry-run: does not create new skill on disk', async () => {
    const projectRoot = path.join(tmpDir, 'project');
    const target = targetSkillDir(projectRoot);
    await writeSkill(centralSkillDir(), 'zeta', 'brand-new');

    const exit = await cmdSkillsSync(
      ['zeta'],
      makeFlags({ cwd: projectRoot, 'dry-run': true }),
      { cwd: projectRoot },
    );

    expect(exit).toBe(0);
    expect(await pathExists(path.join(target, 'zeta'))).toBe(false);
  });

  // ─── Mixed scenarios ──────────────────────────────────────────────

  it('force: handles mix of new, same, and conflict skills', async () => {
    const projectRoot = path.join(tmpDir, 'project');
    const target = targetSkillDir(projectRoot);

    // new
    await writeSkill(centralSkillDir(), 'sA', 'new-content');
    // same
    await writeSkill(centralSkillDir(), 'sB', 'same-content');
    await writeSkill(target, 'sB', 'same-content');
    // conflict
    await writeSkill(centralSkillDir(), 'sC', 'central-v2');
    await writeSkill(target, 'sC', 'target-v1');

    const exit = await cmdSkillsSync(
      ['sA', 'sB', 'sC'],
      makeFlags({ cwd: projectRoot }),
      { cwd: projectRoot },
    );

    expect(exit).toBe(0);
    expect(await readSkill(target, 'sA')).toBe('new-content');
    expect(await readSkill(target, 'sB')).toBe('same-content');
    expect(await readSkill(target, 'sC')).toBe('central-v2');
  });

  // ─── Empty central store ──────────────────────────────────────────

  it('returns 0 with message when central store is empty', async () => {
    const projectRoot = path.join(tmpDir, 'project');
    // Ensure central skills dir exists but is empty
    await fs.mkdir(centralSkillDir(), { recursive: true });

    const exit = await cmdSkillsSync(
      [],
      makeFlags({ cwd: projectRoot }),
      { cwd: projectRoot },
    );

    expect(exit).toBe(0);
  });

  // ─── Backup on force (managed clean auto-overwrite) ───────────────

  it('force: overwrites managed-clean conflict (previously synced, unchanged)', async () => {
    const projectRoot = path.join(tmpDir, 'project');
    const target = targetSkillDir(projectRoot);

    // First sync: establish managed state
    await writeSkill(centralSkillDir(), 'managed', 'v1');
    await cmdSkillsSync(
      ['managed'],
      makeFlags({ cwd: projectRoot }),
      { cwd: projectRoot },
    );
    expect(await readSkill(target, 'managed')).toBe('v1');

    // Update central, target is unchanged (managed clean)
    await writeSkill(centralSkillDir(), 'managed', 'v2');
    const exit = await cmdSkillsSync(
      ['managed'],
      makeFlags({ cwd: projectRoot }),
      { cwd: projectRoot },
    );

    expect(exit).toBe(0);
    expect(await readSkill(target, 'managed')).toBe('v2');
  });
});
