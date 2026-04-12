import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let capturedPromptParams: Record<string, unknown> | null = null;
const originalStdinIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const originalStdoutIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');

mock.module('../src/util/prompt.js', () => ({
  promptMultiSelect: async (params: Record<string, unknown>) => {
    capturedPromptParams = params;
    const options = (params.options as Array<{ value: string }>) ?? [];
    return options.map((option) => option.value);
  },
  promptChoice: async () => 's',
  promptConfirm: async () => false,
  promptReviewConfirm: async () => false,
  promptSelect: async () => 'no',
}));

let tmpHomeDir = '';
let tmpApgHome = '';
let tmpProjectRoot = '';
let originalHome: string | undefined;
let originalApgHome: string | undefined;

beforeEach(async () => {
  capturedPromptParams = null;
  tmpHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-collect-preview-home-'));
  tmpApgHome = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-collect-preview-apg-'));
  tmpProjectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-collect-preview-project-'));

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

describe('skills collect preview labels', () => {
  it('includes target and scope in interactive collect labels', async () => {
    const sourceSkillDir = path.join(tmpProjectRoot, '.cursor', 'skills', 'alpha');
    await fs.mkdir(sourceSkillDir, { recursive: true });
    await fs.writeFile(path.join(sourceSkillDir, 'SKILL.md'), '# alpha\n', 'utf8');

    const { cmdSkillsCollect } = await import(`../src/commands/skills/collect.js?skills-collect-preview=${Math.random()}`);
    const code = await cmdSkillsCollect([], { target: 'cursor', scope: 'local', cwd: tmpProjectRoot, 'dry-run': true }, { cwd: tmpProjectRoot });

    expect(code).toBe(0);
    const options = capturedPromptParams?.options as Array<{ label: string; value: string }>;
    expect(options).toHaveLength(1);
    expect(options[0]?.label.replace(/\x1b\[[0-9;]*m/g, '')).toBe('alpha -> Cursor (local) [new]');
  });
});
