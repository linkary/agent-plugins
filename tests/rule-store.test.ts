import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ensureCentralRuleStore, getCentralRulePath, listCentralRules, readCentralRule } from '../src/core/rule-store.js';

let tmpDir: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-rule-store-'));
  originalEnv = process.env.APG_HOME;
  process.env.APG_HOME = tmpDir;
});

afterEach(async () => {
  if (originalEnv !== undefined) process.env.APG_HOME = originalEnv;
  else delete process.env.APG_HOME;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('rule-store', () => {
  it('should create central rules directory', async () => {
    await ensureCentralRuleStore();
    const stat = await fs.stat(path.join(tmpDir, 'rules'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('should list rules recursively with .md and .mdc', async () => {
    await ensureCentralRuleStore();
    await fs.mkdir(path.join(tmpDir, 'rules', 'coding'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'rules', 'coding', 'basic.mdc'), 'content');
    await fs.writeFile(path.join(tmpDir, 'rules', 'overview.md'), 'content');
    await fs.writeFile(path.join(tmpDir, 'rules', 'ignore.txt'), 'content');

    const rules = await listCentralRules();
    expect(rules).toEqual(['coding/basic.mdc', 'overview.md']);
  });

  it('should read rule content', async () => {
    await ensureCentralRuleStore();
    const full = getCentralRulePath('coding/typed.mdc');
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, '# typed');

    const content = await readCentralRule('coding/typed.mdc');
    expect(content).toBe('# typed');
  });
});
