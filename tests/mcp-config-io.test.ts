import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readMcpServers, writeMcpServer, removeMcpServer } from '../src/util/mcp-config-io.js';
import type { McpConfigSpec, McpServerDef } from '../src/core/mcp-types.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-mcp-io-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const stdioDef: McpServerDef = {
  type: 'stdio',
  command: 'npx',
  args: ['-y', 'tavily-mcp@0.1.4'],
  env: { TAVILY_API_KEY: 'tvly-test' },
};

const sseDef: McpServerDef = {
  type: 'sse',
  url: 'https://mcp.deepwiki.com/sse',
};

// ─── JSON 格式测试 ──────────────────────────────────────────────────────

describe('mcp-config-io (JSON)', () => {
  function jsonSpec(filename = 'mcp.json'): McpConfigSpec {
    return { configPath: path.join(tmpDir, filename), format: 'json', serversKey: 'mcpServers' };
  }

  describe('readMcpServers', () => {
    it('文件不存在时返回空对象', async () => {
      const result = await readMcpServers(jsonSpec());
      expect(result).toEqual({});
    });

    it('应读取已有的 MCP 服务器定义', async () => {
      const config = { mcpServers: { tavily: stdioDef, deepwiki: sseDef } };
      await fs.writeFile(jsonSpec().configPath, JSON.stringify(config), 'utf8');
      const result = await readMcpServers(jsonSpec());
      expect(result).toEqual({ tavily: stdioDef, deepwiki: sseDef });
    });

    it('无 mcpServers 键时返回空对象', async () => {
      await fs.writeFile(jsonSpec().configPath, JSON.stringify({ other: 'data' }), 'utf8');
      const result = await readMcpServers(jsonSpec());
      expect(result).toEqual({});
    });

    it('无效 JSON 时返回空对象', async () => {
      await fs.writeFile(jsonSpec().configPath, 'not json!!!', 'utf8');
      const result = await readMcpServers(jsonSpec());
      expect(result).toEqual({});
    });
  });

  describe('writeMcpServer', () => {
    it('应创建新配置文件并写入服务器', async () => {
      await writeMcpServer(jsonSpec(), 'tavily', stdioDef);
      const raw = await fs.readFile(jsonSpec().configPath, 'utf8');
      const config = JSON.parse(raw);
      expect(config.mcpServers.tavily).toEqual(stdioDef);
    });

    it('应保留已有的其他服务器', async () => {
      await writeMcpServer(jsonSpec(), 'tavily', stdioDef);
      await writeMcpServer(jsonSpec(), 'deepwiki', sseDef);
      const raw = await fs.readFile(jsonSpec().configPath, 'utf8');
      const config = JSON.parse(raw);
      expect(config.mcpServers.tavily).toEqual(stdioDef);
      expect(config.mcpServers.deepwiki).toEqual(sseDef);
    });

    it('应保留配置文件中的其他键', async () => {
      const existing = { otherSetting: true, mcpServers: {} };
      await fs.writeFile(jsonSpec().configPath, JSON.stringify(existing), 'utf8');
      await writeMcpServer(jsonSpec(), 'tavily', stdioDef);
      const raw = await fs.readFile(jsonSpec().configPath, 'utf8');
      const config = JSON.parse(raw);
      expect(config.otherSetting).toBe(true);
      expect(config.mcpServers.tavily).toEqual(stdioDef);
    });

    it('应覆盖同名服务器', async () => {
      await writeMcpServer(jsonSpec(), 'tavily', stdioDef);
      await writeMcpServer(jsonSpec(), 'tavily', sseDef);
      const raw = await fs.readFile(jsonSpec().configPath, 'utf8');
      const config = JSON.parse(raw);
      expect(config.mcpServers.tavily).toEqual(sseDef);
    });
  });

  describe('removeMcpServer', () => {
    it('文件不存在时返回 false', async () => {
      const result = await removeMcpServer(jsonSpec(), 'tavily');
      expect(result).toBe(false);
    });

    it('服务器不存在时返回 false', async () => {
      const existing = { mcpServers: { other: sseDef } };
      await fs.writeFile(jsonSpec().configPath, JSON.stringify(existing), 'utf8');
      const result = await removeMcpServer(jsonSpec(), 'tavily');
      expect(result).toBe(false);
    });

    it('应删除指定服务器并保留其他', async () => {
      await writeMcpServer(jsonSpec(), 'tavily', stdioDef);
      await writeMcpServer(jsonSpec(), 'deepwiki', sseDef);
      const removed = await removeMcpServer(jsonSpec(), 'tavily');
      expect(removed).toBe(true);
      const raw = await fs.readFile(jsonSpec().configPath, 'utf8');
      const config = JSON.parse(raw);
      expect(config.mcpServers.tavily).toBeUndefined();
      expect(config.mcpServers.deepwiki).toEqual(sseDef);
    });
  });
});

// ─── TOML 格式测试 ──────────────────────────────────────────────────────

describe('mcp-config-io (TOML)', () => {
  function tomlSpec(filename = 'config.toml'): McpConfigSpec {
    return { configPath: path.join(tmpDir, filename), format: 'toml', serversKey: 'mcp_servers' };
  }

  describe('readMcpServers', () => {
    it('文件不存在时返回空对象', async () => {
      const result = await readMcpServers(tomlSpec());
      expect(result).toEqual({});
    });

    it('应读取 TOML 格式的 MCP 服务器定义', async () => {
      const tomlContent = [
        '[mcp_servers.tavily]',
        'command = "npx"',
        'args = ["-y", "tavily-mcp"]',
        'enabled = true',
        '',
        '[mcp_servers.tavily.env]',
        'TAVILY_API_KEY = "test-key"',
      ].join('\n');
      await fs.writeFile(tomlSpec().configPath, tomlContent, 'utf8');
      const result = await readMcpServers(tomlSpec());
      expect(result.tavily).toBeDefined();
      expect(result.tavily.command).toBe('npx');
      expect(result.tavily.args).toEqual(['-y', 'tavily-mcp']);
      expect(result.tavily.env).toEqual({ TAVILY_API_KEY: 'test-key' });
    });

    it('无 mcp_servers 节时返回空对象', async () => {
      await fs.writeFile(tomlSpec().configPath, 'other = "value"\n', 'utf8');
      const result = await readMcpServers(tomlSpec());
      expect(result).toEqual({});
    });
  });

  describe('writeMcpServer', () => {
    it('应创建新 TOML 配置文件', async () => {
      const def: McpServerDef = { command: 'npx', args: ['-y', 'pkg'], enabled: true };
      await writeMcpServer(tomlSpec(), 'test', def);
      const raw = await fs.readFile(tomlSpec().configPath, 'utf8');
      expect(raw).toContain('[mcp_servers.test]');
      expect(raw).toContain('command = "npx"');
    });

    it('应保留 TOML 文件中的其他配置', async () => {
      const existing = 'model = "gpt-4"\nsandbox = true\n';
      await fs.writeFile(tomlSpec().configPath, existing, 'utf8');
      const def: McpServerDef = { command: 'npx', args: ['-y', 'pkg'] };
      await writeMcpServer(tomlSpec(), 'test', def);
      const raw = await fs.readFile(tomlSpec().configPath, 'utf8');
      // smol-toml round-trip：其他键应保留
      expect(raw).toContain('model = "gpt-4"');
      expect(raw).toContain('[mcp_servers.test]');
    });

    it('应添加多个服务器', async () => {
      const def1: McpServerDef = { command: 'npx', args: ['-y', 'pkg1'] };
      const def2: McpServerDef = { url: 'https://example.com/sse' };
      await writeMcpServer(tomlSpec(), 'server1', def1);
      await writeMcpServer(tomlSpec(), 'server2', def2);
      const result = await readMcpServers(tomlSpec());
      expect(result.server1.command).toBe('npx');
      expect(result.server2.url).toBe('https://example.com/sse');
    });
  });

  describe('removeMcpServer', () => {
    it('应删除指定服务器', async () => {
      const def1: McpServerDef = { command: 'npx', args: ['-y', 'pkg1'] };
      const def2: McpServerDef = { url: 'https://example.com/sse' };
      await writeMcpServer(tomlSpec(), 'server1', def1);
      await writeMcpServer(tomlSpec(), 'server2', def2);
      const removed = await removeMcpServer(tomlSpec(), 'server1');
      expect(removed).toBe(true);
      const result = await readMcpServers(tomlSpec());
      expect(result.server1).toBeUndefined();
      expect(result.server2).toBeDefined();
    });
  });
});

// ─── 跨格式一致性测试 ──────────────────────────────────────────────────

describe('mcp-config-io (cross-format consistency)', () => {
  it('JSON 和 TOML 的 read-write-read 应一致', async () => {
    const jsonSpec: McpConfigSpec = { configPath: path.join(tmpDir, 'test.json'), format: 'json', serversKey: 'mcpServers' };
    const tomlSpecObj: McpConfigSpec = { configPath: path.join(tmpDir, 'test.toml'), format: 'toml', serversKey: 'mcp_servers' };

    const def: McpServerDef = { command: 'npx', args: ['-y', 'test-pkg'] };

    await writeMcpServer(jsonSpec, 'test', def);
    await writeMcpServer(tomlSpecObj, 'test', def);

    const jsonResult = await readMcpServers(jsonSpec);
    const tomlResult = await readMcpServers(tomlSpecObj);

    expect(jsonResult.test.command).toBe(tomlResult.test.command);
    expect(jsonResult.test.args).toEqual(tomlResult.test.args);
  });
});
