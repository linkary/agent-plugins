import { describe, expect, test } from 'bun:test';
import { ANSI } from '../src/util/ansi.js';
import {
  countByStatus,
  formatCountSummary,
  formatLocalTimestamp,
  formatSyncPromptOption,
  formatSize,
  formatScopeTitle,
  formatStatusLabel,
  formatSyncMetadataChange,
  formatSyncPromptLabel,
  groupEntriesByName,
  type StatusStyle,
} from '../src/util/sync-preview.js';

type Status = 'new' | 'replace' | 'same';
const STATUS_ORDER = ['new', 'replace', 'same'] as const;
const STATUS_STYLES: StatusStyle<Status> = {
  new: { color: 'green' },
  replace: { color: 'yellow' },
  same: { color: 'dim' },
};
const stripAnsi = (value: string) => value.replace(/\x1b\[[0-9;]*m/g, '');

describe('sync-preview utilities', () => {
  test('groups entries by name', () => {
    const grouped = groupEntriesByName([
      { name: 'a', value: 1 },
      { name: 'b', value: 2 },
      { name: 'a', value: 3 },
    ]);
    expect(grouped.get('a')?.map((item) => item.value)).toEqual([1, 3]);
    expect(grouped.get('b')?.map((item) => item.value)).toEqual([2]);
  });

  test('counts status values in declared order', () => {
    const counts = countByStatus(
      [{ status: 'new' as const }, { status: 'same' as const }, { status: 'new' as const }],
      STATUS_ORDER,
    );
    expect(counts).toEqual({ new: 2, replace: 0, same: 1 });
  });

  test('formats status and count summaries with zero filtering', () => {
    expect(formatStatusLabel('replace', STATUS_STYLES)).toBe(`${ANSI.yellow}replace${ANSI.reset}`);
    expect(formatCountSummary({ new: 2, replace: 0, same: 1 }, STATUS_ORDER, STATUS_STYLES)).toBe(
      `${ANSI.green}2 new${ANSI.reset}, ${ANSI.dim}1 same${ANSI.reset}`,
    );
    expect(formatCountSummary({ new: 0, replace: 0, same: 0 }, STATUS_ORDER, STATUS_STYLES)).toBe(
      `${ANSI.dim}0 changes${ANSI.reset}`,
    );
  });

  test('formats colored scope titles', () => {
    expect(formatScopeTitle(['global', 'global'])).toBe(`${ANSI.bold}${ANSI.brightBlue}global${ANSI.reset}`);
    expect(formatScopeTitle(['local'])).toBe(`${ANSI.bold}${ANSI.brightMagenta}local${ANSI.reset}`);
    expect(formatScopeTitle(['global', 'local'])).toBe(`${ANSI.bold}${ANSI.yellow}mixed${ANSI.reset}`);
  });

  test('formats size, timestamps, and metadata deltas concisely', () => {
    expect(formatSize(999)).toBe('999 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatLocalTimestamp(Date.UTC(2026, 3, 6, 14, 33), { timeZone: 'UTC' })).toBe('2026-04-06 14:33');
    const formatted = formatSyncMetadataChange(
      { sizeBytes: 1536, changedAtMs: Date.UTC(2026, 3, 1, 9, 12) },
      { sizeBytes: 3072, changedAtMs: Date.UTC(2026, 3, 6, 14, 33) },
      { timeZone: 'UTC' },
    );
    expect(stripAnsi(formatted)).toBe('1.5 KB 2026-04-01 09:12 -> 3 KB 2026-04-06 14:33');
    expect(formatted).toContain(`${ANSI.dim}2026-04-01 09:12${ANSI.reset}`);
    expect(formatted).toContain(`${ANSI.dim}2026-04-06 14:33${ANSI.reset}`);
  });

  test('formats single-target changed entries with side-by-side metadata', () => {
    const label = formatSyncPromptLabel({
      name: 'foo',
      entries: [
        {
          targetLabel: 'Cursor',
          status: 'replace',
          sourceMeta: { sizeBytes: 1200, changedAtMs: Date.UTC(2026, 3, 1, 9, 12) },
          targetMeta: { sizeBytes: 1800, changedAtMs: Date.UTC(2026, 3, 6, 14, 33) },
        },
      ],
      orderedStatuses: STATUS_ORDER,
      styles: STATUS_STYLES,
      unchangedStatus: 'same',
      timeZone: 'UTC',
    });

    expect(stripAnsi(label)).toBe('foo -> Cursor [replace] 1.2 KB 2026-04-01 09:12 -> 1.8 KB 2026-04-06 14:33');
  });

  test('formats multi-target grouped lines with changed segments only', () => {
    const label = formatSyncPromptLabel({
      name: 'foo',
      entries: [
        {
          targetLabel: 'Cursor',
          status: 'replace',
          sourceMeta: { sizeBytes: 12, changedAtMs: Date.UTC(2026, 3, 1, 9, 12) },
          targetMeta: { sizeBytes: 18, changedAtMs: Date.UTC(2026, 3, 6, 14, 33) },
        },
        {
          targetLabel: 'Claude',
          status: 'same',
        },
      ],
      orderedStatuses: STATUS_ORDER,
      styles: STATUS_STYLES,
      unchangedStatus: 'same',
      timeZone: 'UTC',
    });

    expect(stripAnsi(label)).toBe('foo [1 replace, 1 same] | Cursor [replace] 12 B 2026-04-01 09:12 -> 18 B 2026-04-06 14:33');
    expect(stripAnsi(label)).not.toContain('Claude');
  });

  test('keeps unchanged multi-target lines compact', () => {
    const label = formatSyncPromptLabel({
      name: 'foo',
      entries: [
        { targetLabel: 'Cursor', status: 'same' },
        { targetLabel: 'Claude', status: 'same' },
      ],
      orderedStatuses: STATUS_ORDER,
      styles: STATUS_STYLES,
      unchangedStatus: 'same',
    });

    expect(stripAnsi(label)).toBe('foo [2 same]');
  });

  test('switches to detail lines when more than one target changed', () => {
    const option = formatSyncPromptOption({
      name: 'foo',
      entries: [
        {
          targetLabel: 'Cursor',
          status: 'replace',
          sourceMeta: { sizeBytes: 12, changedAtMs: Date.UTC(2026, 3, 1, 9, 12) },
          targetMeta: { sizeBytes: 18, changedAtMs: Date.UTC(2026, 3, 6, 14, 33) },
        },
        {
          targetLabel: 'Claude Code',
          status: 'new',
          sourceMeta: { sizeBytes: 12, changedAtMs: Date.UTC(2026, 3, 1, 9, 12) },
        },
        {
          targetLabel: 'Codex',
          status: 'same',
        },
      ],
      orderedStatuses: STATUS_ORDER,
      styles: STATUS_STYLES,
      unchangedStatus: 'same',
      timeZone: 'UTC',
    });

    expect(stripAnsi(option.label)).toBe('foo [1 new, 1 replace, 1 same]');
    expect(option.detailLines?.map(stripAnsi)).toEqual([
      'Cursor [replace] 12 B 2026-04-01 09:12 -> 18 B 2026-04-06 14:33',
      'Claude Code [new] 12 B 2026-04-01 09:12',
    ]);
  });
});
