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

  it('supports legacy agent <group> <action> syntax', () => {
    const result = resolveCommandPath(['agent', 'skills', 'sync', '--target', 'cursor']);
    expect(result.error).toBeNull();
    expect(result.path).toEqual(['skills', 'sync']);
    expect(result.rest).toEqual(['--target', 'cursor']);
  });

  it('applies group-specific subcommand rules', () => {
    const result = resolveCommandPath(['agents', 'show']);
    expect(result.error).toBeNull();
    expect(result.path).toEqual(['agents', 'show']);
  });

  it('resolves find for all groups', () => {
    expect(resolveCommandPath(['skills', 'find', 'foo']).path).toEqual(['skills', 'find']);
    expect(resolveCommandPath(['agents', 'find', 'foo']).path).toEqual(['agents', 'find']);
    expect(resolveCommandPath(['commands', 'find', 'foo']).path).toEqual(['commands', 'find']);
    expect(resolveCommandPath(['rules', 'find', 'foo']).path).toEqual(['rules', 'find']);
    expect(resolveCommandPath(['mcp', 'find', 'foo']).path).toEqual(['mcp', 'find']);
  });

  it('resolves rules-specific actions', () => {
    expect(resolveCommandPath(['rules', 'validate']).path).toEqual(['rules', 'validate']);
    expect(resolveCommandPath(['rule', 'list']).path).toEqual(['rules', 'list']);
  });
});
