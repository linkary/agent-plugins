import { describe, expect, it } from 'bun:test';
import {
  parseRuleItems,
  dedupeAndSortItems,
  shortHash,
  diffItems,
  mergeItems,
  serializeItems,
  toRuleItem,
  displayItem,
  type RuleItem,
} from '../src/util/global-rules-store.js';

// 辅助: 快速构造 RuleItem[]
const toItems = (contents: string[]): RuleItem[] =>
  dedupeAndSortItems(contents.map(toRuleItem));

describe('parseRuleItems', () => {
  it('splits by blank lines and deduplicates', () => {
    const result = parseRuleItems('A\n\nB\n\nA');
    expect(result.map((i) => i.content)).toEqual(expect.arrayContaining(['A', 'B']));
    expect(result).toHaveLength(2);
  });

  it('preserves multi-line blocks as single items', () => {
    const input = 'Prefer FP:\n- Pure functions\n- Immutability\n\nUse single quotes';
    const result = parseRuleItems(input);
    expect(result).toHaveLength(2);
    const fp = result.find((i) => i.content.startsWith('Prefer FP'));
    expect(fp).toBeDefined();
    expect(fp!.content).toBe('Prefer FP:\n- Pure functions\n- Immutability');
  });

  it('returns empty array for empty/whitespace-only input', () => {
    expect(parseRuleItems('')).toEqual([]);
    expect(parseRuleItems('   \n  \n')).toEqual([]);
  });

  it('produces deterministic hashes', () => {
    const a = parseRuleItems('hello');
    const b = parseRuleItems('  hello  ');
    expect(a[0]!.hash).toBe(b[0]!.hash);
    expect(a[0]!.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('treats different content as different hashes', () => {
    const items = parseRuleItems('alpha\n\nbeta');
    expect(items[0]!.hash).not.toBe(items[1]!.hash);
  });

  it('is idempotent: parse(serialize(parse(x))) === parse(x)', () => {
    const input = 'C\n\nA\n\nB\n\nA';
    const first = parseRuleItems(input);
    const serialized = serializeItems(first);
    const second = parseRuleItems(serialized);
    expect(second).toEqual(first);
  });

  it('sorts items by hash', () => {
    const items = parseRuleItems('Zebra\n\nAlpha\n\nMiddle');
    const hashes = items.map((i) => i.hash);
    expect(hashes).toEqual([...hashes].sort());
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

describe('displayItem', () => {
  it('shows single-line content as-is', () => {
    const item = toRuleItem('Use single quotes');
    expect(displayItem(item)).toBe('Use single quotes');
  });

  it('shows first line + line count for multi-line items', () => {
    const item = toRuleItem('Prefer FP:\n- Pure functions\n- Immutability');
    const display = displayItem(item);
    expect(display).toContain('Prefer FP:');
    expect(display).toContain('(3 lines)');
  });
});

describe('diffItems', () => {
  it('identifies onlyInA, onlyInB, and common', () => {
    const a = toItems(['A', 'B', 'C']);
    const b = toItems(['B', 'C', 'D']);
    const { onlyInA, onlyInB, common } = diffItems(a, b);

    expect(onlyInA.map((i) => i.content)).toEqual(['A']);
    expect(onlyInB.map((i) => i.content)).toEqual(['D']);
    expect(common.map((i) => i.content).sort()).toEqual(['B', 'C']);
  });

  it('handles identical sets', () => {
    const a = toItems(['X', 'Y']);
    const b = toItems(['X', 'Y']);
    const { onlyInA, onlyInB, common } = diffItems(a, b);

    expect(onlyInA).toEqual([]);
    expect(onlyInB).toEqual([]);
    expect(common).toHaveLength(2);
  });

  it('handles disjoint sets', () => {
    const a = toItems(['A']);
    const b = toItems(['Z']);
    const { onlyInA, onlyInB, common } = diffItems(a, b);

    expect(onlyInA.map((i) => i.content)).toEqual(['A']);
    expect(onlyInB.map((i) => i.content)).toEqual(['Z']);
    expect(common).toEqual([]);
  });

  it('handles empty inputs', () => {
    const empty: RuleItem[] = [];
    const a = toItems(['A']);
    expect(diffItems(empty, a).onlyInB).toEqual(a);
    expect(diffItems(a, empty).onlyInA).toEqual(a);
    expect(diffItems(empty, empty).common).toEqual([]);
  });
});

describe('mergeItems', () => {
  it('unions two sets, deduplicates, and sorts by hash', () => {
    const a = toItems(['A', 'B', 'C']);
    const b = toItems(['B', 'C', 'D']);
    const merged = mergeItems(a, b);
    expect(merged.map((i) => i.content).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('is commutative: merge(a,b) === merge(b,a)', () => {
    const a = toItems(['X', 'Y']);
    const b = toItems(['Y', 'Z']);
    expect(mergeItems(a, b)).toEqual(mergeItems(b, a));
  });

  it('is idempotent: merge(a,a) === a', () => {
    const a = toItems(['A', 'B']);
    expect(mergeItems(a, a)).toEqual(a);
  });

  it('handles empty sets', () => {
    const a = toItems(['A']);
    expect(mergeItems(a, [])).toEqual(a);
    expect(mergeItems([], a)).toEqual(a);
    expect(mergeItems([], [])).toEqual([]);
  });
});

describe('serializeItems', () => {
  it('joins with double newline and adds trailing newline', () => {
    const items = toItems(['B', 'A']);
    const serialized = serializeItems(items);
    expect(serialized).toContain('A\n\nB\n');
    expect(serialized.endsWith('\n')).toBe(true);
  });

  it('returns empty string for empty array', () => {
    expect(serializeItems([])).toBe('');
  });

  it('preserves multi-line content within items', () => {
    const items = [toRuleItem('Line 1\nLine 2'), toRuleItem('Single')];
    const serialized = serializeItems(dedupeAndSortItems(items));
    expect(serialized).toContain('Line 1\nLine 2');
    expect(serialized).toContain('Single');
  });
});
