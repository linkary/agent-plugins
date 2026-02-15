import { describe, expect, it } from 'bun:test';
import { parseOptions } from '../src/util/options.js';

describe('parseOptions', () => {
  describe('basic flag parsing', () => {
    it('should parse long flags without values as booleans', () => {
      const { flags } = parseOptions(['--force', '--dry-run']);
      expect(flags.force).toBe(true);
      expect(flags['dry-run']).toBe(true);
    });

    it('should parse long flags with values', () => {
      const { flags } = parseOptions(['--target', 'gemini']);
      expect(flags.target).toBe('gemini');
    });

    it('should parse long flags with = syntax', () => {
      const { flags } = parseOptions(['--target=cursor']);
      expect(flags.target).toBe('cursor');
    });

    it('should not consume positional args for boolean long flags', () => {
      const { flags, positionals } = parseOptions(['--force', 'skill1']);
      expect(flags.force).toBe(true);
      expect(positionals).toEqual(['skill1']);
    });

    it('should parse long value flags registered in CLI metadata', () => {
      const { flags } = parseOptions(['--type', 'stdio', '--command', 'npx']);
      expect(flags.type).toBe('stdio');
      expect(flags.command).toBe('npx');
    });

    it('should parse find remote options', () => {
      const { flags } = parseOptions(['--limit', '5', '--offline']);
      expect(flags.limit).toBe('5');
      expect(flags.offline).toBe(true);
    });

    it('should collect positional arguments', () => {
      const { positionals } = parseOptions(['skill1', 'skill2']);
      expect(positionals).toEqual(['skill1', 'skill2']);
    });

    it('should handle -- separator', () => {
      const { positionals, flags } = parseOptions(['--force', '--', '--not-a-flag']);
      expect(flags.force).toBe(true);
      expect(positionals).toEqual(['--not-a-flag']);
    });
  });

  describe('short flag parsing', () => {
    it('should expand short flags to long names', () => {
      const { flags } = parseOptions(['-f', '-d']);
      expect(flags.force).toBe(true);
      expect(flags['dry-run']).toBe(true);
    });

    it('should handle short flags with values', () => {
      const { flags } = parseOptions(['-t', 'gemini']);
      expect(flags.target).toBe('gemini');
    });

    it('should handle combined short boolean flags', () => {
      const { flags } = parseOptions(['-fd']);
      expect(flags.force).toBe(true);
      expect(flags['dry-run']).toBe(true);
    });
  });

  describe('-g and -l scope shortcuts', () => {
    it('should convert -g to scope=global', () => {
      const { flags } = parseOptions(['-g']);
      expect(flags.scope).toBe('global');
    });

    it('should convert -l to scope=local', () => {
      const { flags } = parseOptions(['-l']);
      expect(flags.scope).toBe('local');
    });

    it('should preserve scope when using -g with other flags', () => {
      const { flags } = parseOptions(['-g', '-t', 'cursor']);
      expect(flags.scope).toBe('global');
      expect(flags.target).toBe('cursor');
    });

    it('should not consume next argument when using -g', () => {
      const { flags, positionals } = parseOptions(['-g', 'skillname']);
      expect(flags.scope).toBe('global');
      expect(positionals).toEqual(['skillname']);
    });

    it('should work with combined flags like -gf', () => {
      const { flags } = parseOptions(['-gf']);
      expect(flags.scope).toBe('global');
      expect(flags.force).toBe(true);
    });
  });

  describe('mixed arguments', () => {
    it('should handle mixed positionals and flags', () => {
      const { positionals, flags } = parseOptions(['skill1', '-f', 'skill2', '--target', 'gemini']);
      expect(positionals).toEqual(['skill1', 'skill2']);
      expect(flags.force).toBe(true);
      expect(flags.target).toBe('gemini');
    });
  });
});
