import type { Scope } from '../targets/adapters.js';
import { ANSI } from './ansi.js';

type AnsiColorName = 'green' | 'yellow' | 'dim' | 'red' | 'magenta' | 'gray';

export type StatusStyle<T extends string> = Record<T, { color: AnsiColorName; label?: string }>;

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
