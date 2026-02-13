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

// ─── 格式分发 ────────────────────────────────────────────────────────────

type FormatOps = {
  parse: (raw: string) => Record<string, unknown>;
  stringify: (config: Record<string, unknown>) => string;
};

/** 按格式区分的序列化/反序列化操作 */
const FORMAT_OPS: Record<McpConfigSpec['format'], FormatOps> = {
  json: {
    parse: (raw) => JSON.parse(raw) as Record<string, unknown>,
    stringify: (config) => JSON.stringify(config, null, 2) + '\n',
  },
  toml: {
    parse: (raw) => parseToml(raw) as Record<string, unknown>,
    stringify: (config) => stringifyToml(config) + '\n',
  },
};

// ─── 内部：读取现有配置（复用于 write 和 remove） ────────────────────────

/** 读取并解析配置文件，文件不存在或解析失败时返回空对象 */
async function readExistingConfig(spec: McpConfigSpec): Promise<Record<string, unknown>> {
  if (!(await pathExists(spec.configPath))) return {};
  try {
    const raw = await fs.readFile(spec.configPath, 'utf8');
    return FORMAT_OPS[spec.format].parse(raw);
  } catch {
    return {};
  }
}

// ─── 公共 API ────────────────────────────────────────────────────────────

/** 读取目标配置文件中所有 MCP 服务器定义 */
export async function readMcpServers(spec: McpConfigSpec): Promise<Record<string, McpServerDef>> {
  const config = await readExistingConfig(spec);
  const servers = config[spec.serversKey];
  if (servers && typeof servers === 'object' && !Array.isArray(servers)) {
    return servers as Record<string, McpServerDef>;
  }
  return {};
}

/** 将 MCP 服务器定义写入（合并到）目标配置文件 */
export async function writeMcpServer(spec: McpConfigSpec, name: string, def: McpServerDef): Promise<void> {
  await ensureDir(path.dirname(spec.configPath));
  const config = await readExistingConfig(spec);
  const servers = (config[spec.serversKey] ?? {}) as Record<string, McpServerDef>;
  servers[name] = def;
  config[spec.serversKey] = servers;
  await fs.writeFile(spec.configPath, FORMAT_OPS[spec.format].stringify(config), 'utf8');
}

/** 从目标配置文件中移除指定 MCP 服务器，返回是否成功 */
export async function removeMcpServer(spec: McpConfigSpec, name: string): Promise<boolean> {
  const config = await readExistingConfig(spec);
  const servers = config[spec.serversKey] as Record<string, McpServerDef> | undefined;
  if (!servers || !(name in servers)) return false;
  delete servers[name];
  config[spec.serversKey] = servers;
  await fs.writeFile(spec.configPath, FORMAT_OPS[spec.format].stringify(config), 'utf8');
  return true;
}
