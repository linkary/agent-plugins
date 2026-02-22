import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cmdRulesRemove } from '../src/commands/rules/rm.js';
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

describe('rules rm', () => {
  it('returns success when target removal succeeds without central removal', async () => {
    const targetRulePath = path.join(tmpProjectRoot, '.cursor', 'rules', 'demo.mdc');
    await fs.mkdir(path.dirname(targetRulePath), { recursive: true });
    await fs.writeFile(targetRulePath, '# demo\n', 'utf-8');

    const code = await cmdRulesRemove(
      ['demo.mdc'],
      { target: 'cursor', scope: 'local', cwd: tmpProjectRoot },
      { cwd: process.cwd() },
    );
    expect(code).toBe(0);
    expect(await pathExists(targetRulePath)).toBe(false);
  });
});
