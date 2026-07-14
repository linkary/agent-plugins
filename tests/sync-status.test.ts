import { describe, expect, it } from 'bun:test';
import { classifySyncStatus, isAutoApplyStatus, isGatedStatus } from '../src/util/sync-status.js';

// H0 = 上次同步时两侧一致的基线内容；H1/H2 = 各自独立改动后的内容。
const H0 = 'sha256:0000';
const H1 = 'sha256:1111';
const H2 = 'sha256:2222';

describe('classifySyncStatus', () => {
  it('returns new when dest is absent (baseline irrelevant)', () => {
    expect(classifySyncStatus({ destExists: false, srcHash: H1 })).toBe('new');
    expect(classifySyncStatus({ destExists: false, srcHash: H1, baselineHash: H0 })).toBe('new');
  });

  it('returns same when both sides match, regardless of baseline', () => {
    expect(classifySyncStatus({ destExists: true, srcHash: H1, destHash: H1 })).toBe('same');
    expect(classifySyncStatus({ destExists: true, srcHash: H1, destHash: H1, baselineHash: H0 })).toBe('same');
  });

  it('returns replace when only the source moved (dest still equals baseline)', () => {
    expect(classifySyncStatus({ destExists: true, srcHash: H1, destHash: H0, baselineHash: H0 })).toBe('replace');
  });

  it('returns dest-ahead when only the dest moved (source still equals baseline)', () => {
    expect(classifySyncStatus({ destExists: true, srcHash: H0, destHash: H1, baselineHash: H0 })).toBe('dest-ahead');
  });

  it('returns conflict when both sides moved away from baseline', () => {
    expect(classifySyncStatus({ destExists: true, srcHash: H1, destHash: H2, baselineHash: H0 })).toBe('conflict');
  });

  it('returns conflict when the two sides differ but there is no baseline to arbitrate', () => {
    expect(classifySyncStatus({ destExists: true, srcHash: H1, destHash: H2 })).toBe('conflict');
  });

  it('falls back to conflict when dest exists but cannot be hashed and baseline does not clear the source', () => {
    expect(classifySyncStatus({ destExists: true, srcHash: H1, destHash: undefined, baselineHash: H0 })).toBe(
      'conflict',
    );
  });

  it('treats an unhashable dest as dest-ahead when the source is still clean', () => {
    expect(classifySyncStatus({ destExists: true, srcHash: H0, destHash: undefined, baselineHash: H0 })).toBe(
      'dest-ahead',
    );
  });

  // 方向无关性：同一底层状态在 collect / sync 两个方向下的表现。
  describe('direction-normalized regressions', () => {
    it('collect: edited-in-tool, hub untouched -> replace (NOT conflict)', () => {
      // source = target(H1), dest = central(H0), baseline = H0
      expect(classifySyncStatus({ destExists: true, srcHash: H1, destHash: H0, baselineHash: H0 })).toBe('replace');
    });

    it('collect: both target and hub edited independently -> conflict', () => {
      // source = target(H1), dest = central(H2), baseline = H0
      expect(classifySyncStatus({ destExists: true, srcHash: H1, destHash: H2, baselineHash: H0 })).toBe('conflict');
    });

    it('collect: only hub edited, target untouched -> dest-ahead (pulling would discard hub edits)', () => {
      // source = target(H0), dest = central(H1), baseline = H0
      expect(classifySyncStatus({ destExists: true, srcHash: H0, destHash: H1, baselineHash: H0 })).toBe('dest-ahead');
    });

    it('sync: central edited, target untouched -> replace', () => {
      // source = central(H1), dest = target(H0), baseline = H0
      expect(classifySyncStatus({ destExists: true, srcHash: H1, destHash: H0, baselineHash: H0 })).toBe('replace');
    });

    it('sync: target edited, central untouched -> dest-ahead (did you mean collect?)', () => {
      // source = central(H0), dest = target(H1), baseline = H0
      expect(classifySyncStatus({ destExists: true, srcHash: H0, destHash: H1, baselineHash: H0 })).toBe('dest-ahead');
    });
  });
});

describe('status gates', () => {
  it('marks new and replace as auto-apply', () => {
    expect(isAutoApplyStatus('new')).toBe(true);
    expect(isAutoApplyStatus('replace')).toBe(true);
    expect(isAutoApplyStatus('same')).toBe(false);
    expect(isAutoApplyStatus('dest-ahead')).toBe(false);
    expect(isAutoApplyStatus('conflict')).toBe(false);
  });

  it('marks dest-ahead and conflict as gated', () => {
    expect(isGatedStatus('dest-ahead')).toBe(true);
    expect(isGatedStatus('conflict')).toBe(true);
    expect(isGatedStatus('new')).toBe(false);
    expect(isGatedStatus('replace')).toBe(false);
    expect(isGatedStatus('same')).toBe(false);
  });
});
