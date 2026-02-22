import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cmdRulesCollect } from '../src/commands/rules/collect.js';
import { cmdRulesRemove } from '../src/commands/rules/rm.js';
import { cmdRulesSync } from '../src/commands/rules/sync.js';
import { renderCursorUserRulesText } from '../src/util/cursor-user-rules.js';

let tmpRoot = '';
let tmpHome = '';
let tmpApgHome = '';
let tmpProjectRoot = '';
let tmpCursorUserRulesFile = '';
let originalHome: string | undefined;
let originalApgHome: string | undefined;
let originalCursorUserRulesFile: string | undefined;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-rules-cursor-user-rules-'));
  tmpHome = path.join(tmpRoot, 'home');
  tmpApgHome = path.join(tmpRoot, 'apg-home');
  tmpProjectRoot = path.join(tmpRoot, 'project');
  tmpCursorUserRulesFile = path.join(tmpRoot, 'cursor-user-rules.txt');
  await fs.mkdir(tmpHome, { recursive: true });
  await fs.mkdir(tmpApgHome, { recursive: true });
  await fs.mkdir(tmpProjectRoot, { recursive: true });

  originalHome = process.env.HOME;
  originalApgHome = process.env.APG_HOME;
  originalCursorUserRulesFile = process.env.AP_CURSOR_USER_RULES_FILE;
  process.env.HOME = tmpHome;
  process.env.APG_HOME = tmpApgHome;
  process.env.AP_CURSOR_USER_RULES_FILE = tmpCursorUserRulesFile;
});

afterEach(async () => {
  if (originalHome !== undefined) process.env.HOME = originalHome;
  else delete process.env.HOME;

  if (originalApgHome !== undefined) process.env.APG_HOME = originalApgHome;
  else delete process.env.APG_HOME;

  if (originalCursorUserRulesFile !== undefined) process.env.AP_CURSOR_USER_RULES_FILE = originalCursorUserRulesFile;
  else delete process.env.AP_CURSOR_USER_RULES_FILE;

  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('rules with cursor user rules storage', () => {
  it('syncs central rules into cursor user rules for global cursor target', async () => {
    const centralRulePath = path.join(tmpApgHome, 'rules', 'coding', 'basic.mdc');
    await fs.mkdir(path.dirname(centralRulePath), { recursive: true });
    await fs.writeFile(
      centralRulePath,
      `---
description: Basic rule
---
# Basic
Keep responses concise.
`,
      'utf-8',
    );

    const code = await cmdRulesSync(
      ['coding/basic.mdc'],
      { target: 'cursor', scope: 'global' },
      { cwd: tmpProjectRoot },
    );
    expect(code).toBe(0);

    const stored = await fs.readFile(tmpCursorUserRulesFile, 'utf-8');
    expect(stored).toContain('ap-rule:start id="coding/basic"');
    expect(stored).toContain('ap_id: coding/basic');
  });

  it('collects managed cursor user rules into central store', async () => {
    const sourceText = renderCursorUserRulesText(
      '',
      new Map([
        [
          'coding/basic',
          `---
ap_id: coding/basic
description: Basic rule
---
# Basic
Keep responses concise.
`,
        ],
      ]),
    );
    await fs.writeFile(tmpCursorUserRulesFile, sourceText, 'utf-8');

    const code = await cmdRulesCollect([], { target: 'cursor', scope: 'global' }, { cwd: tmpProjectRoot });
    expect(code).toBe(0);

    const collectedPath = path.join(tmpApgHome, 'rules', 'coding', 'basic.md');
    const collected = await fs.readFile(collectedPath, 'utf-8');
    expect(collected).toContain('ap_id: coding/basic');
    expect(collected).toContain('# Basic');
  });

  it('removes managed cursor user rule blocks via target rm', async () => {
    const sourceText = renderCursorUserRulesText(
      '',
      new Map([
        ['coding/basic', '# Basic\nKeep responses concise.\n'],
        ['frontend/react', '# React\nPrefer hooks.\n'],
      ]),
    );
    await fs.writeFile(tmpCursorUserRulesFile, sourceText, 'utf-8');

    const code = await cmdRulesRemove(
      ['coding/basic.md'],
      { target: 'cursor', scope: 'global' },
      { cwd: tmpProjectRoot },
    );
    expect(code).toBe(0);

    const stored = await fs.readFile(tmpCursorUserRulesFile, 'utf-8');
    expect(stored).not.toContain('ap-rule:start id="coding/basic"');
    expect(stored).toContain('ap-rule:start id="frontend/react"');
  });
});
