import path from 'node:path';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';
import { loadConfig } from '../../core/config.js';
import { filterCommandAdapters, getAdapters } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { gatherTargetCommands } from './manage-utils.js';
import { parseCommandMeta } from '../../util/command-meta.js';
import { computeCommandHash } from '../../util/item-utils.js';
import { runOrganizePlan, type OrganizePlanEntry } from '../../util/organize.js';

function mergeResourceRefs(...lists: (string[] | undefined)[]): string[] | undefined {
  const merged = new Set<string>();
  for (const list of lists) {
    if (!list) continue;
    for (const item of list) {
      if (item.trim()) merged.add(item.trim());
    }
  }
  return merged.size > 0 ? [...merged] : undefined;
}

async function computeTargetCommandHash(command: Awaited<ReturnType<typeof gatherTargetCommands>>[number]): Promise<string> {
  const commandsDir = path.dirname(command.mdPath);
  const meta = await parseCommandMeta(command.mdPath);
  const implicitResourceDir = command.resourceDirPath ? [command.name] : undefined;
  const sharedResources = mergeResourceRefs(meta.resources, implicitResourceDir);
  return await computeCommandHash({
    commandName: command.name,
    commandsDir,
    form: 'file',
    sharedResources,
  });
}

export async function cmdCommandsOrganize(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  const adapters = filterCommandAdapters(getAdapters());
  const selectedAdapters = await selectTargetAdapters({
    adapters,
    flags,
    interactive,
    mode: 'multi',
    promptMessage: 'Select organize target(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const config = await loadConfig();
  const commands = await gatherTargetCommands({
    adapters: selectedAdapters,
    config,
    scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
    cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
    currentCwd: ctx.cwd,
  });

  const entries: OrganizePlanEntry[] = [];
  const byName = new Map<string, Array<(typeof commands)[number] & { hash: string }>>();
  for (const command of commands) {
    if (positionals.length > 0 && !positionals.includes(command.name)) continue;
    const withHash = { ...command, hash: await computeTargetCommandHash(command) };
    const current = byName.get(command.name);
    if (current) current.push(withHash);
    else byName.set(command.name, [withHash]);
  }

  for (const [name, items] of [...byName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const hashes = new Set(items.map((item) => item.hash));
    if (hashes.size === 1 && items.length > 1) {
      for (const item of items) {
        entries.push({
          name,
          targetLabel: item.adapterLabel,
          action: 'report-only',
          path: item.mdPath,
          detail: 'exact duplicate exists, but commands have no shared destination in v1',
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
          path: item.mdPath,
          detail: 'same command name exists with different content',
          mutates: false,
        });
      }
    }
  }

  return await runOrganizePlan({
    groupLabel: 'Commands',
    entries,
    interactive,
    dryRun,
    force,
  });
}
