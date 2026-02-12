import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  listCentralMcpServers,
  readCentralMcpServer,
  writeCentralMcpServer,
  removeCentralMcpServer,
  computeMcpHash,
} from '../src/core/mcp-store.js';
import type { McpServerDef } from '../src/core/mcp-types.js';

// 使用临时目录隔离测试
let tmpDir: string;
const originalEnv = process.env.APG_HOME;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-mcp-test-'));
  process.env.APG_HOME = tmpDir;
});

afterEach(async () => {
  process.env.APG_HOME = originalEnv;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const stdioDef: McpServerDef = {
  type: 'stdio',
  command: 'npx',
  args: ['-y', 'tavily-mcp@0.1.4'],
  env: { TAVILY_API_KEY: 'tvly-test-key' },
};

const sseDef: McpServerDef = {
  type: 'sse',
  url: 'https://mcp.deepwiki.com/sse',
};

describe('mcp-store', () => {
  describe('listCentralMcpServers', () => {
    it('应返回空列表（空存储）', async () => {
      const servers = await listCentralMcpServers();
      expect(servers).toEqual([]);
    });

    it('应列出已添加的服务器', async () => {
      await writeCentralMcpServer('tavily', stdioDef);
      await writeCentralMcpServer('deepwiki', sseDef);
      const servers = await listCentralMcpServers();
      expect(servers).toEqual(['deepwiki', 'tavily']); // 排序
    });

    it('应忽略非 .json 文件', async () => {
      await writeCentralMcpServer('valid', stdioDef);
      const mcpDir = path.join(tmpDir, 'mcp');
      await fs.writeFile(path.join(mcpDir, 'readme.txt'), 'hello');
      const servers = await listCentralMcpServers();
      expect(servers).toEqual(['valid']);
    });
  });

  describe('readCentralMcpServer', () => {
    it('不存在时返回 null', async () => {
      const result = await readCentralMcpServer('nonexistent');
      expect(result).toBeNull();
    });

    it('应正确读取 stdio 定义', async () => {
      await writeCentralMcpServer('tavily', stdioDef);
      const result = await readCentralMcpServer('tavily');
      expect(result).toEqual(stdioDef);
    });

    it('应正确读取 SSE 定义', async () => {
      await writeCentralMcpServer('deepwiki', sseDef);
      const result = await readCentralMcpServer('deepwiki');
      expect(result).toEqual(sseDef);
    });
  });

  describe('writeCentralMcpServer', () => {
    it('应创建新定义文件', async () => {
      await writeCentralMcpServer('test', stdioDef);
      const filePath = path.join(tmpDir, 'mcp', 'test.json');
      const content = await fs.readFile(filePath, 'utf8');
      expect(JSON.parse(content)).toEqual(stdioDef);
    });

    it('应覆盖已有定义', async () => {
      await writeCentralMcpServer('test', stdioDef);
      await writeCentralMcpServer('test', sseDef);
      const result = await readCentralMcpServer('test');
      expect(result).toEqual(sseDef);
    });
  });

  describe('removeCentralMcpServer', () => {
    it('不存在时返回 false', async () => {
      const result = await removeCentralMcpServer('nonexistent');
      expect(result).toBe(false);
    });

    it('应删除存在的定义', async () => {
      await writeCentralMcpServer('tavily', stdioDef);
      const removed = await removeCentralMcpServer('tavily');
      expect(removed).toBe(true);
      const afterRemoval = await readCentralMcpServer('tavily');
      expect(afterRemoval).toBeNull();
    });
  });

  describe('computeMcpHash', () => {
    it('相同定义应产生相同 hash', () => {
      const hash1 = computeMcpHash(stdioDef);
      const hash2 = computeMcpHash(stdioDef);
      expect(hash1).toBe(hash2);
    });

    it('不同定义应产生不同 hash', () => {
      const hash1 = computeMcpHash(stdioDef);
      const hash2 = computeMcpHash(sseDef);
      expect(hash1).not.toBe(hash2);
    });

    it('hash 应以 sha256: 前缀开头', () => {
      const hash = computeMcpHash(stdioDef);
      expect(hash.startsWith('sha256:')).toBe(true);
    });

    it('键的顺序不影响 hash', () => {
      const def1: McpServerDef = { type: 'stdio', command: 'npx', args: ['-y', 'pkg'] };
      const def2: McpServerDef = { args: ['-y', 'pkg'], command: 'npx', type: 'stdio' };
      expect(computeMcpHash(def1)).toBe(computeMcpHash(def2));
    });

    it('嵌套对象（env/headers）的值应参与 hash 计算', () => {
      const defA: McpServerDef = { command: 'npx', args: ['-y', 'pkg'], env: { KEY: 'aaa' } };
      const defB: McpServerDef = { command: 'npx', args: ['-y', 'pkg'], env: { KEY: 'bbb' } };
      expect(computeMcpHash(defA)).not.toBe(computeMcpHash(defB));
    });

    it('嵌套对象键的顺序不影响 hash', () => {
      const defA: McpServerDef = { command: 'npx', env: { A: '1', B: '2' } };
      const defB: McpServerDef = { command: 'npx', env: { B: '2', A: '1' } };
      expect(computeMcpHash(defA)).toBe(computeMcpHash(defB));
    });
  });
});
