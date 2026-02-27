import fs from 'node:fs/promises';
import path from 'node:path';
import { computeItemHash } from '../../util/item-utils.js';
import { ANSI } from '../../util/ansi.js';
import { listCentralRules, getCentralRulePath } from '../../core/rule-store.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdRulesValidate(_positionals: string[], _flags: ParsedFlags, _ctx: CliRunContext) {
  const rules = await listCentralRules();
  if (rules.length === 0) {
    process.stdout.write('(no rules installed)\n');
    return 0;
  }

  let issues = 0;
  const byBasename = new Map<string, { rule: string; hash: string }[]>();

  for (const rule of rules) {
    const fullPath = getCentralRulePath(rule);
    const stat = await fs.stat(fullPath);
    if (stat.size === 0) {
      issues++;
      process.stdout.write(`${ANSI.red}[empty]${ANSI.reset} ${rule}\n`);
    }

    const hash = await computeItemHash(fullPath);
    const base = path.basename(rule).toLowerCase();
    const list = byBasename.get(base) ?? [];
    list.push({ rule, hash });
    byBasename.set(base, list);
  }

  for (const [base, items] of byBasename.entries()) {
    if (items.length < 2) continue;
    const uniqueHashes = new Set(items.map((item) => item.hash));
    if (uniqueHashes.size > 1) {
      issues++;
      process.stdout.write(`${ANSI.yellow}[conflict]${ANSI.reset} ${base}\n`);
      for (const item of items) process.stdout.write(`  - ${item.rule}\n`);
    }
  }

  if (issues === 0) {
    process.stdout.write(`${ANSI.green}Rules validation passed.${ANSI.reset}\n`);
    return 0;
  }

  process.stderr.write(`${issues} issue(s) found in rules.\n`);
  return 1;
}
