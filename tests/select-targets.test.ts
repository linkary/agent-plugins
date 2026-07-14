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

  test('--target all resolves to installed targets only', async () => {
    const all = getAdapters();
    const installedOnly = all.filter((a) => a.id === 'codex' || a.id === 'claude-code');
    const selected = await selectTargetAdapters({
      adapters: all,
      flags: { target: 'all' },
      interactive: false,
      mode: 'multi',
      promptMessage: 'unused',
      filterInstalled: async () => installedOnly,
    });
    expect(selected.map((a) => a.id)).toEqual(['codex', 'claude-code']);
  });

  test('--target all with --all-targets resolves to every known target', async () => {
    const all = getAdapters();
    let filterCalled = false;
    const selected = await selectTargetAdapters({
      adapters: all,
      flags: { target: 'all', 'all-targets': true },
      interactive: false,
      mode: 'multi',
      promptMessage: 'unused',
      filterInstalled: async () => {
        filterCalled = true;
        return [];
      },
    });
    expect(filterCalled).toBe(false);
    expect(selected.map((a) => a.id)).toEqual(all.map((a) => a.id));
  });

  test('an explicitly named target resolves even when not installed', async () => {
    const all = getAdapters();
    const selected = await selectTargetAdapters({
      adapters: all,
      flags: { target: 'opencode' },
      interactive: false,
      mode: 'multi',
      promptMessage: 'unused',
      filterInstalled: async () => [], // detection says nothing is installed
    });
    expect(selected.map((a) => a.id)).toEqual(['opencode']);
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
