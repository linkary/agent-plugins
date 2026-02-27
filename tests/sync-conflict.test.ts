/**
 * Unit tests for the shared conflict resolver (sync-conflict.ts).
 *
 * Tests all conflict resolution options:
 *   o: Overwrite (single)
 *   b: Backup & overwrite (single)
 *   s: Skip (single)
 *   O: Overwrite all (batch)
 *   B: Backup all (batch)
 *   S: Skip all (batch)
 *   q: Quit
 *
 * Also tests: force mode, non-interactive, managed-clean, supportBackup=false.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { TargetAdapter } from '../src/targets/adapters.js';

// ─── Mock promptChoice ──────────────────────────────────────────────
let mockChoiceQueue: string[] = [];

mock.module('../src/util/prompt.js', () => ({
  promptChoice: async () => {
    const choice = mockChoiceQueue.shift();
    if (!choice) throw new Error('promptChoice called but no mock choice queued');
    return choice;
  },
  // Re-export other prompt functions as no-ops (not used by sync-conflict)
  promptMultiSelect: async () => [],
}));

// Import AFTER mocking
const { createConflictResolver } = await import('../src/util/sync-conflict.js');

// ─── Test adapter stub ──────────────────────────────────────────────
const stubAdapter: TargetAdapter = {
  id: 'cursor',
  label: 'Cursor',
  color: '',
  aliases: ['cursor'],
  resolveSkillsDir: () => '',
  resolveAgentsDir: () => '',
  resolveCommandsDir: () => '',
  resolveRulesDir: () => '',
};

beforeEach(() => {
  mockChoiceQueue = [];
});

describe('createConflictResolver', () => {
  // ─── Force mode ─────────────────────────────────────────────────

  describe('force mode', () => {
    it('returns overwrite without prompting', async () => {
      const resolver = createConflictResolver({ interactive: true, force: true });
      const action = await resolver.resolve('alpha', stubAdapter, 'old-hash', 'new-hash');
      expect(action).toBe('overwrite');
    });

    it('returns overwrite for every call', async () => {
      const resolver = createConflictResolver({ interactive: true, force: true });
      expect(await resolver.resolve('a', stubAdapter, undefined, 'h1')).toBe('overwrite');
      expect(await resolver.resolve('b', stubAdapter, 'x', 'y')).toBe('overwrite');
      expect(await resolver.resolve('c', stubAdapter, 'z', 'z')).toBe('overwrite');
    });
  });

  // ─── Managed-clean auto-overwrite ─────────────────────────────

  describe('managed-clean', () => {
    it('auto-overwrites when lastHash matches currentHash', async () => {
      const resolver = createConflictResolver({ interactive: true, force: false });
      const action = await resolver.resolve('alpha', stubAdapter, 'abc123', 'abc123');
      expect(action).toBe('overwrite');
    });

    it('does not auto-overwrite when hashes differ', async () => {
      mockChoiceQueue = ['o'];
      const resolver = createConflictResolver({ interactive: true, force: false });
      const action = await resolver.resolve('alpha', stubAdapter, 'old', 'new');
      expect(action).toBe('overwrite');
    });

    it('does not auto-overwrite when lastHash is undefined (never synced)', async () => {
      mockChoiceQueue = ['s'];
      const resolver = createConflictResolver({ interactive: true, force: false });
      const action = await resolver.resolve('alpha', stubAdapter, undefined, 'new');
      expect(action).toBe('skip');
    });
  });

  // ─── Non-interactive ──────────────────────────────────────────

  describe('non-interactive', () => {
    it('returns quit on unmanaged conflict', async () => {
      const resolver = createConflictResolver({ interactive: false, force: false });
      const action = await resolver.resolve('alpha', stubAdapter, 'old', 'new');
      expect(action).toBe('quit');
    });

    it('still auto-overwrites managed-clean even in non-interactive', async () => {
      const resolver = createConflictResolver({ interactive: false, force: false });
      const action = await resolver.resolve('alpha', stubAdapter, 'same', 'same');
      expect(action).toBe('overwrite');
    });
  });

  // ─── Single actions (o, b, s) ─────────────────────────────────

  describe('single actions', () => {
    it('o → overwrite', async () => {
      mockChoiceQueue = ['o'];
      const resolver = createConflictResolver({ interactive: true, force: false });
      expect(await resolver.resolve('x', stubAdapter, 'a', 'b')).toBe('overwrite');
    });

    it('b → backup', async () => {
      mockChoiceQueue = ['b'];
      const resolver = createConflictResolver({ interactive: true, force: false });
      expect(await resolver.resolve('x', stubAdapter, 'a', 'b')).toBe('backup');
    });

    it('s → skip', async () => {
      mockChoiceQueue = ['s'];
      const resolver = createConflictResolver({ interactive: true, force: false });
      expect(await resolver.resolve('x', stubAdapter, 'a', 'b')).toBe('skip');
    });

    it('q → quit', async () => {
      mockChoiceQueue = ['q'];
      const resolver = createConflictResolver({ interactive: true, force: false });
      expect(await resolver.resolve('x', stubAdapter, 'a', 'b')).toBe('quit');
    });

    it('single actions do not affect subsequent calls', async () => {
      mockChoiceQueue = ['o', 's'];
      const resolver = createConflictResolver({ interactive: true, force: false });
      expect(await resolver.resolve('x', stubAdapter, 'a', 'b')).toBe('overwrite');
      // Second call still prompts (not batch)
      expect(await resolver.resolve('y', stubAdapter, 'c', 'd')).toBe('skip');
    });
  });

  // ─── Batch actions (O, B, S) ──────────────────────────────────

  describe('batch actions', () => {
    it('O → overwrite all (current + subsequent)', async () => {
      mockChoiceQueue = ['O'];
      const resolver = createConflictResolver({ interactive: true, force: false });
      expect(await resolver.resolve('x', stubAdapter, 'a', 'b')).toBe('overwrite');
      // Subsequent calls should auto-overwrite without prompting
      expect(await resolver.resolve('y', stubAdapter, 'c', 'd')).toBe('overwrite');
      expect(await resolver.resolve('z', stubAdapter, 'e', 'f')).toBe('overwrite');
    });

    it('B → backup all (current + subsequent)', async () => {
      mockChoiceQueue = ['B'];
      const resolver = createConflictResolver({ interactive: true, force: false });
      expect(await resolver.resolve('x', stubAdapter, 'a', 'b')).toBe('backup');
      expect(await resolver.resolve('y', stubAdapter, 'c', 'd')).toBe('backup');
    });

    it('S → skip all (current + subsequent)', async () => {
      mockChoiceQueue = ['S'];
      const resolver = createConflictResolver({ interactive: true, force: false });
      expect(await resolver.resolve('x', stubAdapter, 'a', 'b')).toBe('skip');
      expect(await resolver.resolve('y', stubAdapter, 'c', 'd')).toBe('skip');
    });
  });

  // ─── supportBackup: false (MCP mode) ─────────────────────────

  describe('supportBackup: false', () => {
    it('o → overwrite', async () => {
      mockChoiceQueue = ['o'];
      const resolver = createConflictResolver({ interactive: true, force: false, supportBackup: false });
      expect(await resolver.resolve('x', stubAdapter, 'a', 'b')).toBe('overwrite');
    });

    it('s → skip', async () => {
      mockChoiceQueue = ['s'];
      const resolver = createConflictResolver({ interactive: true, force: false, supportBackup: false });
      expect(await resolver.resolve('x', stubAdapter, 'a', 'b')).toBe('skip');
    });

    it('O → overwrite all', async () => {
      mockChoiceQueue = ['O'];
      const resolver = createConflictResolver({ interactive: true, force: false, supportBackup: false });
      expect(await resolver.resolve('x', stubAdapter, 'a', 'b')).toBe('overwrite');
      expect(await resolver.resolve('y', stubAdapter, 'c', 'd')).toBe('overwrite');
    });

    it('S → skip all', async () => {
      mockChoiceQueue = ['S'];
      const resolver = createConflictResolver({ interactive: true, force: false, supportBackup: false });
      expect(await resolver.resolve('x', stubAdapter, 'a', 'b')).toBe('skip');
      expect(await resolver.resolve('y', stubAdapter, 'c', 'd')).toBe('skip');
    });

    it('B is not treated as backup when supportBackup=false', async () => {
      // If somehow 'B' is returned it should fall through to skip
      mockChoiceQueue = ['B'];
      const resolver = createConflictResolver({ interactive: true, force: false, supportBackup: false });
      expect(await resolver.resolve('x', stubAdapter, 'a', 'b')).toBe('skip');
    });
  });

  // ─── Mixed scenarios ──────────────────────────────────────────

  describe('mixed scenarios', () => {
    it('managed-clean items skip prompting even in ask mode', async () => {
      mockChoiceQueue = ['s']; // Only one prompt needed
      const resolver = createConflictResolver({ interactive: true, force: false });
      // First: managed-clean (no prompt)
      expect(await resolver.resolve('a', stubAdapter, 'h1', 'h1')).toBe('overwrite');
      // Second: real conflict (prompts)
      expect(await resolver.resolve('b', stubAdapter, 'old', 'new')).toBe('skip');
    });

    it('batch mode applies to all subsequent non-managed items', async () => {
      mockChoiceQueue = ['O']; // Overwrite all
      const resolver = createConflictResolver({ interactive: true, force: false });
      // All should be overwrite regardless
      expect(await resolver.resolve('a', stubAdapter, 'old', 'new')).toBe('overwrite');
      expect(await resolver.resolve('b', stubAdapter, undefined, 'new')).toBe('overwrite');
      expect(await resolver.resolve('c', stubAdapter, 'x', 'x')).toBe('overwrite');
    });
  });
});
