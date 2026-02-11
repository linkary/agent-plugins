import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { gatherTargetSkills, findSyncedCopies } from '../src/commands/skills/manage-utils.js';
import { getAdapters } from '../src/targets/adapters.js';

// Helper: 创建包含一些 skill 的临时目录
async function createTempEnv() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ap-test-manage-'));
  const projectRoot = path.join(tmpDir, 'project');
  const homeDir = path.join(tmpDir, 'home');

  await fs.mkdir(projectRoot, { recursive: true });
  await fs.mkdir(homeDir, { recursive: true });

  // 创建 local .cursor/skills/skill-a
  const localCursorSkill = path.join(projectRoot, '.cursor', 'skills', 'skill-a');
  await fs.mkdir(localCursorSkill, { recursive: true });

  // 创建 global .cursor/skills/skill-b
  const globalCursorSkill = path.join(homeDir, '.cursor', 'skills', 'skill-b');
  await fs.mkdir(globalCursorSkill, { recursive: true });

  return { tmpDir, projectRoot, homeDir };
}

describe('gatherTargetSkills', () => {
  let env: { tmpDir: string; projectRoot: string; homeDir: string };

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await fs.rm(env.tmpDir, { recursive: true, force: true });
  });

  it('should find local skills when scope is local', async () => {
    const adapters = getAdapters().filter((a) => a.id === 'cursor');
    const config = { version: 1, targets: { cursor: { defaultScope: 'local', include: ['*'] } } } as any;

    const skills = await gatherTargetSkills({
      adapters,
      config,
      scopeFlag: 'local',
      currentCwd: env.projectRoot,
    });

    const skillNames = skills.map((s) => s.name);
    expect(skillNames).toContain('skill-a');
    expect(skills[0]!.scope).toBe('local');
  });

  it('should return empty list if no skills found', async () => {
    const adapters = getAdapters().filter((a) => a.id === 'codex');
    const config = { version: 1, targets: { codex: { defaultScope: 'local', include: ['*'] } } } as any;

    const skills = await gatherTargetSkills({
      adapters,
      config,
      scopeFlag: 'local',
      currentCwd: env.projectRoot,
    });

    expect(skills).toHaveLength(0);
  });
});

describe('findSyncedCopies', () => {
  let env: { tmpDir: string; projectRoot: string; homeDir: string };

  beforeEach(async () => {
    env = await createTempEnv();
  });

  afterEach(async () => {
    await fs.rm(env.tmpDir, { recursive: true, force: true });
  });

  it('should find synced copies that exist on disk', async () => {
    // findSyncedCopies 使用 getAdapters() 内部获取适配器，再调用 resolveTargetContext
    // 对于 local scope + currentCwd = env.projectRoot，应该能找到 skill-a
    const config = { version: 1, targets: { cursor: { defaultScope: 'local', include: ['*'] } } } as any;

    const copies = await findSyncedCopies({
      skillNames: ['skill-a'],
      config,
      currentCwd: env.projectRoot,
    });

    // 至少 cursor 适配器应找到 skill-a（local scope）
    const cursorCopy = copies.find((c) => c.adapterId === 'cursor');
    expect(cursorCopy).toBeDefined();
    expect(cursorCopy!.skillName).toBe('skill-a');
  });

  it('should return empty array for non-existent skills', async () => {
    const config = { version: 1, targets: {} } as any;

    const copies = await findSyncedCopies({
      skillNames: ['non-existent-skill'],
      config,
      currentCwd: env.projectRoot,
    });

    expect(copies).toHaveLength(0);
  });

  it('should return empty array when no skill names are provided', async () => {
    const config = { version: 1, targets: {} } as any;

    const copies = await findSyncedCopies({
      skillNames: [],
      config,
      currentCwd: env.projectRoot,
    });

    expect(copies).toHaveLength(0);
  });
});
