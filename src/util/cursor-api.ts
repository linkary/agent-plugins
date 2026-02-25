/**
 * Cursor Knowledge Base API client.
 *
 * Cursor 2.5+ 将 User Rules 从本地 SQLite (aicontext.personalContext) 迁移到了
 * 服务端 Knowledge Base。此模块通过 Connect RPC 协议与 Cursor 的 AiService 通信,
 * 实现 Knowledge Base 的 CRUD。
 *
 * API 来源: 逆向 Cursor workbench.desktop.main.js (aiserver.v1.AiService).
 * 属于非公开 API, 可能随 Cursor 版本变化而失效。
 */
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { getCursorStateDbPath } from './cursor-user-rules.js';
import { pathExists } from './fs-utils.js';

const execFile = promisify(execFileCallback);

const CURSOR_API_BASE = 'https://api2.cursor.sh';
const SERVICE_PREFIX = 'aiserver.v1.AiService';
const ACCESS_TOKEN_KEY = 'cursorAuth/accessToken';

export type CursorKnowledgeItem = {
  readonly id: string;
  readonly title: string;
  readonly knowledge: string;
  readonly isGenerated: boolean;
  readonly createdAt?: string;
};

// ---------------------------------------------------------------------------
// Auth token 读取 (复用 sqlite3 / python3 fallback 模式)
// ---------------------------------------------------------------------------

async function readTokenViaSqliteCli(dbPath: string): Promise<string> {
  const sql = `SELECT value FROM ItemTable WHERE key='${ACCESS_TOKEN_KEY}' LIMIT 1;`;
  const { stdout } = await execFile('sqlite3', ['-batch', '-noheader', dbPath, sql], {
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

async function readTokenViaPython(dbPath: string): Promise<string> {
  const script = `
import sqlite3, sys
conn = sqlite3.connect(sys.argv[1])
cur = conn.cursor()
cur.execute("SELECT value FROM ItemTable WHERE key=? LIMIT 1", ("${ACCESS_TOKEN_KEY}",))
row = cur.fetchone()
print("" if row is None or row[0] is None else str(row[0]), end="")
conn.close()
`;
  const { stdout } = await execFile('python3', ['-c', script, dbPath], { maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

export async function readCursorAccessToken(homeDir: string): Promise<string | null> {
  const dbPath = getCursorStateDbPath(homeDir);
  if (!(await pathExists(dbPath))) return null;

  try {
    const token = await readTokenViaSqliteCli(dbPath);
    return token || null;
  } catch {
    try {
      const token = await readTokenViaPython(dbPath);
      return token || null;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Connect RPC 调用
// ---------------------------------------------------------------------------

async function connectRpc<T>(method: string, token: string, body: Record<string, unknown>): Promise<T> {
  const url = `${CURSOR_API_BASE}/${SERVICE_PREFIX}/${method}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Connect-Protocol-Version': '1',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Cursor API ${method} failed (${resp.status}): ${text}`);
  }
  return (await resp.json()) as T;
}

// ---------------------------------------------------------------------------
// Knowledge Base CRUD
// ---------------------------------------------------------------------------

type ListResponse = {
  success?: boolean;
  allResults: Array<{
    id?: string;
    title?: string;
    knowledge?: string;
    createdAt?: string;
    isGenerated?: boolean;
  }>;
};

export async function listKnowledgeBase(token: string): Promise<CursorKnowledgeItem[]> {
  const data = await connectRpc<ListResponse>('KnowledgeBaseList', token, { limit: 200 });
  return (data.allResults ?? []).map((r) => ({
    id: r.id ?? '',
    title: r.title ?? '',
    knowledge: r.knowledge ?? '',
    isGenerated: r.isGenerated ?? false,
    createdAt: r.createdAt,
  }));
}

type AddResponse = { success?: boolean; id?: string };

export async function addKnowledgeBase(
  token: string,
  item: { title: string; knowledge: string },
): Promise<string> {
  const data = await connectRpc<AddResponse>('KnowledgeBaseAdd', token, {
    title: item.title,
    knowledge: item.knowledge,
  });
  return data.id ?? '';
}

export async function updateKnowledgeBase(
  token: string,
  item: { id: string; title: string; knowledge: string },
): Promise<void> {
  await connectRpc('KnowledgeBaseUpdate', token, {
    id: item.id,
    title: item.title,
    knowledge: item.knowledge,
  });
}

export async function removeKnowledgeBase(token: string, id: string): Promise<void> {
  await connectRpc('KnowledgeBaseRemove', token, { id });
}

// ---------------------------------------------------------------------------
// 高层辅助: 读取全部 user rules (排除 isGenerated)
// ---------------------------------------------------------------------------

/** 从 Knowledge Base 读取所有用户创建的 rule, 合并为单字符串 (每条一行). */
export async function readCursorKnowledgeBaseRules(token: string): Promise<string> {
  const items = await listKnowledgeBase(token);
  const userItems = items.filter((i) => !i.isGenerated);
  if (userItems.length === 0) return '';
  return userItems.map((i) => i.knowledge).join('\n');
}

/**
 * 行级同步: 将 desiredLines 与当前 Knowledge Base 对齐。
 *
 * - 已存在的 item (按 knowledge 内容匹配) 保留不动
 * - desiredLines 中新出现的行 → addKnowledgeBase
 * - 当前 item 中不在 desiredLines 里的 → removeKnowledgeBase
 */
export async function syncKnowledgeBaseItems(
  token: string,
  desiredLines: string[],
): Promise<{ added: number; removed: number }> {
  const currentItems = (await listKnowledgeBase(token)).filter((i) => !i.isGenerated);
  const currentSet = new Map<string, CursorKnowledgeItem>();
  for (const item of currentItems) {
    currentSet.set(item.knowledge.trim(), item);
  }

  const desiredSet = new Set(desiredLines.map((l) => l.trim()).filter(Boolean));

  // 需要添加的: 在 desired 但不在 current
  const toAdd = [...desiredSet].filter((line) => !currentSet.has(line));
  // 需要删除的: 在 current 但不在 desired
  const toRemove = currentItems.filter((item) => !desiredSet.has(item.knowledge.trim()));

  for (const line of toAdd) {
    await addKnowledgeBase(token, { title: '[Untitled]', knowledge: line });
  }
  for (const item of toRemove) {
    await removeKnowledgeBase(token, item.id);
  }

  return { added: toAdd.length, removed: toRemove.length };
}
