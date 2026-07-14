import type { TargetAdapter } from '../adapter-base.js';
import { cursorAdapter } from './cursor.js';
import { codexAdapter } from './codex.js';
import { claudeCodeAdapter } from './claude-code.js';
import { antigravityAdapter } from './antigravity.js';
import { agentsAdapter } from './agents.js';
import { opencodeAdapter } from './opencode.js';
import { qoderAdapter } from './qoder.js';
import { qodercliAdapter } from './qodercli.js';

/** 目标适配器注册表。新增目标:在此数组追加一个 `adapters/<tool>.ts` 导出的适配器即可。 */
export const adapters: TargetAdapter[] = [
  cursorAdapter,
  codexAdapter,
  claudeCodeAdapter,
  antigravityAdapter,
  agentsAdapter,
  opencodeAdapter,
  qoderAdapter,
  qodercliAdapter,
];
