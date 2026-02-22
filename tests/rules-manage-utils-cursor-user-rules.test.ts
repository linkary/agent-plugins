import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findSyncedRuleCopies } from '../src/commands/rules/manage-utils.js';
import type { ConfigV1 } from '../src/core/config.js';
import { renderCursorUserRulesText } from '../src/util/cursor-user-rules.js';

let tmpRoot = '';
let tmpHome = '';
let tmpCursorUserRulesFile = '';
let originalHome: string | undefined;
let originalCursorUserRulesFile: string | undefined;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-rules-manage-utils-cursor-user-rules-'));
  tmpHome = path.join(tmpRoot, 'home');
  tmpCursorUserRulesFile = path.join(tmpRoot, 'cursor-user-rules.txt');
  await fs.mkdir(tmpHome, { recursive: true });

  originalHome = process.env.HOME;
  originalCursorUserRulesFile = process.env.AP_CURSOR_USER_RULES_FILE;
  process.env.HOME = tmpHome;
  process.env.AP_CURSOR_USER_RULES_FILE = tmpCursorUserRulesFile;
});

afterEach(async () => {
  if (originalHome !== undefined) process.env.HOME = originalHome;
  else delete process.env.HOME;

  if (originalCursorUserRulesFile !== undefined) process.env.AP_CURSOR_USER_RULES_FILE = originalCursorUserRulesFile;
  else delete process.env.AP_CURSOR_USER_RULES_FILE;

  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('rules manage-utils cursor user rules', () => {
  it('detects managed cursor user rules as synced copies', async () => {
    await fs.writeFile(
      tmpCursorUserRulesFile,
      renderCursorUserRulesText('', new Map([['coding/basic', '# Basic\nKeep responses concise.\n']])),
      'utf-8',
    );
    const config: ConfigV1 = {
      version: 1,
      targets: {
        cursor: { defaultScope: 'global', includeRules: ['*'] },
      },
    };

    const copies = await findSyncedRuleCopies({
      ruleNames: ['coding/basic.mdc'],
      config,
      currentCwd: tmpRoot,
    });
    expect(copies.some((copy) => copy.storageType === 'cursor-user-rules' && copy.ruleId === 'coding/basic')).toBe(
      true,
    );
  });
});
