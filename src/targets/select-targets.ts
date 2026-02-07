import { resolveAdapter, type TargetAdapter } from './adapters.js';
import type { ParsedFlags } from '../util/options.js';
import { promptMultiSelect, promptSelect } from '../util/prompt.js';

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
}): Promise<TargetAdapter[]> {
  const { adapters, flags, interactive, mode, promptMessage } = params;

  let inputs = normalizeTargetFlag(flags.target);
  if (inputs.includes('all')) inputs = adapters.map((a) => a.id);

  if (inputs.length > 0) {
    const resolved: TargetAdapter[] = [];
    const unknown: string[] = [];
    for (const raw of inputs) {
      const adapter = resolveAdapter(raw);
      if (!adapter) unknown.push(raw);
      else resolved.push(adapter);
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

  if (!interactive) {
    process.stderr.write('Missing --target and no TTY available for interactive selection.\n');
    return [];
  }

  if (mode === 'single') {
    const id = await promptSelect({
      message: promptMessage,
      options: adapters.map((a) => ({ label: a.label, value: a.id })),
    });
    const adapter = adapters.find((a) => a.id === id);
    if (!adapter) {
      process.stderr.write('No target selected.\n');
      return [];
    }
    return [adapter];
  }

  // Multi mode: show list with all pre-selected
  const ids = await promptMultiSelect({
    message: promptMessage,
    options: adapters.map((a) => ({ label: a.label, value: a.id })),
    defaultSelected: [],
  });
  if (ids.length === 0) {
    process.stderr.write('No target selected.\n');
    return [];
  }

  const byId = new Map(adapters.map((a) => [a.id, a]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as TargetAdapter[];
}
