import { describe, expect, it } from 'bun:test';
import { InvalidRulePathError, normalizeRulePath } from '../src/util/rule-utils.js';

describe('rule-utils', () => {
  it('normalizes standard relative rule paths', () => {
    expect(normalizeRulePath('./rules/ts/style.mdc')).toBe('rules/ts/style.mdc');
    expect(normalizeRulePath('rules\\ts\\style.md')).toBe('rules/ts/style.md');
  });

  it('rejects parent-directory segments', () => {
    let firstErr: unknown;
    let secondErr: unknown;

    try {
      normalizeRulePath('../escape.mdc');
    } catch (err) {
      firstErr = err;
    }

    try {
      normalizeRulePath('rules/../../escape.mdc');
    } catch (err) {
      secondErr = err;
    }

    expect(firstErr instanceof InvalidRulePathError).toBe(true);
    expect(secondErr instanceof InvalidRulePathError).toBe(true);
  });
});
