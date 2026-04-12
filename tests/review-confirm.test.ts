import { describe, expect, it } from 'bun:test';
import { getVisibleReviewLines } from '../src/ui/review-confirm.js';

describe('review-confirm paging', () => {
  it('shows the first page when offset is in range', () => {
    const page = getVisibleReviewLines(['a', 'b', 'c', 'd'], 1, 2);
    expect(page.offset).toBe(1);
    expect(page.end).toBe(3);
    expect(page.visibleLines).toEqual(['b', 'c']);
    expect(page.total).toBe(4);
  });

  it('clamps oversized offsets and preserves trailing entries', () => {
    const lines = Array.from({ length: 20 }, (_, index) => `line-${index + 1}`);
    const page = getVisibleReviewLines(lines, 99, 12);
    expect(page.offset).toBe(8);
    expect(page.end).toBe(20);
    expect(page.visibleLines[0]).toBe('line-9');
    expect(page.visibleLines.at(-1)).toBe('line-20');
  });
});
