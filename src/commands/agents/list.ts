import { listCentralAgentItems } from '../../core/agent-store.js';
import { loadRegistry } from '../../core/registry.js';
import { ANSI } from '../../util/ansi.js';
import { formatRelativeTime, formatSourceShort } from '../../util/skill-meta.js';
import { readAgentDescription } from '../../util/agent-meta.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdAgentsList(_positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const agents = await listCentralAgentItems();
  if (agents.length === 0) {
    process.stdout.write('(no agents installed)\n');
    return 0;
  }

  const registry = await loadRegistry();
  const verbose = flags.verbose === true || flags.v === true;

  for (const item of agents) {
    const name = item.name;
    const record = registry.agents?.[name];
    const agentPath = item.path;

    let line = `${ANSI.cyan}${name}${ANSI.reset}`;
    const sourceLabel = formatSourceShort(record?.source);
    if (sourceLabel) line += ` ${ANSI.dim}(${sourceLabel})${ANSI.reset}`;

    const time = formatRelativeTime(record?.updatedAt ?? record?.addedAt);
    if (time) line += ` ${ANSI.yellow}${time}${ANSI.reset}`;

    process.stdout.write(line + '\n');

    if (verbose) {
      const desc = await readAgentDescription(agentPath);
      if (desc) process.stdout.write(`  ${ANSI.dim}${desc}${ANSI.reset}\n`);
    }
  }

  process.stdout.write(`\n${ANSI.dim}${agents.length} agent(s)${ANSI.reset}\n`);
  return 0;
}
