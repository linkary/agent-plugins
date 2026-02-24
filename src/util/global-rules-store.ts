/**
 * Unified global-rules storage abstraction.
 *
 * Provides a single interface for targets that store global rules in a
 * single file (or database) rather than a rules directory:
 *   - Cursor → SQLite database (state.vscdb)
 *   - Claude Code → ~/.claude/CLAUDE.md
 *   - Antigravity → ~/.gemini/GEMINI.md
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { ensureDir, pathExists } from './fs-utils.js';
import {
  getCursorStateDbPath,
  getCursorUserRulesSourceLabel,
  readCursorUserRules,
  writeCursorUserRules,
} from './cursor-user-rules.js';
import type { TargetId } from '../targets/adapters.js';

export type GlobalRulesStore = {
  /** Human-readable label for display (e.g. file path or db reference). */
  readonly sourceLabel: string;
  /** Read all current content (user-authored + managed blocks). */
  read(): Promise<string>;
  /** Write merged content back. */
  write(text: string): Promise<void>;
};

type SingleFileConfig = {
  filePath: string;
  sourceLabel: string;
};

const SINGLE_FILE_CONFIGS: Partial<Record<TargetId, (homeDir: string) => SingleFileConfig>> = {
  'claude-code': (homeDir) => {
    const filePath = path.join(homeDir, '.claude', 'CLAUDE.md');
    return { filePath, sourceLabel: filePath };
  },
  antigravity: (homeDir) => {
    const filePath = path.join(homeDir, '.gemini', 'GEMINI.md');
    return { filePath, sourceLabel: filePath };
  },
};

function createFileStore(config: SingleFileConfig): GlobalRulesStore {
  return {
    sourceLabel: config.sourceLabel,
    async read() {
      if (!(await pathExists(config.filePath))) return '';
      return await fs.readFile(config.filePath, 'utf-8');
    },
    async write(text: string) {
      await ensureDir(path.dirname(config.filePath));
      await fs.writeFile(config.filePath, text, 'utf-8');
    },
  };
}

function createCursorStore(homeDir: string): GlobalRulesStore {
  return {
    sourceLabel: getCursorUserRulesSourceLabel(homeDir),
    async read() {
      return (await readCursorUserRules(homeDir)) ?? '';
    },
    async write(text: string) {
      await writeCursorUserRules(homeDir, text);
    },
  };
}

/**
 * Get a GlobalRulesStore for the given target, or null if the target
 * does not use single-file global rules.
 */
export function getGlobalRulesStore(targetId: TargetId, homeDir: string): GlobalRulesStore | null {
  if (targetId === 'cursor') return createCursorStore(homeDir);

  const configFn = SINGLE_FILE_CONFIGS[targetId];
  if (!configFn) return null;
  return createFileStore(configFn(homeDir));
}
