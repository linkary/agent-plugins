/**
 * 中央 MCP 服务器定义存储。
 * 管理 ~/.agent-plugins/mcp/ 下的各个 JSON 定义文件。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getCentralMcpDir } from '../util/apg-paths.js';
import { ensureDir, pathExists, readJsonFile, writeJsonFileAtomic } from '../util/fs-utils.js';
import type { McpServerDef } from './mcp-types.js';

/** 确保中央 MCP 目录存在 */
export async function ensureCentralMcpStore(): Promise<void> {
  await ensureDir(getCentralMcpDir());
}

/** 获取指定 MCP 服务器定义文件的路径 */
export function getCentralMcpPath(name: string): string {
  return path.join(getCentralMcpDir(), `${name}.json`);
}

/** 列出中央存储中所有 MCP 服务器名称 */
export async function listCentralMcpServers(): Promise<string[]> {
  await ensureCentralMcpStore();
  const dir = getCentralMcpDir();
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => e.name.replace(/\.json$/, ''))
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/** 读取指定 MCP 服务器定义 */
export async function readCentralMcpServer(name: string): Promise<McpServerDef | null> {
  const filePath = getCentralMcpPath(name);
  if (!(await pathExists(filePath))) return null;
  try {
    return await readJsonFile<McpServerDef>(filePath);
  } catch {
    return null;
  }
}

/** 写入 MCP 服务器定义到中央存储 */
export async function writeCentralMcpServer(name: string, def: McpServerDef): Promise<void> {
  await ensureCentralMcpStore();
  await writeJsonFileAtomic(getCentralMcpPath(name), def);
}

/** 从中央存储删除 MCP 服务器定义 */
export async function removeCentralMcpServer(name: string): Promise<boolean> {
  const filePath = getCentralMcpPath(name);
  if (!(await pathExists(filePath))) return false;
  await fs.rm(filePath, { force: true });
  return true;
}

/**
 * 递归排序对象键，确保嵌套对象（如 env、headers）也参与序列化。
 * 数组元素保持原始顺序。
 */
function deepSortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepSortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = deepSortKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function serializeMcpDef(def: McpServerDef): string {
  return JSON.stringify(deepSortKeys(def));
}

/**
 * 计算 MCP 服务器定义的 hash。
 * 使用递归排序键的 JSON 序列化确保一致性，
 * 包括 env / headers 等嵌套对象的键。
 */
export function computeMcpHash(def: McpServerDef): string {
  const canonical = serializeMcpDef(def);
  return `sha256:${crypto.createHash('sha256').update(canonical).digest('hex')}`;
}

export function computeMcpSerializedSize(def: McpServerDef): number {
  return Buffer.byteLength(serializeMcpDef(def));
}
