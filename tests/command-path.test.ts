import { describe, expect, it } from 'bun:test';
import { resolveCommandPath } from '../src/util/command-path.js';

describe('command-path', () => {
  it('resolves agents root group', () => {
    const result = resolveCommandPath(['agents', 'sync', '--target', 'cursor']);
    expect(result.error).toBeNull();
    expect(result.path).toEqual(['agents', 'sync']);
    expect(result.rest).toEqual(['--target', 'cursor']);
  });

  it('resolves agent shorthand to agents group', () => {
    const result = resolveCommandPath(['agent', 'sync', '--target', 'cursor']);
    expect(result.error).toBeNull();
    expect(result.path).toEqual(['agents', 'sync']);
    expect(result.rest).toEqual(['--target', 'cursor']);
  });
});
