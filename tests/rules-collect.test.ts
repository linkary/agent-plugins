/**
 * rules collect — 行级 additive merge 测试.
 *
 * 使用 AP_CURSOR_USER_RULES_FILE 和单文件 store 模拟目标.
 */
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { cmdRulesCollect } from '../src/commands/rules/collect.js';
import { readCentralGlobalRuleLines, writeCentralGlobalRuleLines } from '../src/core/rule-store.js';
import { normalizeRuleLines } from '../src/util/global-rules-store.js';

let tmpHome: string;
let tmpApg: string;
let cursorFile: string;
let origHome: string | undefined;
let origApg: string | undefined;
let origCursorFile: string | undefined;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-collect-home-'));
  tmpApg = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-collect-apg-'));

  cursorFile = path.join(tmpHome, 'cursor-rules.txt');

  origHome = process.env.HOME;
  origApg = process.env.APG_HOME;
  origCursorFile = process.env.AP_CURSOR_USER_RULES_FILE;

  process.env.HOME = tmpHome;
  process.env.APG_HOME = tmpApg;
  process.env.AP_CURSOR_USER_RULES_FILE = cursorFile;
});

afterEach(async () => {
  process.env.HOME = origHome ?? '';
  process.env.APG_HOME = origApg ?? '';
  if (origCursorFile !== undefined) process.env.AP_CURSOR_USER_RULES_FILE = origCursorFile;
  else delete process.env.AP_CURSOR_USER_RULES_FILE;

  await fs.rm(tmpHome, { recursive: true, force: true });
  await fs.rm(tmpApg, { recursive: true, force: true });
});

const ctx = { cwd: process.cwd() };

describe('rules collect (line-level)', () => {
  it('collects lines from a single target into empty central', async () => {
    await fs.writeFile(cursorFile, 'B\nC\nA\n');

    const code = await cmdRulesCollect([], { target: 'cursor' }, ctx);
    expect(code).toBe(0);

    const lines = await readCentralGlobalRuleLines();
    expect(lines.map((l) => l.content)).toEqual(['A', 'B', 'C']);
  });

  it('additive merge: new lines are added, existing preserved', async () => {
    // 中心已有 A, B, C
    await writeCentralGlobalRuleLines(normalizeRuleLines('A\nB\nC'));

    // Cursor 有 B, C, D
    await fs.writeFile(cursorFile, 'B\nC\nD\n');

    const code = await cmdRulesCollect([], { target: 'cursor' }, ctx);
    expect(code).toBe(0);

    const lines = await readCentralGlobalRuleLines();
    // A 保留 (不被删除), D 新增
    expect(lines.map((l) => l.content)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('sequential collects are additive (simulates multi-target)', async () => {
    // 第一次 collect: cursor 有 B, C, D
    await fs.writeFile(cursorFile, 'B\nC\nD\n');
    await writeCentralGlobalRuleLines(normalizeRuleLines('A\nB\nC'));
    await cmdRulesCollect([], { target: 'cursor' }, ctx);

    let lines = await readCentralGlobalRuleLines();
    expect(lines.map((l) => l.content)).toEqual(['A', 'B', 'C', 'D']);

    // 第二次 collect: cursor 内容变为 D, E, F
    await fs.writeFile(cursorFile, 'D\nE\nF\n');
    await cmdRulesCollect([], { target: 'cursor' }, ctx);

    lines = await readCentralGlobalRuleLines();
    // 所有行都保留 (additive): A + B + C + D + E + F
    expect(lines.map((l) => l.content)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('returns 0 with no new lines and does not rewrite file', async () => {
    await writeCentralGlobalRuleLines(normalizeRuleLines('A\nB'));
    await fs.writeFile(cursorFile, 'A\nB\n');

    const code = await cmdRulesCollect([], { target: 'cursor' }, ctx);
    expect(code).toBe(0);

    const lines = await readCentralGlobalRuleLines();
    expect(lines.map((l) => l.content)).toEqual(['A', 'B']);
  });

  it('handles empty target gracefully', async () => {
    await fs.writeFile(cursorFile, '');
    const code = await cmdRulesCollect([], { target: 'cursor' }, ctx);
    expect(code).toBe(0);
  });

  it('dry-run does not write', async () => {
    await fs.writeFile(cursorFile, 'X\n');

    const code = await cmdRulesCollect([], { target: 'cursor', 'dry-run': true }, ctx);
    expect(code).toBe(0);

    const lines = await readCentralGlobalRuleLines();
    expect(lines).toEqual([]);
  });
});
