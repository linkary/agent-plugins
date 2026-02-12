/**
 * ap mcp update — 更新中央 MCP 服务器定义。
 * 对于 collected 来源的定义，重新从原始目标工具提取。
 * 对于 manual 来源的定义，无法自动更新，提示用户手动编辑。
 */
import { listCentralMcpServers, readCentralMcpServer, writeCentralMcpServer, computeMcpHash } from '../../core/mcp-store.js';
import { loadConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import { getAdapters } from '../../targets/adapters.js';
import { resolveTargetContext } from '../../util/scope.js';
import { readMcpServers } from '../../util/mcp-config-io.js';
import { promptMultiSelect } from '../../util/prompt.js';
import { ANSI } from '../../util/ansi.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdMcpUpdate(positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  const dryRun = flags['dry-run'] === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const all = flags.all === true;

  const centralServers = await listCentralMcpServers();
  if (centralServers.length === 0) {
    process.stdout.write('(no MCP servers installed)\n');
    return 0;
  }

  let targets: string[];
  if (positionals.length > 0) {
    targets = positionals;
  } else if (all) {
    targets = centralServers;
  } else if (interactive) {
    targets = await promptMultiSelect({
      message: 'Select MCP server(s) to update:',
      options: centralServers.map((n) => ({ label: n, value: n })),
      defaultSelected: [],
    });
    if (targets.length === 0) {
      process.stdout.write('No servers selected.\n');
      return 0;
    }
  } else {
    process.stderr.write('Usage: ap mcp update <server...> [--all]\n');
    return 1;
  }

  const registry = await loadRegistry();
  if (!registry.mcp) registry.mcp = {};
  const config = await loadConfig();
  const adapters = getAdapters();

  let updated = 0;
  let skipped = 0;

  for (const name of targets) {
    if (!centralServers.includes(name)) {
      process.stderr.write(`Unknown MCP server: ${name}\n`);
      continue;
    }

    const record = registry.mcp[name];
    if (!record || record.source.type !== 'collected') {
      process.stdout.write(`${ANSI.dim}${name}: manual source, cannot auto-update${ANSI.reset}\n`);
      skipped++;
      continue;
    }

    // 从原始目标重新读取
    const { target: adapterId, scope: originalScope } = record.source.from;
    const adapter = adapters.find((a) => a.id === adapterId);
    if (!adapter?.resolveMcpConfig) {
      process.stderr.write(`${name}: original target ${adapterId} no longer supports MCP\n`);
      skipped++;
      continue;
    }

    const targetConfig = config.targets[adapter.id];
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag: originalScope,
      defaultScope: targetConfig?.defaultScope,
      currentCwd: ctx.cwd,
    });

    const mcpSpec = adapter.resolveMcpConfig({ scope, projectRoot, homeDir });
    if (!mcpSpec) {
      process.stderr.write(`${name}: cannot resolve MCP config for ${adapterId} (${scope})\n`);
      skipped++;
      continue;
    }

    const servers = await readMcpServers(mcpSpec);
    const freshDef = servers[name];
    if (!freshDef) {
      process.stdout.write(`${ANSI.yellow}${name}: no longer exists in ${adapterId} (${scope})${ANSI.reset}\n`);
      skipped++;
      continue;
    }

    // 比较 hash
    const currentDef = await readCentralMcpServer(name);
    const currentHash = currentDef ? computeMcpHash(currentDef) : '';
    const freshHash = computeMcpHash(freshDef);

    if (currentHash === freshHash) {
      process.stdout.write(`Up-to-date: ${name}\n`);
      continue;
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] Would update ${name} from ${adapterId}\n`);
      updated++;
      continue;
    }

    await writeCentralMcpServer(name, freshDef);
    registry.mcp[name] = {
      ...record,
      updatedAt: new Date().toISOString(),
    };
    updated++;
    process.stdout.write(`${ANSI.green}Updated: ${name}${ANSI.reset}\n`);
  }

  if (!dryRun && updated > 0) {
    await saveRegistry(registry);
  }

  process.stdout.write(`\n${updated} updated, ${skipped} skipped\n`);
  return 0;
}
