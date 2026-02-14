import { describe, expect, it } from 'bun:test';
import { formatHelp } from '../src/runner/help.js';

describe('help metadata', () => {
  it('should include MCP add option flags declared by CLI definitions', () => {
    const output = formatHelp('mcp', 'add');
    expect(output).toContain('--type <type>');
    expect(output).toContain('--command <cmd>');
    expect(output).toContain('--args <args>');
    expect(output).toContain('--url <url>');
  });
});

