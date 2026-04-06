import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cmdRulesSync } from '../src/commands/rules/sync.js';
import { writeCentralGlobalRuleItems } from '../src/core/rule-store.js';
import { dedupeAndSortItems, toRuleItem } from '../src/util/global-rules-store.js';
import { pathExists } from '../src/util/fs-utils.js';

let tmpHomeDir = '';
let tmpApgHome = '';
let tmpProjectRoot = '';
let originalHome: string | undefined;
let originalApgHome: string | undefined;

beforeEach(async () => {
  tmpHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-rules-sync-qoder-home-'));
  tmpApgHome = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-rules-sync-qoder-apg-'));
  tmpProjectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-rules-sync-qoder-project-'));

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

describe('rules sync qoder', () => {
  it('defaults qoder rules sync to local scope and writes a managed markdown rule file', async () => {
    await writeCentralGlobalRuleItems(
      dedupeAndSortItems([
        toRuleItem('Use pnpm for package management'),
        toRuleItem('Testing:\n- Add regression coverage\n- Keep tests deterministic'),
      ]),
    );

    const code = await cmdRulesSync([], { target: 'qoder' }, { cwd: tmpProjectRoot });
    expect(code).toBe(0);

    const targetPath = path.join(tmpProjectRoot, '.qoder', 'rules', 'agent-plugins-global.md');
    expect(await pathExists(targetPath)).toBe(true);
    expect(await pathExists(path.join(tmpProjectRoot, '.qoder', 'rules', '.agent-plugins-global.json'))).toBe(true);

    const content = await fs.readFile(targetPath, 'utf-8');
    expect(content).toContain('description: Synced from agent-plugins central global rules');
    expect(content).toContain('alwaysApply: true');
    expect(content).toContain('# Project Rules');
    expect(content).toContain('## Rule 1');
    expect(content).toContain('Use pnpm for package management');
    expect(content).toContain('Testing:\n- Add regression coverage\n- Keep tests deterministic');
  });

  it('shows preview counts against existing qoder managed items and syncs additively', async () => {
    await writeCentralGlobalRuleItems(
      dedupeAndSortItems([
        toRuleItem('Rule A'),
        toRuleItem('Rule B'),
      ]),
    );

    const rulesDir = path.join(tmpProjectRoot, '.qoder', 'rules');
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(
      path.join(rulesDir, '.agent-plugins-global.json'),
      JSON.stringify({ version: 1, items: [toRuleItem('Rule A')] }, null, 2) + '\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(rulesDir, 'agent-plugins-global.md'),
      '---\ndescription: Synced from agent-plugins central global rules\nalwaysApply: true\n---\n\n# Project Rules\n\n## Rule 1\n\nRule A\n',
      'utf-8',
    );

    let output = '';
    const originalWrite = process.stdout.write.bind(process.stdout);
    const writeSpy = ((chunk: string | Uint8Array) => {
      output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
      return true;
    }) as typeof process.stdout.write;
    process.stdout.write = writeSpy;

    try {
      const code = await cmdRulesSync([], { target: 'qoder', force: true }, { cwd: tmpProjectRoot });
      expect(code).toBe(0);
    } finally {
      process.stdout.write = originalWrite;
    }

    expect(output).toContain('Preview: ');
    expect(output).toContain('1 new');
    expect(output).toContain('1 identical');

    const content = await fs.readFile(path.join(rulesDir, 'agent-plugins-global.md'), 'utf-8');
    expect(content).toContain('Rule A');
    expect(content).toContain('Rule B');
  });
});
