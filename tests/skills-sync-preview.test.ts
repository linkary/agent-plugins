import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let capturedPromptParams: Record<string, unknown> | null = null;
const originalStdinIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const originalStdoutIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
const originalTz = process.env.TZ;

mock.module('../src/util/prompt.js', () => ({
  promptMultiSelect: async (params: Record<string, unknown>) => {
    capturedPromptParams = params;
    const options = (params.options as Array<{ value: string }>) ?? [];
    return options.map((option) => option.value);
  },
  promptSelect: async () => {
    throw new Error('promptSelect should not be called in this test');
  },
  promptConfirm: async () => {
    throw new Error('promptConfirm should not be called in this test');
  },
  promptChoice: async () => 's',
}));

const { cmdSkillsSync } = await import('../src/commands/skills/sync.js');

let tmpHomeDir = '';
let tmpApgHome = '';
let tmpProjectRoot = '';
let originalHome: string | undefined;
let originalApgHome: string | undefined;

const stripAnsi = (value: string) => value.replace(/\x1b\[[0-9;]*m/g, '');

async function setTreeTime(treePath: string, timestamp: Date): Promise<void> {
  const stat = await fs.stat(treePath);
  if (stat.isDirectory()) {
    const entries = await fs.readdir(treePath);
    for (const entry of entries) {
      await setTreeTime(path.join(treePath, entry), timestamp);
    }
  }
  await fs.utimes(treePath, timestamp, timestamp);
}

async function writeSkill(dirPath: string, content: string, timestamp: Date): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(path.join(dirPath, 'SKILL.md'), content, 'utf8');
  await setTreeTime(dirPath, timestamp);
}

beforeEach(async () => {
  capturedPromptParams = null;
  tmpHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-sync-preview-home-'));
  tmpApgHome = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-sync-preview-apg-'));
  tmpProjectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-sync-preview-project-'));

  originalHome = process.env.HOME;
  originalApgHome = process.env.APG_HOME;
  process.env.HOME = tmpHomeDir;
  process.env.APG_HOME = tmpApgHome;
  process.env.TZ = 'UTC';

  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
});

afterEach(async () => {
  if (originalStdinIsTTY) Object.defineProperty(process.stdin, 'isTTY', originalStdinIsTTY);
  else delete (process.stdin as { isTTY?: boolean }).isTTY;

  if (originalStdoutIsTTY) Object.defineProperty(process.stdout, 'isTTY', originalStdoutIsTTY);
  else delete (process.stdout as { isTTY?: boolean }).isTTY;

  if (originalHome !== undefined) process.env.HOME = originalHome;
  else delete process.env.HOME;

  if (originalApgHome !== undefined) process.env.APG_HOME = originalApgHome;
  else delete process.env.APG_HOME;

  if (originalTz !== undefined) process.env.TZ = originalTz;
  else delete process.env.TZ;

  await fs.rm(tmpHomeDir, { recursive: true, force: true });
  await fs.rm(tmpApgHome, { recursive: true, force: true });
  await fs.rm(tmpProjectRoot, { recursive: true, force: true });
});

describe('skills sync preview labels', () => {
  it('shows conflict metadata for a single changed target without sync history', async () => {
    const srcTime = new Date('2026-04-01T09:12:00.000Z');
    const destTime = new Date('2026-04-06T14:33:00.000Z');

    await writeSkill(path.join(tmpApgHome, 'skills', 'reviewer'), 'new-source', srcTime);
    await writeSkill(path.join(tmpProjectRoot, '.cursor', 'skills', 'reviewer'), 'old', destTime);

    const code = await cmdSkillsSync([], { target: 'cursor', scope: 'local', 'dry-run': true }, { cwd: tmpProjectRoot });
    expect(code).toBe(0);

    const options = capturedPromptParams?.options as Array<{ label: string; detailLines?: string[]; value: string }>;
    expect(options).toHaveLength(1);
    expect(stripAnsi(options[0]!.label)).toBe(
      'reviewer → Cursor (local) [conflict] 10 B 2026-04-01 09:12 → 3 B 2026-04-06 14:33',
    );
    expect(options[0]!.detailLines).toBeUndefined();
  });

  it('keeps grouped multi-target previews concise and omits same-target metadata', async () => {
    const srcTime = new Date('2026-04-01T09:12:00.000Z');
    const replaceTime = new Date('2026-04-06T14:33:00.000Z');
    const sameTime = new Date('2026-04-05T08:00:00.000Z');

    await writeSkill(path.join(tmpApgHome, 'skills', 'reviewer'), 'new-source', srcTime);
    await writeSkill(path.join(tmpProjectRoot, '.cursor', 'skills', 'reviewer'), 'old', replaceTime);
    await writeSkill(path.join(tmpProjectRoot, '.codex', 'skills', 'reviewer'), 'new-source', sameTime);

    const code = await cmdSkillsSync(
      [],
      { target: 'cursor,codex', scope: 'local', 'dry-run': true },
      { cwd: tmpProjectRoot },
    );
    expect(code).toBe(0);

    const options = capturedPromptParams?.options as Array<{ label: string; detailLines?: string[]; value: string }>;
    expect(options).toHaveLength(1);

    const label = stripAnsi(options[0]!.label);
    expect(label).toContain('reviewer [1 conflict, 1 same] | Cursor (local) [conflict] 10 B 2026-04-01 09:12 → 3 B 2026-04-06 14:33');
    expect(label).not.toContain('Codex (local)');
    expect(options[0]!.detailLines).toBeUndefined();
  });

  it('switches to multiline details when more than one target changed', async () => {
    const srcTime = new Date('2026-04-01T09:12:00.000Z');
    const replaceTime = new Date('2026-04-06T14:33:00.000Z');
    const sameTime = new Date('2026-04-05T08:00:00.000Z');

    await writeSkill(path.join(tmpApgHome, 'skills', 'reviewer'), 'new-source', srcTime);
    await writeSkill(path.join(tmpProjectRoot, '.cursor', 'skills', 'reviewer'), 'old', replaceTime);
    await writeSkill(path.join(tmpProjectRoot, '.codex', 'skills', 'reviewer'), 'new-source', sameTime);

    const code = await cmdSkillsSync(
      [],
      { target: 'cursor,claude,codex', scope: 'local', 'dry-run': true },
      { cwd: tmpProjectRoot },
    );
    expect(code).toBe(0);

    const options = capturedPromptParams?.options as Array<{ label: string; detailLines?: string[]; value: string }>;
    expect(options).toHaveLength(1);

    expect(stripAnsi(options[0]!.label)).toBe('reviewer [1 new, 1 conflict, 1 same]');
    expect(options[0]!.detailLines?.map(stripAnsi)).toEqual([
      'Cursor (local) [conflict] 10 B 2026-04-01 09:12 → 3 B 2026-04-06 14:33',
      'Claude Code (local) [new] 10 B 2026-04-01 09:12',
    ]);
  });
});
