/**
 * 格式感知的 MCP 配置文件读写层。
 * 支持 JSON 和 TOML 格式的非破坏性 read-modify-write。
 *
 * 副作用：读写目标工具的配置文件。
 * 限制：TOML 格式的 round-trip 不会保留注释。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { ensureDir, pathExists } from './fs-utils.js';
import type { McpConfigSpec, McpServerDef } from '../core/mcp-types.js';

// ─── JSON 格式处理 ─────────────────────────────────────────────────────

/** 读取 JSON 配置文件中的 MCP 服务器定义 */
async function readJsonServers(spec: McpConfigSpec): Promise<Record<string, McpServerDef>> {
  if (!(await pathExists(spec.configPath))) return {};
  try {
    const raw = await fs.readFile(spec.configPath, 'utf8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    const servers = config[spec.serversKey];
    if (servers && typeof servers === 'object' && !Array.isArray(servers)) {
      return servers as Record<string, McpServerDef>;
    }
    return {};
  } catch {
    return {};
  }
}

/** 将 MCP 服务器写入 JSON 配置文件（非破坏性合并） */
async function writeJsonServer(spec: McpConfigSpec, name: string, def: McpServerDef): Promise<void> {
  await ensureDir(path.dirname(spec.configPath));
  let config: Record<string, unknown> = {};
  if (await pathExists(spec.configPath)) {
    try {
      const raw = await fs.readFile(spec.configPath, 'utf8');
      config = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // 如果无法解析，从空配置开始
    }
  }
  const servers = (config[spec.serversKey] ?? {}) as Record<string, McpServerDef>;
  servers[name] = def;
  config[spec.serversKey] = servers;
  await fs.writeFile(spec.configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

/** 从 JSON 配置文件中移除 MCP 服务器 */
async function removeJsonServer(spec: McpConfigSpec, name: string): Promise<boolean> {
  if (!(await pathExists(spec.configPath))) return false;
  try {
    const raw = await fs.readFile(spec.configPath, 'utf8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    const servers = config[spec.serversKey] as Record<string, McpServerDef> | undefined;
    if (!servers || !(name in servers)) return false;
    delete servers[name];
    config[spec.serversKey] = servers;
    await fs.writeFile(spec.configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

// ─── TOML 格式处理 ─────────────────────────────────────────────────────

/**
 * 将嵌套的 TOML 对象展平为 MCP 服务器定义。
 * Codex config.toml 的 MCP 格式：
 *   [mcp_servers.name]
 *   command = "npx"
 *   args = ["-y", "pkg"]
 *   [mcp_servers.name.env]
 *   KEY = "value"
 */
async function readTomlServers(spec: McpConfigSpec): Promise<Record<string, McpServerDef>> {
  if (!(await pathExists(spec.configPath))) return {};
  try {
    const raw = await fs.readFile(spec.configPath, 'utf8');
    const config = parseToml(raw) as Record<string, unknown>;
    const servers = config[spec.serversKey];
    if (servers && typeof servers === 'object' && !Array.isArray(servers)) {
      return servers as Record<string, McpServerDef>;
    }
    return {};
  } catch {
    return {};
  }
}

/** 将 MCP 服务器写入 TOML 配置文件（非破坏性合并） */
async function writeTomlServer(spec: McpConfigSpec, name: string, def: McpServerDef): Promise<void> {
  await ensureDir(path.dirname(spec.configPath));
  let config: Record<string, unknown> = {};
  if (await pathExists(spec.configPath)) {
    try {
      const raw = await fs.readFile(spec.configPath, 'utf8');
      config = parseToml(raw) as Record<string, unknown>;
    } catch {
      // 如果无法解析，从空配置开始
    }
  }
  const servers = (config[spec.serversKey] ?? {}) as Record<string, McpServerDef>;
  servers[name] = def;
  config[spec.serversKey] = servers;
  await fs.writeFile(spec.configPath, stringifyToml(config) + '\n', 'utf8');
}

/** 从 TOML 配置文件中移除 MCP 服务器 */
async function removeTomlServer(spec: McpConfigSpec, name: string): Promise<boolean> {
  if (!(await pathExists(spec.configPath))) return false;
  try {
    const raw = await fs.readFile(spec.configPath, 'utf8');
    const config = parseToml(raw) as Record<string, unknown>;
    const servers = config[spec.serversKey] as Record<string, McpServerDef> | undefined;
    if (!servers || !(name in servers)) return false;
    delete servers[name];
    config[spec.serversKey] = servers;
    await fs.writeFile(spec.configPath, stringifyToml(config) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

// ─── 统一公共 API ──────────────────────────────────────────────────────

/** 读取目标配置文件中所有 MCP 服务器定义 */
export async function readMcpServers(spec: McpConfigSpec): Promise<Record<string, McpServerDef>> {
  return spec.format === 'toml' ? readTomlServers(spec) : readJsonServers(spec);
}

/** 将 MCP 服务器定义写入（合并到）目标配置文件 */
export async function writeMcpServer(spec: McpConfigSpec, name: string, def: McpServerDef): Promise<void> {
  return spec.format === 'toml' ? writeTomlServer(spec, name, def) : writeJsonServer(spec, name, def);
}

/** 从目标配置文件中移除指定 MCP 服务器，返回是否成功 */
export async function removeMcpServer(spec: McpConfigSpec, name: string): Promise<boolean> {
  return spec.format === 'toml' ? removeTomlServer(spec, name) : removeJsonServer(spec, name);
}
