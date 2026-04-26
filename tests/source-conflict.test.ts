import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { RegistryFileV1 } from '../src/core/registry.js';
import {
  classifySourceConflict,
  removeGitSourceTracking,
  sameSource,
  sourceIdentity,
  suggestAliasName,
  uniqueAliasName,
} from '../src/util/source-conflict.js';

describe('source conflict helpers', () => {
  it('normalizes git sources by repo url and ref', () => {
    const a = { type: 'git' as const, url: 'https://github.com/Owner/Repo.git', ref: 'main' };
    const b = { type: 'git' as const, url: 'git@github.com:owner/repo', ref: 'main' };
    const c = { type: 'git' as const, url: 'https://github.com/owner/repo', ref: 'dev' };

    expect(sourceIdentity(a)).toBe('git:github.com/owner/repo#main');
    expect(sameSource(a, b)).toBe(true);
    expect(sameSource(a, c)).toBe(false);
  });

  it('normalizes local and collected sources with absolute paths', () => {
    const local = { type: 'local' as const, path: './fixtures/item' };
    const collected = {
      type: 'collected' as const,
      from: { target: 'codex', scope: 'local', path: './.codex/skills/foo' },
    };

    expect(sourceIdentity(local)).toBe(`local:${path.resolve('./fixtures/item')}`);
    expect(sourceIdentity(collected)).toBe(`collected:codex:local:${path.resolve('./.codex/skills/foo')}`);
  });

  it('classifies content and source combinations', () => {
    const repoA = { type: 'git' as const, url: 'https://github.com/a/repo' };
    const repoB = { type: 'git' as const, url: 'https://github.com/b/repo' };

    expect(classifySourceConflict({ incomingSource: repoA, contentStatus: 'new' })).toBe('new');
    expect(
      classifySourceConflict({
        existingSource: repoB,
        incomingSource: repoA,
        contentStatus: 'identical',
      }),
    ).toBe('identical');
    expect(
      classifySourceConflict({
        existingSource: repoA,
        incomingSource: repoA,
        contentStatus: 'update',
      }),
    ).toBe('same-source update');
    expect(
      classifySourceConflict({
        existingSource: repoB,
        incomingSource: repoA,
        contentStatus: 'update',
      }),
    ).toBe('different-source conflict');
    expect(
      classifySourceConflict({
        incomingSource: repoA,
        contentStatus: 'update',
      }),
    ).toBe('different-source conflict');
  });

  it('removes replaced git-backed names from the old repo tracking list', () => {
    const registry: RegistryFileV1 = {
      version: 1,
      skills: {},
      agents: {},
      commands: {},
      rules: {},
      mcp: {},
      repos: {
        'github.com/old/skills': {
          url: 'https://github.com/old/skills',
          skills: ['foo', 'bar'],
          addedAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      },
      agentRepos: {},
      commandRepos: {},
      ruleRepos: {},
    };

    removeGitSourceTracking({
      registry,
      kind: 'skills',
      name: 'foo',
      source: { type: 'git', url: 'https://github.com/old/skills.git' },
    });

    expect(registry.repos?.['github.com/old/skills']?.skills).toEqual(['bar']);
  });

  it('suggests stable aliases and increments when needed', async () => {
    expect(suggestAliasName('lint', { type: 'git', url: 'https://github.com/Owner/Repo' })).toBe('lint-owner');
    const alias = await uniqueAliasName('lint-owner', async (candidate) =>
      ['lint-owner', 'lint-owner-2'].includes(candidate),
    );
    expect(alias).toBe('lint-owner-3');
  });
});
