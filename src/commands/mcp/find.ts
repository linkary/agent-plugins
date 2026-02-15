import { listCentralMcpServers, readCentralMcpServer } from '../../core/mcp-store.js';
import { ANSI } from '../../util/ansi.js';
import { getBooleanFlag, getPositiveIntFlag } from '../../util/flag-utils.js';
import { searchRemoteForGroup } from '../../util/remote-find.js';
import type { McpServerDef } from '../../core/mcp-types.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

function formatMcpShort(def: McpServerDef): string {
  if (def.command) {
    const args = def.args?.join(' ') ?? '';
    return `${def.command} ${args}`.trim();
  }
  if (def.url) return def.url;
  return def.type ?? 'unknown';
}

export async function cmdMcpFind(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const query = positionals.join(' ').trim();
  const needle = query.toLowerCase();
  const verbose = flags.verbose === true || flags.v === true;
  const offline = getBooleanFlag(flags, 'offline');
  const limit = getPositiveIntFlag(flags, 'limit', 8, { min: 1, max: 20 });

  const servers = await listCentralMcpServers();
  let localMatched = 0;
  for (const name of servers) {
    const def = await readCentralMcpServer(name);
    if (!def) continue;
    const summary = formatMcpShort(def);
    const haystack = `${name}\n${summary}`.toLowerCase();
    if (needle && !haystack.includes(needle)) continue;

    localMatched++;
    process.stdout.write(`${ANSI.cyan}${name}${ANSI.reset}\n`);
    if (verbose) process.stdout.write(`  ${ANSI.dim}${summary}${ANSI.reset}\n`);
  }

  if (!needle) {
    if (servers.length === 0) {
      process.stdout.write('(no MCP servers installed)\n');
      return 0;
    }
    process.stdout.write(`\n${ANSI.dim}${localMatched} local match(es)${ANSI.reset}\n`);
    return 0;
  }

  const remote = offline ? { results: [], error: undefined } : await searchRemoteForGroup('mcp', query, { limit });

  if (remote.results.length > 0) {
    if (localMatched > 0) process.stdout.write('\n');
    process.stdout.write(`${ANSI.bold}Remote results${ANSI.reset}\n`);
    for (const item of remote.results) {
      process.stdout.write(`${ANSI.magenta}${item.name}${ANSI.reset}`);
      if (item.badge) process.stdout.write(` ${ANSI.yellow}${item.badge}${ANSI.reset}`);
      process.stdout.write('\n');
      if (item.source) process.stdout.write(`  ${ANSI.dim}source:${ANSI.reset} ${item.source}\n`);
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
