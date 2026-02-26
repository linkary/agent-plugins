import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureDir, pathExists } from './fs-utils.js';
import {
  readCursorAccessToken,
  listCursorUserRuleItems,
  syncKnowledgeBaseItems,
} from './cursor-api.js';
import { parseRuleItems, type RuleItem } from './global-rules-store.js';

const execFile = promisify(execFileCallback);
const USER_RULES_KEY = 'aicontext.personalContext';

export function getCursorStateDbPath(homeDir: string): string {
  return path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}

function getCursorUserRulesFileOverride(): string | null {
  const override = process.env.AP_CURSOR_USER_RULES_FILE;
  if (!override || !override.trim()) return null;
  return path.resolve(override.trim());
}

export async function readCursorLocalRulesFallback(cwd: string): Promise<string> {
  let content = '';

  const cursorrulesPath = path.join(cwd, '.cursorrules');
  if (await pathExists(cursorrulesPath)) {
    const text = await fs.readFile(cursorrulesPath, 'utf-8');
    if (text.trim()) {
      content += text.trim() + '\n\n';
    }
  }

  const rulesDir = path.join(cwd, '.cursor', 'rules');
  if (await pathExists(rulesDir)) {
    try {
      const files = await fs.readdir(rulesDir);
      for (const file of files.sort()) {
        if (!file.endsWith('.mdc')) continue;
        const text = await fs.readFile(path.join(rulesDir, file), 'utf-8');
        if (text.trim()) {
          content += `<!-- Rule: ${file} -->\n${text.trim()}\n\n`;
        }
      }
    } catch {}
  }

  return content.trim();
}


export function getCursorUserRulesSourceLabel(homeDir: string, apiAvailable = false): string {
  const override = getCursorUserRulesFileOverride();
  if (override) return override;
  if (apiAvailable) return 'Cursor Knowledge Base API';
  return `${getCursorStateDbPath(homeDir)}#ItemTable[${USER_RULES_KEY}]`;
}

function toHex(text: string): string {
  return Buffer.from(text, 'utf-8').toString('hex');
}

function decodeHex(hex: string): string {
  if (!hex.trim()) return '';
  return Buffer.from(hex.trim(), 'hex').toString('utf-8');
}

async function readViaSqliteCli(dbPath: string): Promise<string | null> {
  const sql = `SELECT hex(value) FROM ItemTable WHERE key='${USER_RULES_KEY}' LIMIT 1;`;
  const { stdout } = await execFile('sqlite3', ['-batch', '-noheader', dbPath, sql], { maxBuffer: 8 * 1024 * 1024 });
  const line = stdout.split(/\r?\n/).find((item) => item.trim().length > 0);
  if (!line) return '';
  return decodeHex(line);
}

async function writeViaSqliteCli(dbPath: string, text: string): Promise<void> {
  const valueHex = toHex(text);
  const sql = [
    'BEGIN;',
    'CREATE TABLE IF NOT EXISTS ItemTable (key TEXT PRIMARY KEY, value TEXT);',
    `INSERT INTO ItemTable(key, value) VALUES('${USER_RULES_KEY}', CAST(X'${valueHex}' AS TEXT))`,
    'ON CONFLICT(key) DO UPDATE SET value=excluded.value;',
    'COMMIT;',
  ].join('\n');
  await execFile('sqlite3', ['-batch', dbPath], { input: sql, maxBuffer: 8 * 1024 * 1024 });
}

async function readViaPython(dbPath: string): Promise<string | null> {
  const script = `
import sqlite3, sys
db = sys.argv[1]
conn = sqlite3.connect(db)
cur = conn.cursor()
try:
  cur.execute("SELECT value FROM ItemTable WHERE key=? LIMIT 1", ("${USER_RULES_KEY}",))
  row = cur.fetchone()
  if row is None:
    print("")
  else:
    val = row[0]
    print("" if val is None else str(val), end="")
finally:
  conn.close()
`;
  const { stdout } = await execFile('python3', ['-c', script, dbPath], { maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}

async function writeViaPython(dbPath: string, text: string): Promise<void> {
  const script = `
import sqlite3, sys
db = sys.argv[1]
payload = sys.stdin.read()
conn = sqlite3.connect(db)
cur = conn.cursor()
cur.execute("CREATE TABLE IF NOT EXISTS ItemTable (key TEXT PRIMARY KEY, value TEXT)")
cur.execute("INSERT INTO ItemTable(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", ("${USER_RULES_KEY}", payload))
conn.commit()
conn.close()
`;
  await execFile('python3', ['-c', script, dbPath], { input: text, maxBuffer: 8 * 1024 * 1024 });
}

/**
 * 读取 Cursor User Rules.
 *
 * Fallback 顺序:
 *   1. AP_CURSOR_USER_RULES_FILE 环境变量覆盖 (段落分隔)
 *   2. Knowledge Base API (Cursor 2.5+, 每条 KB item = 一条 rule)
 *   3. SQLite aicontext.personalContext (legacy, 段落分隔)
 *
 * 返回 { items, apiToken } — apiToken 非 null 时表示 API 可用。
 */
export async function readCursorUserRules(
  homeDir: string,
): Promise<{ items: RuleItem[]; apiToken: string | null }> {
  const overrideFile = getCursorUserRulesFileOverride();
  if (overrideFile) {
    if (!(await pathExists(overrideFile))) return { items: [], apiToken: null };
    const content = await fs.readFile(overrideFile, 'utf-8');
    return { items: parseRuleItems(content), apiToken: null };
  }

  // 尝试 Knowledge Base API — 每个 KB item 是完整 rule
  const token = await readCursorAccessToken(homeDir);
  if (token) {
    try {
      const items = await listCursorUserRuleItems(token);
      return { items, apiToken: token };
    } catch {
      // API 失败, 降级到 SQLite
    }
  }

  // Legacy SQLite fallback
  const dbPath = getCursorStateDbPath(homeDir);
  if (!(await pathExists(dbPath))) return { items: [], apiToken: null };

  try {
    const text = (await readViaSqliteCli(dbPath)) ?? '';
    return { items: parseRuleItems(text), apiToken: null };
  } catch {
    try {
      const text = (await readViaPython(dbPath)) ?? '';
      return { items: parseRuleItems(text), apiToken: null };
    } catch {
      throw new Error(
        'Unable to read Cursor User Rules: Knowledge Base API, sqlite3 CLI, and python3 are all unavailable. Set AP_CURSOR_USER_RULES_FILE as a fallback.',
      );
    }
  }
}

/**
 * 写入 Cursor User Rules.
 *
 * 当 apiToken 非 null 时使用 Knowledge Base API 进行 item 级同步;
 * 否则降级到 SQLite 或文件覆盖 (段落分隔)。
 */
export async function writeCursorUserRules(
  homeDir: string,
  items: RuleItem[],
  apiToken: string | null,
): Promise<void> {
  const { serializeItems } = await import('./global-rules-store.js');

  const overrideFile = getCursorUserRulesFileOverride();
  if (overrideFile) {
    await ensureDir(path.dirname(overrideFile));
    await fs.writeFile(overrideFile, serializeItems(items), 'utf-8');
    return;
  }

  // Knowledge Base API — item 级 diff sync
  if (apiToken) {
    await syncKnowledgeBaseItems(apiToken, items);
    return;
  }

  // Legacy SQLite fallback — 段落序列化
  const dbPath = getCursorStateDbPath(homeDir);
  await ensureDir(path.dirname(dbPath));
  const text = serializeItems(items);

  try {
    await writeViaSqliteCli(dbPath, text);
    return;
  } catch {
    try {
      await writeViaPython(dbPath, text);
      return;
    } catch {
      throw new Error(
        'Unable to write Cursor User Rules: Knowledge Base API unavailable, sqlite3 CLI and python3 also unavailable. Set AP_CURSOR_USER_RULES_FILE as a fallback.',
      );
    }
  }
}
