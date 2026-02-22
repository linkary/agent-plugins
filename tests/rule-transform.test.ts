import { describe, expect, it } from 'bun:test';
import {
  canonicalRuleIdFromPath,
  computeRuleContentHash,
  getRuleCapability,
  parseRuleToCanonical,
  selectPreferredRulePathsForTarget,
  serializeCanonicalRule,
} from '../src/util/rule-transform.js';

describe('rule-transform', () => {
  it('maps target capabilities for rules', () => {
    expect(getRuleCapability('cursor')).toEqual({
      kind: 'prompt',
      format: 'cursor-mdc',
      extension: '.mdc',
    });
    expect(getRuleCapability('claude-code')).toEqual({
      kind: 'prompt',
      format: 'claude-md',
      extension: '.md',
    });
    expect(getRuleCapability('codex').kind).toBe('exec');
    expect(getRuleCapability('gemini').kind).toBe('unsupported');
  });

  it('converts cursor mdc rule to claude md shape', () => {
    const source = `---
description: TypeScript style guide
globs:
  - src/**/*.ts
alwaysApply: true
---
# TypeScript
Use strict mode.
`;
    const canonical = parseRuleToCanonical('coding/typescript.mdc', source);
    expect(canonical.id).toBe('coding/typescript');
    expect(canonical.paths).toEqual(['src/**/*.ts']);
    expect(canonical.alwaysApply).toBe(true);

    const out = serializeCanonicalRule(canonical, 'claude-md');
    expect(out.relativePath).toBe('coding/typescript.md');
    expect(out.content).toContain('ap_id: coding/typescript');
    expect(out.content).toContain('paths:');
    expect(out.content).not.toContain('globs:');
  });

  it('converts claude md rule to cursor mdc shape', () => {
    const source = `---
description: Web style guide
paths:
  - web/**
---
# Web
Prefer semantic HTML.
`;
    const canonical = parseRuleToCanonical('web/style.md', source);
    expect(canonical.id).toBe('web/style');
    expect(canonical.paths).toEqual(['web/**']);

    const out = serializeCanonicalRule(canonical, 'cursor-mdc');
    expect(out.relativePath).toBe('web/style.mdc');
    expect(out.content).toContain('globs:');
    expect(out.content).not.toContain('paths:');
  });

  it('selects preferred extension by target format', () => {
    const names = [
      'coding/typescript.md',
      'coding/typescript.mdc',
      'web/react.md',
      'web/react.mdc',
      'ops/runbook.md',
    ];

    expect(selectPreferredRulePathsForTarget(names, 'cursor-mdc')).toEqual([
      'coding/typescript.mdc',
      'ops/runbook.md',
      'web/react.mdc',
    ]);

    expect(selectPreferredRulePathsForTarget(names, 'claude-md')).toEqual([
      'coding/typescript.md',
      'ops/runbook.md',
      'web/react.md',
    ]);
  });

  it('normalizes canonical ids and hashes transformed content', () => {
    expect(canonicalRuleIdFromPath('a/b/c.mdc')).toBe('a/b/c');
    expect(canonicalRuleIdFromPath('a\\b\\c.md')).toBe('a/b/c');
    const hashA = computeRuleContentHash('alpha');
    const hashB = computeRuleContentHash('alpha');
    const hashC = computeRuleContentHash('beta');
    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(hashC);
  });
});
