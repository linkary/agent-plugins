/**
 * rules collect — item 级 additive merge 测试.
 *
 * 使用 AP_CURSOR_USER_RULES_FILE 和单文件 store 模拟目标.
 */
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { cmdRulesCollect } from '../src/commands/rules/collect.js';
import { readCentralGlobalRuleItems, writeCentralGlobalRuleItems } from '../src/core/rule-store.js';
import { toRuleItem, dedupeAndSortItems } from '../src/util/global-rules-store.js';

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
const mkItems = (contents: string[]) => dedupeAndSortItems(contents.map(toRuleItem));

describe('rules collect (item-level)', () => {
  it('collects items from a single target into empty central', async () => {
    // 段落分隔: B 和 C 和 A 各为一个 item
    await fs.writeFile(cursorFile, 'B\n\nC\n\nA\n');

    const code = await cmdRulesCollect([], { target: 'cursor', force: true }, ctx);
    expect(code).toBe(0);

    const items = await readCentralGlobalRuleItems();
    expect(items.map((i) => i.content).sort()).toEqual(['A', 'B', 'C']);
  });

  it('additive merge: new items are added, existing preserved', async () => {
    await writeCentralGlobalRuleItems(mkItems(['A', 'B', 'C']));

    // Cursor 有 B, C, D (段落分隔)
    await fs.writeFile(cursorFile, 'B\n\nC\n\nD\n');

    const code = await cmdRulesCollect([], { target: 'cursor', force: true }, ctx);
    expect(code).toBe(0);

    const items = await readCentralGlobalRuleItems();
    expect(items.map((i) => i.content).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('sequential collects are additive (simulates multi-target)', async () => {
    await fs.writeFile(cursorFile, 'B\n\nC\n\nD\n');
    await writeCentralGlobalRuleItems(mkItems(['A', 'B', 'C']));
    await cmdRulesCollect([], { target: 'cursor', force: true }, ctx);

    let items = await readCentralGlobalRuleItems();
    expect(items.map((i) => i.content).sort()).toEqual(['A', 'B', 'C', 'D']);

    await fs.writeFile(cursorFile, 'D\n\nE\n\nF\n');
    await cmdRulesCollect([], { target: 'cursor', force: true }, ctx);

    items = await readCentralGlobalRuleItems();
    expect(items.map((i) => i.content).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('returns 0 with no new items and does not rewrite file', async () => {
    await writeCentralGlobalRuleItems(mkItems(['A', 'B']));
    await fs.writeFile(cursorFile, 'A\n\nB\n');

    const code = await cmdRulesCollect([], { target: 'cursor', force: true }, ctx);
    expect(code).toBe(0);

    const items = await readCentralGlobalRuleItems();
    expect(items.map((i) => i.content).sort()).toEqual(['A', 'B']);
  });

  it('handles empty target gracefully', async () => {
    await fs.writeFile(cursorFile, '');
    const code = await cmdRulesCollect([], { target: 'cursor', force: true }, ctx);
    expect(code).toBe(0);
  });

  it('dry-run does not write', async () => {
    await fs.writeFile(cursorFile, 'X\n');

    const code = await cmdRulesCollect([], { target: 'cursor', 'dry-run': true, force: true }, ctx);
    expect(code).toBe(0);

    const items = await readCentralGlobalRuleItems();
    expect(items).toEqual([]);
  });

  it('preserves multi-line rules from target', async () => {
    // 两个 item: 一个多行, 一个单行, 段落分隔
    await fs.writeFile(cursorFile, 'Prefer FP:\n- Pure functions\n- Immutability\n\nUse single quotes\n');

    const code = await cmdRulesCollect([], { target: 'cursor', force: true }, ctx);
    expect(code).toBe(0);

    const items = await readCentralGlobalRuleItems();
    expect(items).toHaveLength(2);
    const fp = items.find((i) => i.content.includes('Prefer FP'));
    expect(fp).toBeDefined();
    expect(fp!.content).toBe('Prefer FP:\n- Pure functions\n- Immutability');
  });
});
