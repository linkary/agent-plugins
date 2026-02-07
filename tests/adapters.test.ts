import { describe, expect, it } from 'bun:test';
import { getAdapters, resolveAdapter } from '../src/targets/adapters.js';
import path from 'node:path';

describe('adapters', () => {
  const homeDir = '/Users/test';
  const projectRoot = '/Users/test/myproject';

  describe('getAdapters', () => {
    it('should return all 6 adapters', () => {
      const adapters = getAdapters();
      expect(adapters.length).toBe(6);
      expect(adapters.map((a) => a.id)).toEqual(['cursor', 'gemini', 'codex', 'claude-code', 'antigravity', 'openskills']);
    });

    it('should return a copy of adapters array', () => {
      const a1 = getAdapters();
      const a2 = getAdapters();
      expect(a1).not.toBe(a2);
    });
  });

  describe('resolveAdapter', () => {
    it('should resolve by id', () => {
      expect(resolveAdapter('cursor')?.id).toBe('cursor');
      expect(resolveAdapter('gemini')?.id).toBe('gemini');
      expect(resolveAdapter('codex')?.id).toBe('codex');
      expect(resolveAdapter('claude-code')?.id).toBe('claude-code');
      expect(resolveAdapter('antigravity')?.id).toBe('antigravity');
    });

    it('should resolve by alias', () => {
      expect(resolveAdapter('claude')?.id).toBe('claude-code');
      expect(resolveAdapter('claudecode')?.id).toBe('claude-code');
      expect(resolveAdapter('gemini-cli')?.id).toBe('gemini');
      expect(resolveAdapter('anti-gravity')?.id).toBe('antigravity');
      expect(resolveAdapter('openskills')?.id).toBe('openskills');
    });

    it('should be case-insensitive', () => {
      expect(resolveAdapter('CURSOR')?.id).toBe('cursor');
      expect(resolveAdapter('Claude')?.id).toBe('claude-code');
    });

    it('should return null for unknown adapters', () => {
      expect(resolveAdapter('unknown')).toBeNull();
      expect(resolveAdapter('')).toBeNull();
    });
  });

  describe('resolveSkillsDir', () => {
    describe('cursor', () => {
      const adapter = resolveAdapter('cursor')!;

      it('should resolve global path', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'global', projectRoot, homeDir });
        expect(dir).toBe(path.join(homeDir, '.cursor', 'skills'));
      });

      it('should resolve local path', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'local', projectRoot, homeDir });
        expect(dir).toBe(path.join(projectRoot, '.cursor', 'skills'));
      });
    });

    describe('gemini', () => {
      const adapter = resolveAdapter('gemini')!;

      it('should resolve global path', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'global', projectRoot, homeDir });
        expect(dir).toBe(path.join(homeDir, '.gemini', 'skills'));
      });

      it('should resolve local path', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'local', projectRoot, homeDir });
        expect(dir).toBe(path.join(projectRoot, '.gemini', 'skills'));
      });
    });

    describe('claude-code', () => {
      const adapter = resolveAdapter('claude-code')!;

      it('should resolve global path to ~/.claude/skills', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'global', projectRoot, homeDir });
        expect(dir).toBe(path.join(homeDir, '.claude', 'skills'));
      });

      it('should resolve local path', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'local', projectRoot, homeDir });
        expect(dir).toBe(path.join(projectRoot, '.claude', 'skills'));
      });
    });

    describe('codex', () => {
      const adapter = resolveAdapter('codex')!;

      it('should resolve global path to ~/.codex/skills', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'global', projectRoot, homeDir });
        expect(dir).toBe(path.join(homeDir, '.codex', 'skills'));
      });

      it('should resolve local path', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'local', projectRoot, homeDir });
        expect(dir).toBe(path.join(projectRoot, '.codex', 'skills'));
      });
    });

    describe('antigravity', () => {
      const adapter = resolveAdapter('antigravity')!;

      it('should resolve global path to ~/.gemini/antigravity/global_skills', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'global', projectRoot, homeDir });
        expect(dir).toBe(path.join(homeDir, '.gemini', 'antigravity', 'global_skills'));
      });

      it('should resolve local path to .agent/skills', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'local', projectRoot, homeDir });
        expect(dir).toBe(path.join(projectRoot, '.agent', 'skills'));
      });
    });

    describe('openskills', () => {
      const adapter = resolveAdapter('openskills')!;

      it('should resolve global path to ~/.agent/skills', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'global', projectRoot, homeDir });
        expect(dir).toBe(path.join(homeDir, '.agent', 'skills'));
      });

      it('should resolve local path to .agent/skills', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'local', projectRoot, homeDir });
        expect(dir).toBe(path.join(projectRoot, '.agent', 'skills'));
      });
    });
  });
});
