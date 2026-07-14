import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { getAdapters } from '../src/targets/adapters.js';
import {
  filterInstalledAdapters,
  isTargetInstalled,
  makeBinOnPath,
  resolveCandidateAdapters,
} from '../src/targets/installed-targets.js';

const HOME = '/home/tester';

function adapterById(id: string) {
  const found = getAdapters().find((a) => a.id === id);
  if (!found) throw new Error(`missing adapter: ${id}`);
  return found;
}

const noExists = async () => false;
const noBin = async () => false;
const binIs = (wanted: string) => async (name: string) => name === wanted;
const pathIn = (wanted: string[]) => async (p: string) => wanted.includes(p);

describe('isTargetInstalled', () => {
  test('alwaysAvailable adapter (agents) is installed regardless of evidence', async () => {
    expect(
      await isTargetInstalled(adapterById('agents'), {
        homeDir: HOME,
        platform: 'linux',
        env: {},
        exists: noExists,
        binOnPath: noBin,
      }),
    ).toBe(true);
  });

  test('CLI tool detected via binary on PATH', async () => {
    const deps = { homeDir: HOME, platform: 'linux' as const, env: {}, exists: noExists, binOnPath: binIs('claude') };
    expect(await isTargetInstalled(adapterById('claude-code'), deps)).toBe(true);
    // codex bin is `codex`; nothing else counts -> not installed
    expect(await isTargetInstalled(adapterById('codex'), deps)).toBe(false);
  });

  test('GUI IDE (Cursor) detected only via app bundle on macOS', async () => {
    expect(
      await isTargetInstalled(adapterById('cursor'), {
        homeDir: HOME,
        platform: 'darwin',
        env: {},
        exists: pathIn(['/Applications/Cursor.app']),
        binOnPath: noBin,
      }),
    ).toBe(true);
  });

  test('REGRESSION: Cursor NOT installed when only leftovers remain (uninstalled .app)', async () => {
    // Leftovers that survive uninstall: ~/.cursor/extensions, app-data dir, and a `cursor` CLI shim on PATH.
    const installed = await isTargetInstalled(adapterById('cursor'), {
      homeDir: HOME,
      platform: 'darwin',
      env: {},
      exists: pathIn([
        path.join(HOME, '.cursor', 'extensions'),
        path.join(HOME, 'Library', 'Application Support', 'Cursor'),
        path.join(HOME, '.local', 'bin', 'cursor'),
      ]),
      binOnPath: binIs('cursor'), // the leftover shim resolves on PATH
    });
    expect(installed).toBe(false); // macOS keys off /Applications/Cursor.app only
  });

  test('REGRESSION: OpenCode NOT installed when only leftover data dir remains', async () => {
    // ~/.local/share/opencode and ~/.config/opencode survive uninstall; must be ignored.
    const installed = await isTargetInstalled(adapterById('opencode'), {
      homeDir: HOME,
      platform: 'linux',
      env: {},
      exists: pathIn([
        path.join(HOME, '.local', 'share', 'opencode', 'auth.json'),
        path.join(HOME, '.local', 'share', 'opencode'),
        path.join(HOME, '.config', 'opencode'),
        path.join(HOME, '.opencode'),
        path.join(HOME, '.opencode', 'skills'),
      ]),
      binOnPath: noBin, // binary already removed by uninstall
    });
    expect(installed).toBe(false);
  });

  test('OpenCode detected via installer binary ~/.opencode/bin/opencode', async () => {
    expect(
      await isTargetInstalled(adapterById('opencode'), {
        homeDir: HOME,
        platform: 'linux',
        env: {},
        exists: pathIn([path.join(HOME, '.opencode', 'bin', 'opencode')]),
        binOnPath: noBin,
      }),
    ).toBe(true);
  });

  test('undetectable adapter with no evidence is not installed', async () => {
    expect(
      await isTargetInstalled(adapterById('qodercli'), {
        homeDir: HOME,
        platform: 'linux',
        env: {},
        exists: noExists,
        binOnPath: noBin,
      }),
    ).toBe(false);
  });

  test('Windows: Qoder detected via %LOCALAPPDATA%\\Programs install path', async () => {
    const localAppData = 'C:\\Users\\t\\AppData\\Local';
    const qoderExe = path.join(localAppData, 'Programs', 'Qoder', 'Qoder.exe');
    expect(
      await isTargetInstalled(adapterById('qoder'), {
        homeDir: 'C:\\Users\\t',
        platform: 'win32',
        env: { LOCALAPPDATA: localAppData },
        exists: pathIn([qoderExe]),
        binOnPath: noBin,
      }),
    ).toBe(true);
  });
});

describe('makeBinOnPath', () => {
  test('unix: finds a binary in a PATH directory', async () => {
    const fn = makeBinOnPath({ PATH: '/usr/bin:/usr/local/bin' }, 'linux', pathIn(['/usr/local/bin/codex']));
    expect(await fn('codex')).toBe(true);
    expect(await fn('missing')).toBe(false);
  });

  test('win32: honors PATHEXT extensions', async () => {
    const dir = 'C:\\bin';
    const fn = makeBinOnPath({ PATH: dir, PATHEXT: '.EXE;.CMD' }, 'win32', pathIn([path.join(dir, 'qodercli.CMD')]));
    expect(await fn('qodercli')).toBe(true);
    expect(await fn('nope')).toBe(false);
  });
});

describe('filterInstalledAdapters', () => {
  test('keeps detected + alwaysAvailable, drops the rest, preserves order', async () => {
    // Only `claude` on PATH; agents is alwaysAvailable.
    const result = await filterInstalledAdapters(getAdapters(), {
      homeDir: HOME,
      platform: 'linux',
      env: {},
      exists: noExists,
      binOnPath: binIs('claude'),
    });
    expect(result.map((a) => a.id)).toEqual(['claude-code', 'agents']);
  });
});

describe('resolveCandidateAdapters', () => {
  const all = getAdapters();
  const two = all.filter((a) => a.id === 'cursor' || a.id === 'codex');

  test('allTargets bypasses the installed filter', async () => {
    let called = false;
    const res = await resolveCandidateAdapters(all, {
      allTargets: true,
      filterInstalled: async () => {
        called = true;
        return two;
      },
    });
    expect(called).toBe(false);
    expect(res.source).toBe('all-flag');
    expect(res.candidates).toEqual(all);
  });

  test('narrows to installed targets', async () => {
    const res = await resolveCandidateAdapters(all, { allTargets: false, filterInstalled: async () => two });
    expect(res.source).toBe('installed');
    expect(res.candidates.map((a) => a.id)).toEqual(['cursor', 'codex']);
  });

  test('falls back to all when nothing installed', async () => {
    const res = await resolveCandidateAdapters(all, { allTargets: false, filterInstalled: async () => [] });
    expect(res.source).toBe('fallback-empty');
    expect(res.candidates).toEqual(all);
  });
});
