/**
 * rules rm — 行级移除测试.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cmdRulesRemove } from '../src/commands/rules/rm.js';
import { readCentralGlobalRuleLines, writeCentralGlobalRuleLines } from '../src/core/rule-store.js';
import { normalizeRuleLines, shortHash } from '../src/util/global-rules-store.js';
import { pathExists } from '../src/util/fs-utils.js';

let tmpHomeDir = '';
let tmpApgHome = '';
let tmpProjectRoot = '';
let originalHome: string | undefined;
let originalApgHome: string | undefined;

beforeEach(async () => {
  tmpHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-rules-rm-home-'));
  tmpApgHome = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-rules-rm-apg-'));
  tmpProjectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-rules-rm-project-'));
  originalHome = process.env.HOME;
  originalApgHome = process.env.APG_HOME;
  process.env.HOME = tmpHomeDir;
  process.env.APG_HOME = tmpApgHome;
});

afterEach(async () => {
  if (originalHome !== undefined) process.env.HOME = originalHome;
  else delete process.env.HOME;

  if (originalApgHome !== undefined) process.env.APG_HOME = originalApgHome;
  else delete process.env.APG_HOME;

  await fs.rm(tmpHomeDir, { recursive: true, force: true });
  await fs.rm(tmpApgHome, { recursive: true, force: true });
  await fs.rm(tmpProjectRoot, { recursive: true, force: true });
});

const ctx = { cwd: process.cwd() };

describe('rules rm (line-level central)', () => {
  it('removes a line by exact content', async () => {
    await writeCentralGlobalRuleLines(normalizeRuleLines('A\nB\nC'));

    const code = await cmdRulesRemove(['B'], {}, ctx);
    expect(code).toBe(0);

    const lines = await readCentralGlobalRuleLines();
    expect(lines.map((l) => l.content)).toEqual(['A', 'C']);
  });

  it('removes a line by hash prefix', async () => {
    const all = normalizeRuleLines('Alpha\nBeta\nGamma');
    await writeCentralGlobalRuleLines(all);

    const betaHash = all.find((l) => l.content === 'Beta')!.hash;
    const prefix = shortHash(betaHash);

    const code = await cmdRulesRemove([prefix], {}, ctx);
    expect(code).toBe(0);

    const lines = await readCentralGlobalRuleLines();
    expect(lines.map((l) => l.content)).toEqual(['Alpha', 'Gamma']);
  });

  it('reports not found for unmatched args', async () => {
    await writeCentralGlobalRuleLines(normalizeRuleLines('A'));

    const code = await cmdRulesRemove(['NONEXISTENT'], {}, ctx);
    expect(code).toBe(1);

    const lines = await readCentralGlobalRuleLines();
    expect(lines.map((l) => l.content)).toEqual(['A']);
  });

  it('removes multiple lines in one call', async () => {
    await writeCentralGlobalRuleLines(normalizeRuleLines('A\nB\nC\nD'));

    const code = await cmdRulesRemove(['A', 'C'], {}, ctx);
    expect(code).toBe(0);

    const lines = await readCentralGlobalRuleLines();
    expect(lines.map((l) => l.content)).toEqual(['B', 'D']);
  });
});

describe('rules rm (file-based, preserved)', () => {
  it('removes a file from central rules directory', async () => {
    const rulesDir = path.join(tmpApgHome, 'rules');
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(path.join(rulesDir, 'demo.md'), '# demo\n');

    const code = await cmdRulesRemove(['demo.md'], {}, ctx);
    expect(code).toBe(0);
    expect(await pathExists(path.join(rulesDir, 'demo.md'))).toBe(false);
  });
});

describe('rules rm (target local file-based)', () => {
  it('removes a local rule file from target', async () => {
    const targetRulePath = path.join(tmpProjectRoot, '.cursor', 'rules', 'demo.mdc');
    await fs.mkdir(path.dirname(targetRulePath), { recursive: true });
    await fs.writeFile(targetRulePath, '# demo\n', 'utf-8');

    const code = await cmdRulesRemove(
      ['demo.mdc'],
      { target: 'cursor', scope: 'local', cwd: tmpProjectRoot },
      ctx,
    );
    expect(code).toBe(0);
    expect(await pathExists(targetRulePath)).toBe(false);
  });
});

describe('rules rm (target global line-level)', () => {
  it('removes a line from target global rules by content', async () => {
    const cursorFile = path.join(tmpHomeDir, 'cursor-rules.txt');
    process.env.AP_CURSOR_USER_RULES_FILE = cursorFile;
    await fs.writeFile(cursorFile, 'A\nB\nC\n');

    try {
      const code = await cmdRulesRemove(
        ['B'],
        { target: 'cursor' },
        ctx,
      );
      expect(code).toBe(0);

      const content = await fs.readFile(cursorFile, 'utf-8');
      const lines = normalizeRuleLines(content);
      expect(lines.map((l) => l.content)).toEqual(['A', 'C']);
    } finally {
      delete process.env.AP_CURSOR_USER_RULES_FILE;
    }
  });
});
