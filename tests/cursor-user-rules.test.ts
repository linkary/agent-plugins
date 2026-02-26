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
import { toRuleItem, dedupeAndSortItems } from '../src/util/global-rules-store.js';

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
  it('returns empty items when file does not exist', async () => {
    const { items, apiToken } = await readCursorUserRules(os.homedir());
    expect(items).toEqual([]);
    expect(apiToken).toBeNull();
  });

  it('returns parsed items when file exists (paragraph-based)', async () => {
    await fs.writeFile(overrideFile, 'Rule A\n\nRule B\n');
    const { items, apiToken } = await readCursorUserRules(os.homedir());
    expect(items.map((i) => i.content).sort()).toEqual(['Rule A', 'Rule B']);
    expect(apiToken).toBeNull();
  });

  it('preserves multi-line rules as single items', async () => {
    await fs.writeFile(overrideFile, 'Prefer FP:\n- Pure functions\n\nUse quotes\n');
    const { items } = await readCursorUserRules(os.homedir());
    expect(items).toHaveLength(2);
    const fp = items.find((i) => i.content.includes('Prefer FP'));
    expect(fp).toBeDefined();
    expect(fp!.content).toBe('Prefer FP:\n- Pure functions');
  });
});

describe('writeCursorUserRules (file override)', () => {
  it('writes items joined by double newline with trailing newline', async () => {
    const items = dedupeAndSortItems([toRuleItem('Line 1'), toRuleItem('Line 2')]);
    await writeCursorUserRules(os.homedir(), items, null);
    const content = await fs.readFile(overrideFile, 'utf-8');
    expect(content).toContain('Line 1');
    expect(content).toContain('Line 2');
    expect(content).toContain('\n\n');
    expect(content.endsWith('\n')).toBe(true);
  });

  it('writes empty string for empty items array', async () => {
    await writeCursorUserRules(os.homedir(), [], null);
    const content = await fs.readFile(overrideFile, 'utf-8');
    expect(content).toBe('');
  });

  it('creates parent directory if needed', async () => {
    const nestedFile = path.join(tmpDir, 'sub', 'dir', 'rules.txt');
    process.env.AP_CURSOR_USER_RULES_FILE = nestedFile;

    const items = [toRuleItem('Rule X')];
    await writeCursorUserRules(os.homedir(), items, null);
    const content = await fs.readFile(nestedFile, 'utf-8');
    expect(content).toContain('Rule X');
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
