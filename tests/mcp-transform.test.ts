import { describe, expect, it } from 'bun:test';
import {
  computeCanonicalMcpHash,
  normalizeCentralMcpDef,
  parseMcpToCanonical,
  serializeCanonicalMcpForTarget,
} from '../src/util/mcp-transform.js';

describe('mcp-transform', () => {
  it('infers stdio transport when type is omitted', () => {
    const parsed = parseMcpToCanonical({
      command: 'npx',
      args: ['-y', 'tavily-mcp'],
    });
    expect(parsed.canonical).toBeDefined();
    expect(parsed.canonical?.type).toBe('stdio');
    expect(parsed.canonical?.command).toBe('npx');
  });

  it('rejects invalid stdio definitions without command', () => {
    const parsed = parseMcpToCanonical({
      type: 'stdio',
      args: ['-y', 'pkg'],
    });
    expect(parsed.canonical).toBeNull();
    expect(parsed.error).toContain('command');
  });

  it('marks codex conversion as lossy when unsupported fields exist', () => {
    const parsed = parseMcpToCanonical({
      type: 'sse',
      url: 'https://example.com/sse',
      enabled: true,
      tool_timeout_sec: 30,
    });
    expect(parsed.canonical).toBeDefined();

    const converted = serializeCanonicalMcpForTarget(parsed.canonical!, 'codex');
    expect(converted.def).toBeDefined();
    expect(converted.def?.type).toBeUndefined();
    expect(converted.def?.url).toBe('https://example.com/sse');
    expect(converted.lossy).toBe(true);
    expect(converted.lossyReasons).toContain('enabled');
    expect(converted.lossyReasons).toContain('tool_timeout_sec');
  });

  it('marks unsupported transport as incompatible', () => {
    const parsed = parseMcpToCanonical({
      type: 'ws',
      url: 'wss://example.com/ws',
    });
    expect(parsed.canonical).toBeDefined();

    const converted = serializeCanonicalMcpForTarget(parsed.canonical!, 'codex');
    expect(converted.def).toBeNull();
    expect(converted.incompatibleReason).toContain('does not support');
  });

  it('normalizes central definition into stable canonical json shape', () => {
    const normalized = normalizeCentralMcpDef({
      command: 'npx',
      args: ['-y', 'pkg'],
      env: { KEY: 'value' },
    });
    expect(normalized.def).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'pkg'],
      env: { KEY: 'value' },
    });
  });

  it('hashes canonical definitions independent of object key order', () => {
    const a = parseMcpToCanonical({
      command: 'npx',
      args: ['-y', 'pkg'],
      env: { A: '1', B: '2' },
      headers: { Z: '9', X: '8' },
    });
    const b = parseMcpToCanonical({
      args: ['-y', 'pkg'],
      command: 'npx',
      env: { B: '2', A: '1' },
      headers: { X: '8', Z: '9' },
    });
    expect(a.canonical).toBeDefined();
    expect(b.canonical).toBeDefined();
    expect(computeCanonicalMcpHash(a.canonical!)).toBe(computeCanonicalMcpHash(b.canonical!));
  });
});
