/**
 * cursor-api.ts 单元测试.
 *
 * 使用 mock fetch 模拟 Cursor Knowledge Base API 响应。
 */
import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import {
  listKnowledgeBase,
  addKnowledgeBase,
  updateKnowledgeBase,
  removeKnowledgeBase,
  listCursorUserRuleItems,
  syncKnowledgeBaseItems,
  type CursorKnowledgeItem,
} from '../src/util/cursor-api.js';
import { toRuleItem } from '../src/util/global-rules-store.js';

const TOKEN = 'test-token-abc';

let originalFetch: typeof globalThis.fetch;
let mockFetchFn: ReturnType<typeof mock>;

function mockFetch(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  mockFetchFn = mock((url: string, init: RequestInit) => {
    const result = handler(url, init as RequestInit);
    return Promise.resolve({
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: () => Promise.resolve(result.body),
      text: () => Promise.resolve(JSON.stringify(result.body)),
    } as Response);
  });
  globalThis.fetch = mockFetchFn as unknown as typeof fetch;
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('listKnowledgeBase', () => {
  it('parses response items correctly', async () => {
    mockFetch(() => ({
      status: 200,
      body: {
        success: true,
        allResults: [
          { id: 'r1', title: 'Rule 1', knowledge: 'Do X', isGenerated: false, createdAt: '2026-01-01' },
          { id: 'r2', title: 'Rule 2', knowledge: 'Do Y', isGenerated: true },
        ],
      },
    }));

    const items = await listKnowledgeBase(TOKEN);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      id: 'r1',
      title: 'Rule 1',
      knowledge: 'Do X',
      isGenerated: false,
      createdAt: '2026-01-01',
    });
    expect(items[1]!.isGenerated).toBe(true);
  });

  it('sends correct auth header and content type', async () => {
    mockFetch((url, init) => {
      expect(init.headers).toMatchObject({
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
      });
      expect(url).toContain('KnowledgeBaseList');
      return { status: 200, body: { allResults: [] } };
    });

    await listKnowledgeBase(TOKEN);
    expect(mockFetchFn).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when allResults is absent', async () => {
    mockFetch(() => ({ status: 200, body: {} }));
    const items = await listKnowledgeBase(TOKEN);
    expect(items).toEqual([]);
  });

  it('throws on non-200 response', async () => {
    mockFetch(() => ({ status: 401, body: { error: 'unauthorized' } }));
    await expect(listKnowledgeBase(TOKEN)).rejects.toThrow('Cursor API KnowledgeBaseList failed (401)');
  });
});

describe('addKnowledgeBase', () => {
  it('returns the new item id', async () => {
    mockFetch((_url, init) => {
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({ title: 'My Rule', knowledge: 'Always be polite' });
      return { status: 200, body: { success: true, id: 'new-id-123' } };
    });

    const id = await addKnowledgeBase(TOKEN, { title: 'My Rule', knowledge: 'Always be polite' });
    expect(id).toBe('new-id-123');
  });
});

describe('updateKnowledgeBase', () => {
  it('sends id, title, knowledge in body', async () => {
    mockFetch((_url, init) => {
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({ id: 'r1', title: 'Updated', knowledge: 'New content' });
      return { status: 200, body: { success: true } };
    });

    await updateKnowledgeBase(TOKEN, { id: 'r1', title: 'Updated', knowledge: 'New content' });
  });
});

describe('removeKnowledgeBase', () => {
  it('sends id in body', async () => {
    mockFetch((_url, init) => {
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({ id: 'r1' });
      return { status: 200, body: {} };
    });

    await removeKnowledgeBase(TOKEN, 'r1');
  });
});

describe('listCursorUserRuleItems', () => {
  it('returns RuleItem[] for non-generated items', async () => {
    mockFetch(() => ({
      status: 200,
      body: {
        allResults: [
          { id: 'r1', knowledge: 'Rule A', isGenerated: false },
          { id: 'r2', knowledge: 'Generated Rule', isGenerated: true },
          { id: 'r3', knowledge: 'Rule B', isGenerated: false },
        ],
      },
    }));

    const items = await listCursorUserRuleItems(TOKEN);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.content).sort()).toEqual(['Rule A', 'Rule B']);
    expect(items[0]!.hash).toMatch(/^sha256:/);
  });

  it('returns empty array when no user rules exist', async () => {
    mockFetch(() => ({
      status: 200,
      body: { allResults: [{ id: 'r1', knowledge: 'auto', isGenerated: true }] },
    }));

    const items = await listCursorUserRuleItems(TOKEN);
    expect(items).toEqual([]);
  });
});

describe('syncKnowledgeBaseItems', () => {
  it('adds new lines and removes stale items', async () => {
    const calls: Array<{ method: string; body: unknown }> = [];

    mockFetch((url, init) => {
      const method = url.split('/').pop()!;
      const body = JSON.parse(init.body as string);
      calls.push({ method, body });

      if (method === 'KnowledgeBaseList') {
        return {
          status: 200,
          body: {
            allResults: [
              { id: 'existing-1', title: 'T', knowledge: 'Keep Me', isGenerated: false },
              { id: 'existing-2', title: 'T', knowledge: 'Remove Me', isGenerated: false },
              { id: 'auto', title: 'T', knowledge: 'Auto', isGenerated: true },
            ],
          },
        };
      }
      return { status: 200, body: { success: true, id: 'new-1' } };
    });

    const result = await syncKnowledgeBaseItems(TOKEN, [toRuleItem('Keep Me'), toRuleItem('New Line')]);
    expect(result).toEqual({ added: 1, removed: 1 });

    const addCalls = calls.filter((c) => c.method === 'KnowledgeBaseAdd');
    expect(addCalls).toHaveLength(1);
    expect((addCalls[0]!.body as Record<string, string>).knowledge).toBe('New Line');

    const removeCalls = calls.filter((c) => c.method === 'KnowledgeBaseRemove');
    expect(removeCalls).toHaveLength(1);
    expect((removeCalls[0]!.body as Record<string, string>).id).toBe('existing-2');
  });

  it('does nothing when already in sync', async () => {
    const calls: string[] = [];

    mockFetch((url) => {
      calls.push(url.split('/').pop()!);
      return {
        status: 200,
        body: {
          allResults: [
            { id: 'r1', title: 'T', knowledge: 'A', isGenerated: false },
            { id: 'r2', title: 'T', knowledge: 'B', isGenerated: false },
          ],
        },
      };
    });

    const result = await syncKnowledgeBaseItems(TOKEN, [toRuleItem('A'), toRuleItem('B')]);
    expect(result).toEqual({ added: 0, removed: 0 });
    expect(calls).toEqual(['KnowledgeBaseList']);
  });

  it('skips isGenerated items when calculating removals', async () => {
    const calls: Array<{ method: string; body: unknown }> = [];

    mockFetch((url, init) => {
      const method = url.split('/').pop()!;
      calls.push({ method, body: JSON.parse(init.body as string) });

      if (method === 'KnowledgeBaseList') {
        return {
          status: 200,
          body: {
            allResults: [
              { id: 'gen', title: 'G', knowledge: 'Generated', isGenerated: true },
              { id: 'usr', title: 'U', knowledge: 'User Rule', isGenerated: false },
            ],
          },
        };
      }
      return { status: 200, body: { success: true, id: 'new' } };
    });

    const result = await syncKnowledgeBaseItems(TOKEN, [toRuleItem('User Rule')]);
    expect(result).toEqual({ added: 0, removed: 0 });
    expect(calls.filter((c) => c.method === 'KnowledgeBaseRemove')).toHaveLength(0);
  });
});
