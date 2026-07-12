import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let promptMultiSelectImpl: ((params: Record<string, unknown>) => Promise<string[]>) | null = null;
let capturedReviewParams: Record<string, unknown> | null = null;
const originalStdinIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const originalStdoutIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');

mock.module('../src/util/prompt.js', () => ({
  promptMultiSelect: async (params: Record<string, unknown>) => {
    if (!promptMultiSelectImpl) throw new Error('promptMultiSelectImpl not configured');
    return promptMultiSelectImpl(params);
  },
  promptReviewConfirm: async (params: Record<string, unknown>) => {
    capturedReviewParams = params;
    return false;
  },
  promptConfirm: async () => {
    throw new Error('promptConfirm should not be called');
  },
  promptSelect: async () => 'no',
  promptChoice: async () => 'c',
}));

const { cmdSkillsRemove } = await import('../src/commands/skills/rm.js');

let tmpHomeDir = '';
let tmpApgHome = '';
let tmpProjectRoot = '';
let originalHome: string | undefined;
let originalApgHome: string | undefined;

beforeEach(async () => {
  promptMultiSelectImpl = null;
  capturedReviewParams = null;
  tmpHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-rm-review-home-'));
  tmpApgHome = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-rm-review-apg-'));
  tmpProjectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-rm-review-project-'));

  originalHome = process.env.HOME;
  originalApgHome = process.env.APG_HOME;
  process.env.HOME = tmpHomeDir;
  process.env.APG_HOME = tmpApgHome;

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

  await fs.rm(tmpHomeDir, { recursive: true, force: true });
  await fs.rm(tmpApgHome, { recursive: true, force: true });
  await fs.rm(tmpProjectRoot, { recursive: true, force: true });
});

describe('skills rm review confirmation', () => {
  it('shows selected central skill names in the review prompt', async () => {
    await fs.mkdir(path.join(tmpApgHome, 'skills', 'alpha'), { recursive: true });
    await fs.writeFile(path.join(tmpApgHome, 'skills', 'alpha', 'SKILL.md'), '# alpha\n', 'utf8');

    promptMultiSelectImpl = async (params) => {
      const message = String(params.message);
      if (message === 'Select where to remove from:') return ['__central__'];
      if (message.startsWith('Select central skills to remove')) return ['alpha'];
      throw new Error(`Unexpected prompt: ${message}`);
    };

    const code = await cmdSkillsRemove([], {}, { cwd: tmpProjectRoot });

    expect(code).toBe(0);
    expect(capturedReviewParams?.message).toBe('Remove 1 central skill(s)?');
    expect(capturedReviewParams?.detailLines).toEqual(['alpha']);
  });

  it('shows full target lines in the review prompt for target removal', async () => {
    const targetSkillDir = path.join(tmpProjectRoot, '.cursor', 'skills', 'alpha');
    await fs.mkdir(targetSkillDir, { recursive: true });
    await fs.writeFile(path.join(targetSkillDir, 'SKILL.md'), '# alpha\n', 'utf8');

    promptMultiSelectImpl = async (params) => {
      const message = String(params.message);
      if (message.startsWith('Select skills to remove')) return ['0'];
      throw new Error(`Unexpected prompt: ${message}`);
    };

    const code = await cmdSkillsRemove([], { target: 'cursor', scope: 'local', cwd: tmpProjectRoot }, { cwd: tmpProjectRoot });

    expect(code).toBe(0);
    expect(capturedReviewParams?.message).toBe('Remove 1 skill(s) from targets?');
    expect(capturedReviewParams?.detailLines?.map((l: string) => l.replace(/\x1b\[[0-9;]*m/g, ''))).toEqual(['alpha → Cursor (local)']);
  });
});
