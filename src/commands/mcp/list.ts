/**
 * ap mcp list — 列出中央存储中的 MCP 服务器定义。
 */
import { listCentralMcpServers, readCentralMcpServer } from '../../core/mcp-store.js';
import { loadRegistry } from '../../core/registry.js';
import { ANSI } from '../../util/ansi.js';
import { formatRelativeTime, formatSourceShort } from '../../util/skill-meta.js';
import type { McpServerDef } from '../../core/mcp-types.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

/** 将 MCP 定义格式化为简短的单行描述 */
function formatMcpShort(def: McpServerDef): string {
  if (def.command) {
    const args = def.args?.join(' ') ?? '';
    return `${def.command} ${args}`.trim();
  }
  if (def.url) return def.url;
  return def.type ?? 'unknown';
}

export async function cmdMcpList(_positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const servers = await listCentralMcpServers();
  if (servers.length === 0) {
    process.stdout.write('(no MCP servers installed)\n');
    return 0;
  }

  const registry = await loadRegistry();
  const verbose = flags.verbose === true || flags.v === true;

  for (const name of servers) {
    const record = registry.mcp?.[name];

    // 基本输出：名称
    let line = `${ANSI.cyan}${name}${ANSI.reset}`;

    // 来源信息
    const sourceLabel = formatSourceShort(record?.source);
    if (sourceLabel) {
      line += ` ${ANSI.dim}(${sourceLabel})${ANSI.reset}`;
    }

    // 时间
    const time = formatRelativeTime(record?.updatedAt ?? record?.addedAt);
    if (time) {
      line += ` ${ANSI.yellow}${time}${ANSI.reset}`;
    }

    process.stdout.write(line + '\n');

    // 详细模式：显示定义摘要
    if (verbose) {
      const def = await readCentralMcpServer(name);
      if (def) {
        process.stdout.write(`  ${ANSI.dim}${formatMcpShort(def)}${ANSI.reset}\n`);
      }
    }
  }

  process.stdout.write(`\n${ANSI.dim}${servers.length} MCP server(s)${ANSI.reset}\n`);
  return 0;
}
