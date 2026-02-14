import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { resolveCascadeCopyMcpSpec } from '../src/commands/mcp/rm.js';
import type { SyncedMcpCopy } from '../src/commands/mcp/manage-utils.js';
import type { ConfigV1 } from '../src/core/config.js';

describe('mcp rm cascade resolution', () => {
  it('should resolve MCP config using discovered local copy scope and project root', async () => {
    const projectRoot = '/tmp/apg-mcp-local-project';
    const copy: SyncedMcpCopy = {
      serverName: 'demo',
      def: {},
      adapterId: 'cursor',
      adapterLabel: 'Cursor',
      scope: 'local',
      projectRoot,
    };

    const config: ConfigV1 = {
      version: 1,
      targets: {
        cursor: { defaultScope: 'global' },
      },
    };

    const spec = await resolveCascadeCopyMcpSpec(copy, config, '/tmp/irrelevant-cwd');
    expect(spec?.configPath).toBe(path.join(projectRoot, '.cursor', 'mcp.json'));
    expect(spec?.serversKey).toBe('mcpServers');
  });
});

