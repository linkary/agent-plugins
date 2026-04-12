import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';
import { loadConfig } from '../../core/config.js';
import { filterAgentAdapters, getAdapters } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { gatherTargetAgents } from './manage-utils.js';
import { computeItemHash } from '../../util/item-utils.js';
import { runOrganizePlan, type OrganizePlanEntry } from '../../util/organize.js';

export async function cmdAgentsOrganize(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  const adapters = filterAgentAdapters(getAdapters());
  const selectedAdapters = await selectTargetAdapters({
    adapters,
    flags,
    interactive,
    mode: 'multi',
    promptMessage: 'Select organize target(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const config = await loadConfig();
  const agents = await gatherTargetAgents({
    adapters: selectedAdapters,
    config,
    scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
    cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
    currentCwd: ctx.cwd,
  });

  const entries: OrganizePlanEntry[] = [];
  const byName = new Map<string, Array<(typeof agents)[number] & { hash: string }>>();
  for (const agent of agents) {
    if (positionals.length > 0 && !positionals.includes(agent.name)) continue;
    const withHash = { ...agent, hash: await computeItemHash(agent.path) };
    const current = byName.get(agent.name);
    if (current) current.push(withHash);
    else byName.set(agent.name, [withHash]);
  }

  for (const [name, items] of [...byName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const hashes = new Set(items.map((item) => item.hash));
    if (hashes.size === 1 && items.length > 1) {
      for (const item of items) {
        entries.push({
          name,
          targetLabel: item.adapterLabel,
          action: 'report-only',
          path: item.path,
          detail: 'exact duplicate exists, but no shared destination is defined for agents',
          mutates: false,
        });
      }
      continue;
    }
    if (items.length > 1) {
      for (const item of items) {
        entries.push({
          name,
          targetLabel: item.adapterLabel,
          action: 'report-only',
          path: item.path,
          detail: 'same agent name exists with different content',
          mutates: false,
        });
      }
    }
  }

  return await runOrganizePlan({
    groupLabel: 'Agents',
    entries,
    interactive,
    dryRun,
    force,
  });
}
