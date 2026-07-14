import { ANSI } from '../util/ansi.js';
import { adapters } from './adapters/index.js';
import type { TargetAdapter, TargetId } from './adapter-base.js';

// 公开的类型入口(保持既有 import 路径 '../targets/adapters.js' 不变)。
export type { Scope, TargetId, ResolveParams, DetectContext, InstallEvidence, TargetAdapter } from './adapter-base.js';

const SKILLS_ONLY_TARGET_IDS = new Set<TargetId>(['agents']);

/** Targets that do not support agents sync. */
const NO_AGENTS_IDS = new Set<TargetId>(['agents', 'antigravity']);

/** Targets that do not support commands sync. */
const NO_COMMANDS_IDS = new Set<TargetId>(['agents']);

export function getAdapters(): TargetAdapter[] {
  return adapters.slice();
}

export function filterCommandAdapters(list: TargetAdapter[]): TargetAdapter[] {
  return list.filter((adapter) => !NO_COMMANDS_IDS.has(adapter.id));
}

export function filterAgentAdapters(list: TargetAdapter[]): TargetAdapter[] {
  return list.filter((adapter) => !NO_AGENTS_IDS.has(adapter.id));
}

export function filterRuleAdapters(list: TargetAdapter[]): TargetAdapter[] {
  return list.filter((adapter) => !SKILLS_ONLY_TARGET_IDS.has(adapter.id));
}

export function getColoredLabel(adapter: TargetAdapter): string {
  return `${adapter.color}${adapter.label}${ANSI.reset}`;
}

export function resolveAdapter(input: string): TargetAdapter | null {
  const normalized = input.trim().toLowerCase();
  for (const adapter of adapters) {
    if (adapter.id === normalized) return adapter;
    if (adapter.aliases.includes(normalized)) return adapter;
  }
  return null;
}

export function isQoderFamily(id: TargetId): boolean {
  return id === 'qoder' || id === 'qodercli';
}
