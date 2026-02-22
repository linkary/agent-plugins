import { describe, expect, it } from 'bun:test';
import {
  parseManagedCursorUserRules,
  renderCursorUserRulesText,
} from '../src/util/cursor-user-rules.js';

describe('cursor-user-rules utils', () => {
  it('parses managed rule blocks', () => {
    const text = `
Manual intro.

<!-- ap-rule:start id="coding/basic" -->
Rule A
<!-- ap-rule:end -->

<!-- ap-rule:start id="frontend/react" -->
Rule B
<!-- ap-rule:end -->
`;

    const rules = parseManagedCursorUserRules(text);
    expect(rules.map((rule) => rule.id)).toEqual(['coding/basic', 'frontend/react']);
    expect(rules.map((rule) => rule.relativePath)).toEqual(['coding/basic.md', 'frontend/react.md']);
  });

  it('renders managed blocks while preserving unmanaged text', () => {
    const existing = `
Always respond with concise output.

<!-- ap-rule:start id="old/rule" -->
Old content
<!-- ap-rule:end -->
`;
    const managed = new Map<string, string>([
      ['coding/basic', '# Basic\nUse strict mode.'],
      ['frontend/react', '# React\nPrefer hooks.'],
    ]);
    const output = renderCursorUserRulesText(existing, managed);
    expect(output).toContain('Always respond with concise output.');
    expect(output).toContain('ap-rule:start id="coding/basic"');
    expect(output).toContain('ap-rule:start id="frontend/react"');
    expect(output).not.toContain('ap-rule:start id="old/rule"');
  });
});
