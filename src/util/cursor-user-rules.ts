import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureDir, pathExists } from './fs-utils.js';
import {
  type ManagedRuleBlock,
  parseManagedRuleBlocks,
  renderManagedRulesText,
} from './managed-rule-blocks.js';

const execFile = promisify(execFileCallback);
const USER_RULES_KEY = 'aicontext.personalContext';

export type ManagedCursorUserRule = ManagedRuleBlock;

export function getCursorStateDbPath(homeDir: string): string {
  return path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}

function getCursorUserRulesFileOverride(): string | null {
  const override = process.env.AP_CURSOR_USER_RULES_FILE;
  if (!override || !override.trim()) return null;
  return path.resolve(override.trim());
}

export function getCursorUserRulesSourceLabel(homeDir: string): string {
  const override = getCursorUserRulesFileOverride();
  if (override) return override;
  return `${getCursorStateDbPath(homeDir)}#ItemTable[${USER_RULES_KEY}]`;
}

export function parseManagedCursorUserRules(text: string): ManagedCursorUserRule[] {
  return parseManagedRuleBlocks(text);
}

export { renderManagedRulesText as renderCursorUserRulesText };

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

export async function readCursorUserRules(homeDir: string): Promise<string | null> {
  const overrideFile = getCursorUserRulesFileOverride();
  if (overrideFile) {
    if (!(await pathExists(overrideFile))) return '';
    return await fs.readFile(overrideFile, 'utf-8');
  }

  const dbPath = getCursorStateDbPath(homeDir);
  if (!(await pathExists(dbPath))) return '';

  try {
    return await readViaSqliteCli(dbPath);
  } catch {
    try {
      return await readViaPython(dbPath);
    } catch {
      throw new Error(
        'Unable to read Cursor User Rules: sqlite3 CLI and python3 are both unavailable. Set AP_CURSOR_USER_RULES_FILE as a fallback.',
      );
    }
  }
}

export async function writeCursorUserRules(homeDir: string, text: string): Promise<void> {
  const overrideFile = getCursorUserRulesFileOverride();
  if (overrideFile) {
    await ensureDir(path.dirname(overrideFile));
    await fs.writeFile(overrideFile, text, 'utf-8');
    return;
  }

  const dbPath = getCursorStateDbPath(homeDir);
  await ensureDir(path.dirname(dbPath));

  try {
    await writeViaSqliteCli(dbPath, text);
    return;
  } catch {
    try {
      await writeViaPython(dbPath, text);
      return;
    } catch {
      throw new Error(
        'Unable to write Cursor User Rules: sqlite3 CLI and python3 are both unavailable. Set AP_CURSOR_USER_RULES_FILE as a fallback.',
      );
    }
  }
}
