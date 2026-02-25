/**
 * cursor-user-rules.ts 单元测试.
 *
 * 使用 AP_CURSOR_USER_RULES_FILE 覆盖, 避免触及真实 SQLite / API。
 */
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  readCursorUserRules,
  writeCursorUserRules,
  getCursorUserRulesSourceLabel,
} from '../src/util/cursor-user-rules.js';

let tmpDir: string;
let overrideFile: string;
let origCursorFile: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-cursor-rules-'));
  overrideFile = path.join(tmpDir, 'cursor-rules.txt');

  origCursorFile = process.env.AP_CURSOR_USER_RULES_FILE;
  process.env.AP_CURSOR_USER_RULES_FILE = overrideFile;
});

afterEach(async () => {
  if (origCursorFile !== undefined) process.env.AP_CURSOR_USER_RULES_FILE = origCursorFile;
  else delete process.env.AP_CURSOR_USER_RULES_FILE;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('readCursorUserRules (file override)', () => {
  it('returns empty text when file does not exist', async () => {
    const { text, apiToken } = await readCursorUserRules(os.homedir());
    expect(text).toBe('');
    expect(apiToken).toBeNull();
  });

  it('returns file content when file exists', async () => {
    await fs.writeFile(overrideFile, 'Rule A\nRule B\n');
    const { text, apiToken } = await readCursorUserRules(os.homedir());
    expect(text).toBe('Rule A\nRule B\n');
    expect(apiToken).toBeNull();
  });
});

describe('writeCursorUserRules (file override)', () => {
  it('writes lines joined by newline with trailing newline', async () => {
    await writeCursorUserRules(os.homedir(), ['Line 1', 'Line 2'], null);
    const content = await fs.readFile(overrideFile, 'utf-8');
    expect(content).toBe('Line 1\nLine 2\n');
  });

  it('writes empty string for empty lines array', async () => {
    await writeCursorUserRules(os.homedir(), [], null);
    const content = await fs.readFile(overrideFile, 'utf-8');
    expect(content).toBe('');
  });

  it('creates parent directory if needed', async () => {
    const nestedFile = path.join(tmpDir, 'sub', 'dir', 'rules.txt');
    process.env.AP_CURSOR_USER_RULES_FILE = nestedFile;

    await writeCursorUserRules(os.homedir(), ['Rule X'], null);
    const content = await fs.readFile(nestedFile, 'utf-8');
    expect(content).toBe('Rule X\n');
  });
});

describe('getCursorUserRulesSourceLabel', () => {
  it('returns override path when AP_CURSOR_USER_RULES_FILE is set', () => {
    const label = getCursorUserRulesSourceLabel(os.homedir());
    expect(label).toBe(overrideFile);
  });

  it('returns API label when apiAvailable is true (without override)', () => {
    delete process.env.AP_CURSOR_USER_RULES_FILE;
    const label = getCursorUserRulesSourceLabel(os.homedir(), true);
    expect(label).toBe('Cursor Knowledge Base API');
  });

  it('returns SQLite path when apiAvailable is false (without override)', () => {
    delete process.env.AP_CURSOR_USER_RULES_FILE;
    const label = getCursorUserRulesSourceLabel(os.homedir(), false);
    expect(label).toContain('state.vscdb');
    expect(label).toContain('ItemTable');
  });
});
