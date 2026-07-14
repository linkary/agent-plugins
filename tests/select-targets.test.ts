import { describe, expect, test } from 'bun:test';
import { getAdapters } from '../src/targets/adapters.js';
import { selectTargetAdapters } from '../src/targets/select-targets.js';

describe('select-targets', () => {
  test('resolves only from provided adapter list', async () => {
    const all = getAdapters();
    const subset = all.filter((adapter) => adapter.id === 'codex');
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
    const subset = all.filter((adapter) => adapter.id === 'cursor' || adapter.id === 'codex');
    const selected = await selectTargetAdapters({
      adapters: subset,
      flags: { target: 'all' },
      interactive: false,
      mode: 'multi',
      promptMessage: 'unused',
    });
    expect(selected.map((adapter) => adapter.id)).toEqual(['cursor', 'codex']);
  });

  test('auto-selects the only installed target without a prompt (non-interactive)', async () => {
    const adapters = getAdapters();
    const onlyCursor = adapters.filter((a) => a.id === 'cursor');
    const selected = await selectTargetAdapters({
      adapters,
      flags: {},
      interactive: false,
      mode: 'multi',
      promptMessage: 'unused',
      filterInstalled: async () => onlyCursor,
    });
    expect(selected.map((a) => a.id)).toEqual(['cursor']);
  });

  test('requires explicit target when multiple installed and non-interactive', async () => {
    const adapters = getAdapters();
    const twoInstalled = adapters.filter((a) => a.id === 'cursor' || a.id === 'codex');
    const selected = await selectTargetAdapters({
      adapters,
      flags: {},
      interactive: false,
      mode: 'multi',
      promptMessage: 'unused',
      filterInstalled: async () => twoInstalled,
    });
    expect(selected).toEqual([]);
  });

  test('--all-targets skips installed filtering (no auto-skip even with one installed)', async () => {
    const adapters = getAdapters();
    let filterCalled = false;
    const selected = await selectTargetAdapters({
      adapters,
      flags: { 'all-targets': true },
      interactive: false,
      mode: 'multi',
      promptMessage: 'unused',
      filterInstalled: async () => {
        filterCalled = true;
        return adapters.filter((a) => a.id === 'cursor');
      },
    });
    // allTargets bypasses the installed filter entirely; with >1 candidate and no TTY it cannot prompt.
    expect(filterCalled).toBe(false);
    expect(selected).toEqual([]);
  });

  test('falls back to all targets when nothing detected as installed', async () => {
    const adapters = getAdapters();
    // Nothing installed -> candidates = all -> >1 and non-interactive -> no auto-skip, cannot prompt.
    const selected = await selectTargetAdapters({
      adapters,
      flags: {},
      interactive: false,
      mode: 'multi',
      promptMessage: 'unused',
      filterInstalled: async () => [],
    });
    expect(selected).toEqual([]);
  });
});
