/**
 * MCP 目标工具扫描工具函数。
 * 提供从目标工具配置文件中读取和查找 MCP 服务器定义的能力。
 */
import { getColoredLabel, getAdapters, type TargetAdapter, type Scope } from '../../targets/adapters.js';
import { resolveTargetContext } from '../../util/scope.js';
import { readMcpServers } from '../../util/mcp-config-io.js';
import type { ConfigV1 } from '../../core/config.js';
import type { McpServerDef } from '../../core/mcp-types.js';

// ─── Target MCP browsing ────────────────────────────────────────────────

export type TargetMcpServer = {
  name: string;
  def: McpServerDef;
  adapterId: string;
  adapterLabel: string;
  scope: Scope;
  projectRoot?: string;
};

/**
 * 收集指定适配器和 scope 下的所有目标 MCP 服务器定义。
 */
export async function gatherTargetMcpServers(params: {
  adapters: TargetAdapter[];
  config: ConfigV1;
  scopeFlag?: string;
  cwdFlag?: string;
  currentCwd: string;
}): Promise<TargetMcpServer[]> {
  const { adapters, config, scopeFlag, cwdFlag, currentCwd } = params;
  const allServers: TargetMcpServer[] = [];

  for (const adapter of adapters) {
    if (!adapter.resolveMcpConfig) continue;
    const targetConfig = config.targets[adapter.id];

    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag,
      cwdFlag,
      defaultScope: targetConfig?.defaultScope,
      currentCwd,
    });

    const mcpSpec = adapter.resolveMcpConfig({ scope, projectRoot, homeDir });
    if (!mcpSpec) continue;

    const servers = await readMcpServers(mcpSpec);
    for (const [name, def] of Object.entries(servers)) {
      allServers.push({
        name,
        def,
        adapterId: adapter.id,
        adapterLabel: getColoredLabel(adapter),
        scope,
        projectRoot: scope === 'local' ? projectRoot : undefined,
      });
    }
  }

  return allServers;
}

// ─── Cascade deletion scanning ──────────────────────────────────────────

export type SyncedMcpCopy = {
  serverName: string;
  def: McpServerDef;
  adapterId: string;
  adapterLabel: string;
  scope: Scope;
  projectRoot?: string;
};

/**
 * 扫描所有目标工具，找出指定 MCP 服务器的已同步副本。
 */
export async function findSyncedMcpCopies(params: {
  serverNames: string[];
  config: ConfigV1;
  currentCwd: string;
}): Promise<SyncedMcpCopy[]> {
  const { serverNames, config, currentCwd } = params;
  const adapters = getAdapters();
  const copies: SyncedMcpCopy[] = [];

  for (const adapter of adapters) {
    if (!adapter.resolveMcpConfig) continue;
    const targetConfig = config.targets[adapter.id];

    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      defaultScope: targetConfig?.defaultScope ?? 'global',
      currentCwd,
    });

    const mcpSpec = adapter.resolveMcpConfig({ scope, projectRoot, homeDir });
    if (!mcpSpec) continue;

    const servers = await readMcpServers(mcpSpec);
    for (const name of serverNames) {
      if (name in servers) {
        copies.push({
          serverName: name,
          def: servers[name]!,
          adapterId: adapter.id,
          adapterLabel: getColoredLabel(adapter),
          scope,
          projectRoot: scope === 'local' ? projectRoot : undefined,
        });
      }
    }
  }

  return copies;
}

/**
 * 过滤出支持 MCP 的适配器。
 */
export function filterMcpAdapters(adapters: TargetAdapter[]): TargetAdapter[] {
  return adapters.filter((a) => typeof a.resolveMcpConfig === 'function');
}
