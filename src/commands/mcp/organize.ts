import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';
import { loadConfig } from '../../core/config.js';
import { filterMcpAdapters, gatherTargetMcpServers } from './manage-utils.js';
import { getAdapters } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import {
  computeCanonicalMcpHash,
  parseMcpToCanonical,
  serializeCanonicalMcpForTarget,
} from '../../util/mcp-transform.js';
import { runOrganizePlan, type OrganizePlanEntry } from '../../util/organize.js';

type McpScanItem = {
  name: string;
  hash: string;
  targetId: string;
  targetLabel: string;
  detail: string;
};

export async function cmdMcpOrganize(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  const adapters = filterMcpAdapters(getAdapters());
  const selectedAdapters = await selectTargetAdapters({
    adapters,
    flags,
    interactive,
    mode: 'multi',
    promptMessage: 'Select organize target(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const config = await loadConfig();
  const servers = await gatherTargetMcpServers({
    adapters: selectedAdapters,
    config,
    scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
    cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
    currentCwd: ctx.cwd,
  });

  const entries: OrganizePlanEntry[] = [];
  const scanned: McpScanItem[] = [];

  for (const server of servers) {
    if (positionals.length > 0 && !positionals.includes(server.name)) continue;
    const parsed = parseMcpToCanonical(server.def);
    if (!parsed.canonical) {
      entries.push({
        name: server.name,
        targetLabel: server.adapterLabel,
        action: 'skip-unsupported',
        detail: parsed.error ?? 'invalid MCP definition',
        mutates: false,
      });
      continue;
    }
    scanned.push({
      name: server.name,
      hash: computeCanonicalMcpHash(parsed.canonical),
      targetId: server.adapterId,
      targetLabel: server.adapterLabel,
      detail: '',
    });
  }

  const byName = new Map<string, McpScanItem[]>();
  for (const item of scanned) {
    const current = byName.get(item.name);
    if (current) current.push(item);
    else byName.set(item.name, [item]);
  }

  for (const [name, items] of [...byName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const hashes = new Set(items.map((item) => item.hash));
    if (items.length < 2) continue;

    if (hashes.size !== 1) {
      for (const item of items) {
        entries.push({
          name,
          targetLabel: item.targetLabel,
          action: 'report-only',
          detail: 'same MCP server name exists with different canonical content',
          mutates: false,
        });
      }
      continue;
    }

    const parsed = parseMcpToCanonical(servers.find((server) => server.name === name && server.adapterId === items[0]!.targetId)!.def);
    const canonical = parsed.canonical;
    if (!canonical) continue;

    const lossyTargets = selectedAdapters.filter((adapter) => {
      const transformed = serializeCanonicalMcpForTarget(canonical, adapter.id);
      return !transformed.def || transformed.lossy;
    });

    const action = lossyTargets.length > 0 ? 'skip-unsupported' : 'report-only';
    const detail =
      lossyTargets.length > 0
        ? `non-organizable across selected targets: ${lossyTargets.map((adapter) => adapter.label).join(', ')}`
        : 'exact duplicate exists, but MCP has no shared destination in v1';

    for (const item of items) {
      entries.push({
        name,
        targetLabel: item.targetLabel,
        action,
        detail,
        mutates: false,
      });
    }
  }

  return await runOrganizePlan({
    groupLabel: 'MCP',
    entries,
    interactive,
    dryRun,
    force,
  });
}
