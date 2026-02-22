import { describe, expect, it } from 'bun:test';
import {
  filterAgentAdapters,
  filterCommandAdapters,
  filterRuleAdapters,
  getAdapters,
  resolveAdapter,
} from '../src/targets/adapters.js';
import path from 'node:path';

describe('adapters', () => {
  const homeDir = '/Users/test';
  const projectRoot = '/Users/test/myproject';

  describe('getAdapters', () => {
    it('should return all 9 adapters', () => {
      const adapters = getAdapters();
      expect(adapters.length).toBe(9);
      expect(adapters.map((a) => a.id)).toEqual([
        'cursor',
        'gemini',
        'codex',
        'claude-code',
        'antigravity',
        'openskills',
        'agents',
        'opencode',
        'qoder',
      ]);
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
      expect(resolveAdapter('open-code')?.id).toBe('opencode');
      expect(resolveAdapter('qoder')?.id).toBe('qoder');
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

    describe('agents', () => {
      const adapter = resolveAdapter('agents')!;

      it('should resolve global path to ~/.agents/skills', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'global', projectRoot, homeDir });
        expect(dir).toBe(path.join(homeDir, '.agents', 'skills'));
      });

      it('should resolve local path to .agents/skills', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'local', projectRoot, homeDir });
        expect(dir).toBe(path.join(projectRoot, '.agents', 'skills'));
      });
    });

    describe('opencode', () => {
      const adapter = resolveAdapter('opencode')!;

      it('should resolve global path to ~/.opencode/skills', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'global', projectRoot, homeDir });
        expect(dir).toBe(path.join(homeDir, '.opencode', 'skills'));
      });

      it('should resolve local path to .opencode/skills', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'local', projectRoot, homeDir });
        expect(dir).toBe(path.join(projectRoot, '.opencode', 'skills'));
      });

      it('should resolve command paths', () => {
        expect(adapter.resolveCommandsDir({ scope: 'global', projectRoot, homeDir })).toBe(
          path.join(homeDir, '.opencode', 'commands'),
        );
        expect(adapter.resolveCommandsDir({ scope: 'local', projectRoot, homeDir })).toBe(
          path.join(projectRoot, '.opencode', 'commands'),
        );
      });

      it('should resolve MCP config paths', () => {
        const globalSpec = adapter.resolveMcpConfig?.({ scope: 'global', projectRoot, homeDir });
        const localSpec = adapter.resolveMcpConfig?.({ scope: 'local', projectRoot, homeDir });
        expect(globalSpec?.configPath).toBe(path.join(homeDir, '.opencode', 'mcp.json'));
        expect(localSpec?.configPath).toBe(path.join(projectRoot, '.opencode', 'mcp.json'));
        expect(globalSpec?.serversKey).toBe('mcpServers');
      });
    });

    describe('qoder', () => {
      const adapter = resolveAdapter('qoder')!;

      it('should resolve global path to ~/.qoder/skills', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'global', projectRoot, homeDir });
        expect(dir).toBe(path.join(homeDir, '.qoder', 'skills'));
      });

      it('should resolve local path to .qoder/skills', () => {
        const dir = adapter.resolveSkillsDir({ scope: 'local', projectRoot, homeDir });
        expect(dir).toBe(path.join(projectRoot, '.qoder', 'skills'));
      });

      it('should resolve command paths', () => {
        expect(adapter.resolveCommandsDir({ scope: 'global', projectRoot, homeDir })).toBe(
          path.join(homeDir, '.qoder', 'commands'),
        );
        expect(adapter.resolveCommandsDir({ scope: 'local', projectRoot, homeDir })).toBe(
          path.join(projectRoot, '.qoder', 'commands'),
        );
      });

      it('should resolve MCP config paths', () => {
        const globalSpec = adapter.resolveMcpConfig?.({ scope: 'global', projectRoot, homeDir });
        const localSpec = adapter.resolveMcpConfig?.({ scope: 'local', projectRoot, homeDir });
        expect(globalSpec?.configPath).toBe(path.join(homeDir, '.qoder', 'mcp.json'));
        expect(localSpec?.configPath).toBe(path.join(projectRoot, '.qoder', 'mcp.json'));
        expect(globalSpec?.serversKey).toBe('mcpServers');
      });
    });
  });

  describe('resolveAgentsDir', () => {
    it('should resolve cursor agent paths', () => {
      const adapter = resolveAdapter('cursor')!;
      expect(adapter.resolveAgentsDir({ scope: 'global', projectRoot, homeDir })).toBe(
        path.join(homeDir, '.cursor', 'agents'),
      );
      expect(adapter.resolveAgentsDir({ scope: 'local', projectRoot, homeDir })).toBe(
        path.join(projectRoot, '.cursor', 'agents'),
      );
    });

    it('should resolve opencode agent paths', () => {
      const adapter = resolveAdapter('opencode')!;
      expect(adapter.resolveAgentsDir({ scope: 'global', projectRoot, homeDir })).toBe(
        path.join(homeDir, '.opencode', 'agents'),
      );
      expect(adapter.resolveAgentsDir({ scope: 'local', projectRoot, homeDir })).toBe(
        path.join(projectRoot, '.opencode', 'agents'),
      );
    });

    it('should return empty agents path for skills-only targets', () => {
      expect(resolveAdapter('openskills')!.resolveAgentsDir({ scope: 'global', projectRoot, homeDir })).toBe('');
      expect(resolveAdapter('agents')!.resolveAgentsDir({ scope: 'local', projectRoot, homeDir })).toBe('');
    });
  });

  describe('resolveCommandsDir', () => {
    it('should return empty command paths for skills-only targets', () => {
      expect(resolveAdapter('openskills')!.resolveCommandsDir({ scope: 'global', projectRoot, homeDir })).toBe('');
      expect(resolveAdapter('agents')!.resolveCommandsDir({ scope: 'local', projectRoot, homeDir })).toBe('');
    });
  });

  describe('resolveRulesDir', () => {
    it('should resolve cursor rule paths', () => {
      const adapter = resolveAdapter('cursor')!;
      expect(adapter.resolveRulesDir({ scope: 'global', projectRoot, homeDir })).toBe(
        path.join(homeDir, '.cursor', 'rules'),
      );
      expect(adapter.resolveRulesDir({ scope: 'local', projectRoot, homeDir })).toBe(
        path.join(projectRoot, '.cursor', 'rules'),
      );
    });

    it('should resolve qoder rule paths', () => {
      const adapter = resolveAdapter('qoder')!;
      expect(adapter.resolveRulesDir({ scope: 'global', projectRoot, homeDir })).toBe(
        path.join(homeDir, '.qoder', 'rules'),
      );
      expect(adapter.resolveRulesDir({ scope: 'local', projectRoot, homeDir })).toBe(
        path.join(projectRoot, '.qoder', 'rules'),
      );
    });

    it('should return empty rule paths for skills-only targets', () => {
      expect(resolveAdapter('openskills')!.resolveRulesDir({ scope: 'global', projectRoot, homeDir })).toBe('');
      expect(resolveAdapter('agents')!.resolveRulesDir({ scope: 'local', projectRoot, homeDir })).toBe('');
    });
  });

  describe('group filters', () => {
    it('should exclude skills-only targets from non-skill groups', () => {
      const all = getAdapters();
      const commands = filterCommandAdapters(all).map((adapter) => adapter.id);
      const agents = filterAgentAdapters(all).map((adapter) => adapter.id);
      const rules = filterRuleAdapters(all).map((adapter) => adapter.id);
      expect(commands).not.toContain('openskills');
      expect(commands).not.toContain('agents');
      expect(agents).not.toContain('openskills');
      expect(agents).not.toContain('agents');
      expect(rules).not.toContain('openskills');
      expect(rules).not.toContain('agents');
    });
  });
});
