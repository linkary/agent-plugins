import fs from 'node:fs/promises';
import { listCentralRules, getCentralRulePath } from '../../core/rule-store.js';
import { ANSI } from '../../util/ansi.js';
import { getBooleanFlag, getPositiveIntFlag } from '../../util/flag-utils.js';
import { searchRemoteForGroup } from '../../util/remote-find.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdRulesFind(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const query = positionals.join(' ').trim();
  const needle = query.toLowerCase();
  const verbose = flags.verbose === true || flags.v === true;
  const offline = getBooleanFlag(flags, 'offline');
  const limit = getPositiveIntFlag(flags, 'limit', 8, { min: 1, max: 20 });
  const remotePromise =
    needle && !offline
      ? searchRemoteForGroup('rules', query, { limit })
      : Promise.resolve({ results: [], error: undefined } as const);

  const rules = await listCentralRules();
  const localRows = await Promise.all(
    rules.map(async (name) => {
      let excerpt = '';
      try {
        const content = await fs.readFile(getCentralRulePath(name), 'utf-8');
        excerpt = content.slice(0, 2000);
      } catch {
        // ignore
      }
      const haystack = `${name}\n${excerpt}`.toLowerCase();
      return { name, excerpt, haystack };
    }),
  );

  let localMatched = 0;
  for (const row of localRows) {
    if (needle && !row.haystack.includes(needle)) continue;
    localMatched++;
    process.stdout.write(`${ANSI.cyan}${row.name}${ANSI.reset}\n`);
    if (verbose && row.excerpt) {
      const firstLine = row.excerpt.split('\n').map((line) => line.trim()).find(Boolean);
      if (firstLine) process.stdout.write(`  ${ANSI.dim}${firstLine}${ANSI.reset}\n`);
    }
  }

  if (!needle) {
    if (rules.length === 0) {
      process.stdout.write('(no rules installed)\n');
      return 0;
    }
    process.stdout.write(`\n${ANSI.dim}${localMatched} local match(es)${ANSI.reset}\n`);
    return 0;
  }

  const remote = await remotePromise;
  if (verbose && remote.cached) process.stdout.write(`${ANSI.dim}remote cache hit${ANSI.reset}\n`);
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
  if (total === 0) process.stdout.write(`No matches for "${query}".\n`);
  if (verbose && remote.error) process.stdout.write(`${ANSI.dim}remote search unavailable: ${remote.error}${ANSI.reset}\n`);

  const summary: string[] = [];
  if (localMatched > 0) summary.push(`${localMatched} local`);
  if (remote.results.length > 0) summary.push(`${remote.results.length} remote`);
  if (summary.length > 0) process.stdout.write(`\n${ANSI.dim}${summary.join(', ')} match(es)${ANSI.reset}\n`);
  return 0;
}
