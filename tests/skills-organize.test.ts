import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cmdSkillsOrganize } from '../src/commands/skills/organize.js';

let tmpHomeDir = '';
let tmpProjectRoot = '';
let originalHome: string | undefined;
let capturedStdout = '';
let capturedStderr = '';
let originalStdoutWrite: typeof process.stdout.write;
let originalStderrWrite: typeof process.stderr.write;

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

async function writeSkill(dirPath: string, content: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(path.join(dirPath, 'SKILL.md'), content, 'utf8');
}

beforeEach(async () => {
  tmpHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-organize-home-'));
  tmpProjectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-skills-organize-project-'));
  originalHome = process.env.HOME;
  process.env.HOME = tmpHomeDir;

  capturedStdout = '';
  capturedStderr = '';
  originalStdoutWrite = process.stdout.write.bind(process.stdout);
  originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    capturedStdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    capturedStderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stderr.write;
});

afterEach(async () => {
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
  if (originalHome !== undefined) process.env.HOME = originalHome;
  else delete process.env.HOME;
  await fs.rm(tmpHomeDir, { recursive: true, force: true });
  await fs.rm(tmpProjectRoot, { recursive: true, force: true });
});

describe('skills organize', () => {
  it('keeps dry-run non-mutating while previewing shared cleanup', async () => {
    await writeSkill(path.join(tmpProjectRoot, '.agents', 'skills', 'reviewer'), '# shared');
    await writeSkill(path.join(tmpProjectRoot, '.gemini', 'skills', 'reviewer'), '# shared');

    const code = await cmdSkillsOrganize(
      [],
      { target: 'agents,gemini', scope: 'local', 'dry-run': true },
      { cwd: tmpProjectRoot },
    );

    expect(code).toBe(0);
    expect(await fs.access(path.join(tmpProjectRoot, '.agents', 'skills', 'reviewer')).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.access(path.join(tmpProjectRoot, '.gemini', 'skills', 'reviewer')).then(() => true).catch(() => false)).toBe(true);
    expect(stripAnsi(capturedStdout)).toContain('remove redundant copy');
  });

  it('removes the redundant Gemini copy while keeping the shared .agents destination', async () => {
    await writeSkill(path.join(tmpProjectRoot, '.agents', 'skills', 'reviewer'), '# shared');
    await writeSkill(path.join(tmpProjectRoot, '.gemini', 'skills', 'reviewer'), '# shared');

    const code = await cmdSkillsOrganize(
      [],
      { target: 'agents,gemini', scope: 'local', force: true },
      { cwd: tmpProjectRoot },
    );

    expect(code).toBe(0);
    expect(await fs.access(path.join(tmpProjectRoot, '.agents', 'skills', 'reviewer')).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.access(path.join(tmpProjectRoot, '.gemini', 'skills', 'reviewer')).then(() => true).catch(() => false)).toBe(false);
  });

  it('can promote a Gemini-compatible duplicate into .agents while leaving non-shared targets alone', async () => {
    await writeSkill(path.join(tmpProjectRoot, '.gemini', 'skills', 'reviewer'), '# shared');
    await writeSkill(path.join(tmpProjectRoot, '.cursor', 'skills', 'reviewer'), '# shared');

    const code = await cmdSkillsOrganize(
      [],
      { target: 'agents,gemini,cursor', scope: 'local', force: true },
      { cwd: tmpProjectRoot },
    );

    expect(code).toBe(0);
    expect(await fs.access(path.join(tmpProjectRoot, '.agents', 'skills', 'reviewer')).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.access(path.join(tmpProjectRoot, '.gemini', 'skills', 'reviewer')).then(() => true).catch(() => false)).toBe(false);
    expect(await fs.access(path.join(tmpProjectRoot, '.cursor', 'skills', 'reviewer')).then(() => true).catch(() => false)).toBe(true);
  });

  it('reports non-shared duplicates without removing them', async () => {
    await writeSkill(path.join(tmpProjectRoot, '.cursor', 'skills', 'reviewer'), '# shared');
    await writeSkill(path.join(tmpProjectRoot, '.codex', 'skills', 'reviewer'), '# shared');
    await writeSkill(path.join(tmpProjectRoot, '.claude', 'skills', 'reviewer'), '# shared');

    const code = await cmdSkillsOrganize(
      [],
      { target: 'cursor,codex,claude-code', scope: 'local', force: true },
      { cwd: tmpProjectRoot },
    );

    expect(code).toBe(0);
    expect(stripAnsi(capturedStdout)).toContain('No safe skills mutations are available');
    expect(await fs.access(path.join(tmpProjectRoot, '.cursor', 'skills', 'reviewer')).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.access(path.join(tmpProjectRoot, '.codex', 'skills', 'reviewer')).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.access(path.join(tmpProjectRoot, '.claude', 'skills', 'reviewer')).then(() => true).catch(() => false)).toBe(true);
    expect(capturedStderr).toBe('');
  });
});
