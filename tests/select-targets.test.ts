import { describe, expect, test } from 'bun:test';
import { getAdapters } from '../src/targets/adapters.js';
import { selectTargetAdapters } from '../src/targets/select-targets.js';

describe('select-targets', () => {
  test('resolves only from provided adapter list', async () => {
    const all = getAdapters();
    const subset = all.filter((adapter) => adapter.id === 'gemini');
    const selected = await selectTargetAdapters({
      adapters: subset,
      flags: { target: 'cursor' },
      interactive: false,
      mode: 'single',
      promptMessage: 'unused',
    });
    expect(selected).toEqual([]);
  });

  test('supports --target=all against provided adapter list', async () => {
    const all = getAdapters();
    const subset = all.filter((adapter) => adapter.id === 'cursor' || adapter.id === 'gemini');
    const selected = await selectTargetAdapters({
      adapters: subset,
      flags: { target: 'all' },
      interactive: false,
      mode: 'multi',
      promptMessage: 'unused',
    });
    expect(selected.map((adapter) => adapter.id)).toEqual(['cursor', 'gemini']);
  });
});
