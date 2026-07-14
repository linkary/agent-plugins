import { getColoredLabel, resolveAdapter, type TargetAdapter } from './adapters.js';
import type { ParsedFlags } from '../util/options.js';
import { promptMultiSelect, promptSelect } from '../util/prompt.js';
import { resolveCandidateAdapters } from './installed-targets.js';

export type TargetSelectionMode = 'single' | 'multi';

function normalizeTargetFlag(value: unknown): string[] {
  const parts: string[] = [];
  if (typeof value === 'string') parts.push(value);
  if (Array.isArray(value)) parts.push(...value.map(String));
  return parts
    .flatMap((p) => p.split(/[,，]/g))
    .map((p) => p.trim())
    .filter(Boolean);
}

export async function selectTargetAdapters(params: {
  adapters: TargetAdapter[];
  flags: ParsedFlags;
  interactive: boolean;
  mode: TargetSelectionMode;
  promptMessage: string;
  /** 可注入的已安装目标过滤器（默认基于文件系统检测），便于测试。 */
  filterInstalled?: (adapters: TargetAdapter[]) => Promise<TargetAdapter[]>;
}): Promise<TargetAdapter[]> {
  const { adapters, flags, interactive, mode, promptMessage } = params;
  const selectableById = new Map(adapters.map((adapter) => [adapter.id, adapter]));

  let inputs = normalizeTargetFlag(flags.target);
  if (inputs.includes('all')) inputs = adapters.map((a) => a.id);

  if (inputs.length > 0) {
    const resolved: TargetAdapter[] = [];
    const unknown: string[] = [];
    for (const raw of inputs) {
      const adapter = resolveAdapter(raw);
      if (!adapter) {
        unknown.push(raw);
        continue;
      }
      const selectable = selectableById.get(adapter.id);
      if (!selectable) {
        unknown.push(raw);
        continue;
      }
      resolved.push(selectable);
    }
    if (unknown.length > 0) {
      process.stderr.write(`Unknown target(s): ${unknown.join(', ')}\n`);
      process.stderr.write(`Known targets: ${adapters.map((a) => a.id).join(', ')}\n`);
      return [];
    }

    const dedup = new Map(resolved.map((a) => [a.id, a]));
    const unique = Array.from(dedup.values());

    if (mode === 'single' && unique.length > 1) {
      process.stderr.write(`Expected a single --target, got: ${unique.map((a) => a.id).join(', ')}\n`);
      return [];
    }

    return unique;
  }

  // 无显式 --target:默认只在「已安装」的目标中选择;--all-targets/-A 可列出全部。
  const allTargets = flags['all-targets'] === true;
  const { candidates, source } = await resolveCandidateAdapters(adapters, {
    allTargets,
    filterInstalled: params.filterInstalled,
  });
  if (source === 'fallback-empty') {
    // 未检测到任何已安装目标:回退到全部,避免无从选择。
    process.stderr.write('No installed targets detected; showing all targets.\n');
  }

  // 仅剩一个已安装目标时自动选择,跳过交互(通过 --all-targets 显式列出全部时不跳过)。
  if (source === 'installed' && candidates.length === 1) {
    const only = candidates[0];
    process.stdout.write(`Using target: ${getColoredLabel(only)} (only installed target)\n`);
    return [only];
  }

  if (!interactive) {
    process.stderr.write('Missing --target and no TTY available for interactive selection.\n');
    return [];
  }

  if (mode === 'single') {
    const id = await promptSelect({
      message: promptMessage,
      options: candidates.map((a) => ({ label: getColoredLabel(a), value: a.id })),
    });
    const adapter = candidates.find((a) => a.id === id);
    if (!adapter) {
      process.stderr.write('No target selected.\n');
      return [];
    }
    return [adapter];
  }

  // Multi mode: show installed targets (or all with --all-targets)
  const ids = await promptMultiSelect({
    message: promptMessage,
    options: candidates.map((a) => ({ label: getColoredLabel(a), value: a.id })),
    defaultSelected: [],
  });
  if (ids.length === 0) {
    process.stderr.write('No target selected.\n');
    return [];
  }

  return ids.map((id) => selectableById.get(id)).filter(Boolean) as TargetAdapter[];
}
