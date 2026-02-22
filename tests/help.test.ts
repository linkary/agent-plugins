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
    expect(output).toContain('show [agent]');
  });

  it('should include browse options in agents show help', () => {
    const output = formatHelp('agents', 'show');
    expect(output).toContain('--target <tools>');
    expect(output).toContain('--scope <scope>');
  });

  it('should include remote-search flags in find help', () => {
    const output = formatHelp('skills', 'find');
    expect(output).toContain('--limit <n>');
    expect(output).toContain('--offline');
  });

  it('should include rules group and validate command in help', () => {
    const main = formatHelp();
    expect(main).toContain('ap rules <command> [args] [options]');
    expect(main).toContain('AP_CURSOR_USER_RULES_FILE');

    const group = formatHelp('rules');
    expect(group).toContain('validate');
    expect(group).toContain('find [query]');
    const show = formatHelp('rules', 'show');
    expect(show).toContain('--target <tools>');
    expect(show).toContain('--scope <scope>');
  });
});
