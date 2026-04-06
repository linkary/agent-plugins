import { describe, expect, it } from 'bun:test';
import { orderMultiSelectOptions, type MultiSelectOption } from '../src/ui/multi-select.js';

function valuesOf<T extends string>(options: MultiSelectOption<T>[]): T[] {
  return options.map((option) => option.value);
}

describe('orderMultiSelectOptions', () => {
  const options: MultiSelectOption<'a' | 'b' | 'c' | 'd'>[] = [
    { label: 'Alpha', value: 'a' },
    { label: 'Beta', value: 'b' },
    { label: 'Charlie', value: 'c' },
    { label: 'Delta', value: 'd' },
  ];

  it('keeps order unchanged when no defaults are provided', () => {
    expect(valuesOf(orderMultiSelectOptions(options, undefined, true))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('moves default-selected options to the top while preserving within-group order', () => {
    expect(valuesOf(orderMultiSelectOptions(options, ['c', 'a'], true))).toEqual(['a', 'c', 'b', 'd']);
  });

  it('keeps order unchanged when defaultSelected is all', () => {
    expect(valuesOf(orderMultiSelectOptions(options, 'all', true))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores unknown default-selected values safely', () => {
    expect(valuesOf(orderMultiSelectOptions(options, ['z' as 'a'], true))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('preserves selected-first display order after filtering', () => {
    const ordered = orderMultiSelectOptions(
      [
        { label: 'Bravo', value: 'b' },
        { label: 'Beta', value: 'c' },
        { label: 'Alpha', value: 'a' },
      ],
      ['c'],
      true,
    );
    const filtered = ordered.filter((option) => option.label.toLowerCase().includes('b'));
    expect(valuesOf(filtered)).toEqual(['c', 'b']);
  });

  it('does not reorder when the opt-in flag is disabled', () => {
    expect(valuesOf(orderMultiSelectOptions(options, ['c', 'a'], false))).toEqual(['a', 'b', 'c', 'd']);
  });
});
