import type { McpConfigSpec } from '../../core/mcp-types.js';
import type { ResolveParams } from '../adapter-base.js';

/** JSON `mcpServers` 配置;configPath 由各适配器按 scope 提供。 */
export function jsonMcp(configPath: (params: ResolveParams) => string): (params: ResolveParams) => McpConfigSpec {
  return (params) => ({ configPath: configPath(params), format: 'json', serversKey: 'mcpServers' });
}
