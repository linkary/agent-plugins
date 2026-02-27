import { listCentralRules, getCentralRulePath } from '../../core/rule-store.js';
import { loadRegistry } from '../../core/registry.js';
import { ANSI } from '../../util/ansi.js';
import { formatRelativeTime, formatSourceShort } from '../../util/skill-meta.js';
import { readCommandDescription } from '../../util/command-meta.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdRulesList(_positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const rules = await listCentralRules();
  if (rules.length === 0) {
    process.stdout.write('(no rules installed)\n');
    return 0;
  }

  const registry = await loadRegistry();
  const verbose = flags.verbose === true || flags.v === true;

  for (const name of rules) {
    const record = registry.rules?.[name];

    let line = `${ANSI.cyan}${name}${ANSI.reset}`;
    const sourceLabel = formatSourceShort(record?.source);
    if (sourceLabel) line += ` ${ANSI.dim}(${sourceLabel})${ANSI.reset}`;

    const time = formatRelativeTime(record?.updatedAt ?? record?.addedAt);
    if (time) line += ` ${ANSI.yellow}${time}${ANSI.reset}`;

    process.stdout.write(line + '\n');

    if (verbose) {
      const desc = await readCommandDescription(getCentralRulePath(name));
      if (desc) process.stdout.write(`  ${ANSI.dim}${desc}${ANSI.reset}\n`);
    }
  }

  process.stdout.write(`\n${ANSI.dim}${rules.length} rule(s)${ANSI.reset}\n`);
  return 0;
}
