import { describe, expect, it } from 'bun:test';
import { searchRemoteForGroup } from '../src/util/remote-find.js';

type StubResponse = { ok: boolean; status: number; body: unknown };

function makeFetcher(routes: Record<string, StubResponse>) {
  return async (url: string) => {
    const hit = Object.entries(routes).find(([pattern]) => url.includes(pattern))?.[1];
    const response = hit ?? { ok: false, status: 404, body: {} };
    return {
      ok: response.ok,
      status: response.status,
      async json() {
        return response.body;
      },
    };
  };
}

describe('remote find', () => {
  it('maps skills.sh search results for skills', async () => {
    const fetcher = makeFetcher({
      '/api/search': {
        ok: true,
        status: 200,
        body: {
          skills: [{ id: 'vercel-labs/agent-skills/react-best-practices', name: 'react-best-practices', source: 'vercel-labs/agent-skills', installs: 12500 }],
        },
      },
    });

    const result = await searchRemoteForGroup('skills', 'react', { fetcher, limit: 5 });
    expect(result.error).toBeUndefined();
    expect(result.results.length).toBe(1);
    expect(result.results[0]?.name).toBe('react-best-practices');
    expect(result.results[0]?.source).toBe('vercel-labs/agent-skills');
    expect(result.results[0]?.addHint).toBe('ap skills add vercel-labs/agent-skills');
    expect(result.results[0]?.badge).toContain('K installs');
  });

  it('maps GitHub code search results for commands', async () => {
    const fetcher = makeFetcher({
      '/search/code': {
        ok: true,
        status: 200,
        body: {
          items: [
            {
              path: 'commands/refactor/COMMAND.md',
              html_url: 'https://github.com/acme/agent-pack/blob/main/commands/refactor/COMMAND.md',
              repository: {
                full_name: 'acme/agent-pack',
                html_url: 'https://github.com/acme/agent-pack',
                description: 'Agent commands collection',
              },
            },
          ],
        },
      },
    });

    const result = await searchRemoteForGroup('commands', 'refactor', { fetcher, limit: 5 });
    expect(result.error).toBeUndefined();
    expect(result.results.length).toBe(1);
    expect(result.results[0]?.name).toBe('refactor');
    expect(result.results[0]?.source).toBe('acme/agent-pack');
    expect(result.results[0]?.addHint).toBe('ap commands add https://github.com/acme/agent-pack');
  });

  it('maps GitHub repository search results for MCP', async () => {
    const fetcher = makeFetcher({
      '/search/repositories': {
        ok: true,
        status: 200,
        body: {
          items: [
            {
              full_name: 'modelcontextprotocol/servers',
              html_url: 'https://github.com/modelcontextprotocol/servers',
              description: 'Official MCP servers',
              stargazers_count: 42000,
            },
          ],
        },
      },
    });

    const result = await searchRemoteForGroup('mcp', 'official', { fetcher, limit: 5 });
    expect(result.error).toBeUndefined();
    expect(result.results.length).toBe(1);
    expect(result.results[0]?.name).toBe('servers');
    expect(result.results[0]?.source).toBe('modelcontextprotocol/servers');
    expect(result.results[0]?.badge).toContain('★');
  });

  it('returns error info when remote endpoint fails', async () => {
    const fetcher = makeFetcher({
      '/api/search': {
        ok: false,
        status: 503,
        body: {},
      },
    });

    const result = await searchRemoteForGroup('skills', 'react', { fetcher, limit: 5 });
    expect(result.results).toEqual([]);
    expect(result.error).toContain('HTTP 503');
  });
});
