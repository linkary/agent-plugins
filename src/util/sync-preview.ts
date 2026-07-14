import type { Scope } from '../targets/adapters.js';
import { ANSI } from './ansi.js';

type AnsiColorName = 'green' | 'yellow' | 'dim' | 'red' | 'magenta' | 'gray';

export type StatusStyle<T extends string> = Record<T, { color: AnsiColorName; label?: string }>;
export type SyncItemMetadata = {
  sizeBytes: number;
  changedAtMs: number;
};

export type SyncPromptEntry<T extends string> = {
  targetLabel: string;
  status: T;
  sourceMeta?: SyncItemMetadata | null;
  targetMeta?: SyncItemMetadata | null;
};

export type SyncPromptDisplay = {
  label: string;
  detailLines?: string[];
};

const COLOR_START: Record<AnsiColorName, string> = {
  green: ANSI.green,
  yellow: ANSI.yellow,
  dim: ANSI.dim,
  red: ANSI.red,
  magenta: ANSI.magenta,
  gray: ANSI.gray,
};

function colorize(text: string, color: AnsiColorName): string {
  return `${COLOR_START[color]}${text}${ANSI.reset}`;
}

export function groupEntriesByName<T extends { name: string }>(entries: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.name);
    if (list) list.push(entry);
    else grouped.set(entry.name, [entry]);
  }
  return grouped;
}

export function formatScopeTitle(scopes: Scope[]): string {
  const uniqueScopes = [...new Set(scopes)];
  if (uniqueScopes.length === 1) {
    if (uniqueScopes[0] === 'global') return `${ANSI.bold}${ANSI.brightBlue}global${ANSI.reset}`;
    return `${ANSI.bold}${ANSI.brightMagenta}local${ANSI.reset}`;
  }
  return `${ANSI.bold}${ANSI.yellow}mixed${ANSI.reset}`;
}

export function countByStatus<T extends string>(
  entries: Array<{ status: T }>,
  orderedStatuses: readonly T[],
): Record<T, number> {
  const counts = Object.fromEntries(orderedStatuses.map((status) => [status, 0])) as Record<T, number>;
  for (const entry of entries) counts[entry.status] += 1;
  return counts;
}

export function formatStatusLabel<T extends string>(status: T, styles: StatusStyle<T>): string {
  const style = styles[status];
  return colorize(style.label ?? status, style.color);
}

export function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  if (unitIndex === 0) return `${Math.round(value)} ${units[unitIndex]}`;
  const rounded = Math.round(value * 10) / 10;
  const display = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  return `${display} ${units[unitIndex]}`;
}

export function formatLocalTimestamp(timestampMs: number, options?: { timeZone?: string }): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: options?.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestampMs));

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}

export function formatSyncMetadata(meta: SyncItemMetadata, options?: { timeZone?: string }): string {
  return `${formatSize(meta.sizeBytes)} ${colorize(formatLocalTimestamp(meta.changedAtMs, options), 'dim')}`;
}

export function formatSyncMetadataChange(
  sourceMeta: SyncItemMetadata,
  targetMeta?: SyncItemMetadata | null,
  options?: { timeZone?: string },
): string {
  const source = formatSyncMetadata(sourceMeta, options);
  if (!targetMeta) return source;
  return `${source} → ${formatSyncMetadata(targetMeta, options)}`;
}

export function formatChangedTargetSegment<T extends string>(params: {
  targetLabel: string;
  status: T;
  styles: StatusStyle<T>;
  sourceMeta: SyncItemMetadata;
  targetMeta?: SyncItemMetadata | null;
  timeZone?: string;
}): string {
  return `${params.targetLabel} [${formatStatusLabel(params.status, params.styles)}] ${formatSyncMetadataChange(
    params.sourceMeta,
    params.targetMeta,
    { timeZone: params.timeZone },
  )}`;
}

export function formatCountSummary<T extends string>(
  counts: Partial<Record<T, number>>,
  orderedStatuses: readonly T[],
  styles: StatusStyle<T>,
  options?: { emptyLabel?: string },
): string {
  const parts: string[] = [];
  for (const status of orderedStatuses) {
    const count = counts[status] ?? 0;
    if (count <= 0) continue;
    const style = styles[status];
    const label = style.label ?? status;
    parts.push(colorize(`${count} ${label}`, style.color));
  }
  if (parts.length === 0) return colorize(options?.emptyLabel ?? '0 changes', 'dim');
  return parts.join(', ');
}

export function formatSyncPromptLabel<T extends string>(params: {
  name: string;
  entries: SyncPromptEntry<T>[];
  orderedStatuses: readonly T[];
  styles: StatusStyle<T>;
  unchangedStatus: T;
  timeZone?: string;
}): string {
  const display = formatSyncPromptOption(params);
  if (!display.detailLines?.length) return display.label;
  return `${display.label} | ${display.detailLines.join(' | ')}`;
}

export function formatSyncPromptOption<T extends string>(params: {
  name: string;
  entries: SyncPromptEntry<T>[];
  orderedStatuses: readonly T[];
  styles: StatusStyle<T>;
  unchangedStatus: T;
  timeZone?: string;
}): SyncPromptDisplay {
  const summary = formatCountSummary(
    countByStatus(params.entries, params.orderedStatuses),
    params.orderedStatuses,
    params.styles,
  );

  if (params.entries.length === 1) {
    const [entry] = params.entries;
    if (!entry) return { label: params.name };
    if (entry.status === params.unchangedStatus || !entry.sourceMeta) {
      return { label: `${params.name} → ${entry.targetLabel} [${formatStatusLabel(entry.status, params.styles)}]` };
    }
    return {
      label: `${params.name} → ${formatChangedTargetSegment({
        targetLabel: entry.targetLabel,
        status: entry.status,
        styles: params.styles,
        sourceMeta: entry.sourceMeta,
        targetMeta: entry.targetMeta,
        timeZone: params.timeZone,
      })}`,
    };
  }

  const changedSegments = params.entries
    .filter((entry) => entry.status !== params.unchangedStatus && entry.sourceMeta)
    .map((entry) =>
      formatChangedTargetSegment({
        targetLabel: entry.targetLabel,
        status: entry.status,
        styles: params.styles,
        sourceMeta: entry.sourceMeta!,
        targetMeta: entry.targetMeta,
        timeZone: params.timeZone,
      }),
    );

  if (changedSegments.length === 0) return { label: `${params.name} [${summary}]` };
  if (changedSegments.length === 1) return { label: `${params.name} [${summary}] | ${changedSegments[0]}` };
  return {
    label: `${params.name} [${summary}]`,
    detailLines: changedSegments,
  };
}
