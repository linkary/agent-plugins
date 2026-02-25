import { describe, expect, it } from 'bun:test';
import {
  normalizeRuleLines,
  shortHash,
  diffLines,
  mergeLines,
  serializeLines,
  type NormalizedLine,
} from '../src/util/global-rules-store.js';

describe('normalizeRuleLines', () => {
  it('splits, trims, deduplicates, and sorts lines', () => {
    const result = normalizeRuleLines('  C  \nA\nB\nA\n\n');
    expect(result.map((l) => l.content)).toEqual(['A', 'B', 'C']);
  });

  it('returns empty array for empty/whitespace-only input', () => {
    expect(normalizeRuleLines('')).toEqual([]);
    expect(normalizeRuleLines('   \n  \n')).toEqual([]);
  });

  it('produces deterministic hashes', () => {
    const a = normalizeRuleLines('hello');
    const b = normalizeRuleLines('  hello  ');
    expect(a[0]!.hash).toBe(b[0]!.hash);
    expect(a[0]!.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('treats different content as different hashes', () => {
    const [x, y] = normalizeRuleLines('alpha\nbeta');
    expect(x!.hash).not.toBe(y!.hash);
  });

  it('is idempotent: normalize(serialize(normalize(x))) === normalize(x)', () => {
    const input = '  C\nA \n B\nA\n';
    const first = normalizeRuleLines(input);
    const serialized = serializeLines(first);
    const second = normalizeRuleLines(serialized);
    expect(second).toEqual(first);
  });
});

describe('shortHash', () => {
  it('extracts first 8 hex chars after prefix', () => {
    expect(shortHash('sha256:abcdef1234567890')).toBe('abcdef12');
  });

  it('handles no prefix', () => {
    expect(shortHash('abcdef1234567890')).toBe('abcdef12');
  });
});

describe('diffLines', () => {
  const toLines = (contents: string[]): NormalizedLine[] =>
    normalizeRuleLines(contents.join('\n'));

  it('identifies onlyInA, onlyInB, and common', () => {
    const a = toLines(['A', 'B', 'C']);
    const b = toLines(['B', 'C', 'D']);
    const { onlyInA, onlyInB, common } = diffLines(a, b);

    expect(onlyInA.map((l) => l.content)).toEqual(['A']);
    expect(onlyInB.map((l) => l.content)).toEqual(['D']);
    expect(common.map((l) => l.content)).toEqual(['B', 'C']);
  });

  it('handles identical sets', () => {
    const a = toLines(['X', 'Y']);
    const b = toLines(['X', 'Y']);
    const { onlyInA, onlyInB, common } = diffLines(a, b);

    expect(onlyInA).toEqual([]);
    expect(onlyInB).toEqual([]);
    expect(common.map((l) => l.content)).toEqual(['X', 'Y']);
  });

  it('handles disjoint sets', () => {
    const a = toLines(['A']);
    const b = toLines(['Z']);
    const { onlyInA, onlyInB, common } = diffLines(a, b);

    expect(onlyInA.map((l) => l.content)).toEqual(['A']);
    expect(onlyInB.map((l) => l.content)).toEqual(['Z']);
    expect(common).toEqual([]);
  });

  it('handles empty inputs', () => {
    const empty: NormalizedLine[] = [];
    const a = toLines(['A']);
    expect(diffLines(empty, a).onlyInB).toEqual(a);
    expect(diffLines(a, empty).onlyInA).toEqual(a);
    expect(diffLines(empty, empty).common).toEqual([]);
  });
});

describe('mergeLines', () => {
  const toLines = (contents: string[]): NormalizedLine[] =>
    normalizeRuleLines(contents.join('\n'));

  it('unions two sets, deduplicates, and sorts', () => {
    const a = toLines(['A', 'B', 'C']);
    const b = toLines(['B', 'C', 'D']);
    const merged = mergeLines(a, b);
    expect(merged.map((l) => l.content)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('is commutative: merge(a,b) === merge(b,a)', () => {
    const a = toLines(['X', 'Y']);
    const b = toLines(['Y', 'Z']);
    expect(mergeLines(a, b)).toEqual(mergeLines(b, a));
  });

  it('is idempotent: merge(a,a) === a', () => {
    const a = toLines(['A', 'B']);
    expect(mergeLines(a, a)).toEqual(a);
  });

  it('handles empty sets', () => {
    const a = toLines(['A']);
    expect(mergeLines(a, [])).toEqual(a);
    expect(mergeLines([], a)).toEqual(a);
    expect(mergeLines([], [])).toEqual([]);
  });
});

describe('serializeLines', () => {
  it('joins with newline and adds trailing newline', () => {
    const lines = normalizeRuleLines('B\nA');
    expect(serializeLines(lines)).toBe('A\nB\n');
  });

  it('returns empty string for empty array', () => {
    expect(serializeLines([])).toBe('');
  });
});
