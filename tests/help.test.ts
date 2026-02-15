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

  it('should include agents group in main help', () => {
    const output = formatHelp();
    expect(output).toContain('ap agents <command> [args] [options]');
    expect(output).toContain('Agent Commands:');
  });

  it('should include find in agents help', () => {
    const output = formatHelp('agents');
    expect(output).toContain('find [query]');
  });

  it('should include remote-search flags in find help', () => {
    const output = formatHelp('skills', 'find');
    expect(output).toContain('--limit <n>');
    expect(output).toContain('--offline');
  });
});
