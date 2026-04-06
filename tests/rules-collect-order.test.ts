import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let capturedPromptParams: Record<string, unknown> | null = null;
const originalStdinIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');

mock.module('../src/util/prompt.js', () => ({
  promptMultiSelect: async (params: Record<string, unknown>) => {
    capturedPromptParams = params;
    const defaultSelected = params.defaultSelected;
    if (Array.isArray(defaultSelected)) return defaultSelected;
    return [];
  },
  promptSelect: async () => {
    throw new Error('promptSelect should not be called in this test');
  },
}));

const { cmdRulesCollect } = await import('../src/commands/rules/collect.js');
const { writeCentralGlobalRuleItems } = await import('../src/core/rule-store.js');
const { dedupeAndSortItems, toRuleItem } = await import('../src/util/global-rules-store.js');
const { orderMultiSelectOptions } = await import('../src/ui/multi-select.js');

let tmpHome = '';
let tmpApg = '';
let cursorFile = '';
let origHome: string | undefined;
let origApg: string | undefined;
let origCursorFile: string | undefined;

beforeEach(async () => {
  capturedPromptParams = null;
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-rules-collect-order-home-'));
  tmpApg = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-rules-collect-order-apg-'));
  cursorFile = path.join(tmpHome, 'cursor-rules.txt');

  origHome = process.env.HOME;
  origApg = process.env.APG_HOME;
  origCursorFile = process.env.AP_CURSOR_USER_RULES_FILE;

  process.env.HOME = tmpHome;
  process.env.APG_HOME = tmpApg;
  process.env.AP_CURSOR_USER_RULES_FILE = cursorFile;
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
});

afterEach(async () => {
  if (originalStdinIsTTY) Object.defineProperty(process.stdin, 'isTTY', originalStdinIsTTY);
  else delete (process.stdin as { isTTY?: boolean }).isTTY;

  process.env.HOME = origHome ?? '';
  process.env.APG_HOME = origApg ?? '';
  if (origCursorFile !== undefined) process.env.AP_CURSOR_USER_RULES_FILE = origCursorFile;
  else delete process.env.AP_CURSOR_USER_RULES_FILE;

  await fs.rm(tmpHome, { recursive: true, force: true });
  await fs.rm(tmpApg, { recursive: true, force: true });
});

describe('rules collect prompt ordering', () => {
  it('passes sortDefaultSelectedToTop so default-selected rules render first', async () => {
    await writeCentralGlobalRuleItems(dedupeAndSortItems([toRuleItem('Alpha')]));
    await fs.writeFile(cursorFile, 'Alpha\n\nBeta\n', 'utf-8');

    const code = await cmdRulesCollect([], { target: 'cursor', 'dry-run': true }, { cwd: process.cwd() });
    expect(code).toBe(0);

    expect(capturedPromptParams).toBeTruthy();
    expect(capturedPromptParams?.sortDefaultSelectedToTop).toBe(true);

    const options = capturedPromptParams?.options as Array<{ label: string; value: string }>;
    const defaultSelected = capturedPromptParams?.defaultSelected as string[];
    const ordered = orderMultiSelectOptions(options, defaultSelected, true);

    expect(defaultSelected.length).toBeGreaterThan(0);
    expect(defaultSelected).toContain(ordered[0]?.value);
  });
});
