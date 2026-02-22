import { describe, expect, test } from 'bun:test';
import { ANSI } from '../src/util/ansi.js';
import {
  countByStatus,
  formatCountSummary,
  formatScopeTitle,
  formatStatusLabel,
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
});
