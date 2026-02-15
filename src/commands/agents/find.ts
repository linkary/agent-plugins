import { listCentralAgents, getCentralAgentPath } from '../../core/agent-store.js';
import { ANSI } from '../../util/ansi.js';
import { getBooleanFlag, getPositiveIntFlag } from '../../util/flag-utils.js';
import { searchRemoteForGroup } from '../../util/remote-find.js';
import { readAgentDescription } from '../../util/agent-meta.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdAgentsFind(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const query = positionals.join(' ').trim();
  const needle = query.toLowerCase();
  const verbose = flags.verbose === true || flags.v === true;
  const offline = getBooleanFlag(flags, 'offline');
  const limit = getPositiveIntFlag(flags, 'limit', 8, { min: 1, max: 20 });

  const agents = await listCentralAgents();
  let localMatched = 0;
  for (const name of agents) {
    const desc = await readAgentDescription(getCentralAgentPath(name));
    const haystack = `${name}\n${desc ?? ''}`.toLowerCase();
    if (needle && !haystack.includes(needle)) continue;

    localMatched++;
    process.stdout.write(`${ANSI.cyan}${name}${ANSI.reset}\n`);
    if (verbose && desc) process.stdout.write(`  ${ANSI.dim}${desc}${ANSI.reset}\n`);
  }

  if (!needle) {
    if (agents.length === 0) {
      process.stdout.write('(no agents installed)\n');
      return 0;
    }
    process.stdout.write(`\n${ANSI.dim}${localMatched} local match(es)${ANSI.reset}\n`);
    return 0;
  }

  const remote = offline ? { results: [], error: undefined } : await searchRemoteForGroup('agents', query, { limit });

  if (remote.results.length > 0) {
    if (localMatched > 0) process.stdout.write('\n');
    process.stdout.write(`${ANSI.bold}Remote results${ANSI.reset}\n`);
    for (const item of remote.results) {
      process.stdout.write(`${ANSI.magenta}${item.name}${ANSI.reset}`);
      if (item.badge) process.stdout.write(` ${ANSI.yellow}${item.badge}${ANSI.reset}`);
      process.stdout.write('\n');
      if (item.source) process.stdout.write(`  ${ANSI.dim}source:${ANSI.reset} ${item.source}\n`);
      if (item.addHint) process.stdout.write(`  ${ANSI.dim}add:${ANSI.reset} ${item.addHint}\n`);
      if (item.url) process.stdout.write(`  ${ANSI.dim}url:${ANSI.reset} ${item.url}\n`);
      if (verbose && item.description) process.stdout.write(`  ${ANSI.dim}${item.description}${ANSI.reset}\n`);
    }
  }

  const total = localMatched + remote.results.length;
  if (total === 0) {
    process.stdout.write(`No matches for "${query}".\n`);
  }
  if (verbose && remote.error) {
    process.stdout.write(`${ANSI.dim}remote search unavailable: ${remote.error}${ANSI.reset}\n`);
  }

  const summary: string[] = [];
  if (localMatched > 0) summary.push(`${localMatched} local`);
  if (remote.results.length > 0) summary.push(`${remote.results.length} remote`);
  if (summary.length > 0) {
    process.stdout.write(`\n${ANSI.dim}${summary.join(', ')} match(es)${ANSI.reset}\n`);
  }
  return 0;
}
