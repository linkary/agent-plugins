import { describe, expect, it } from 'bun:test';
import {
  computeCanonicalMcpHash,
  normalizeCentralMcpDef,
  parseMcpToCanonical,
  serializeCanonicalMcpForTarget,
} from '../src/util/mcp-transform.js';
import { computeMcpHash } from '../src/core/mcp-store.js';

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

  it('parses streamable-http transport correctly', () => {
    const parsed = parseMcpToCanonical({
      type: 'streamable-http',
      url: 'https://mcp-gw.dingtalk.com/server/abc123',
      headers: { 'X-Token': 'secret' },
    });
    expect(parsed.canonical).toBeDefined();
    expect(parsed.canonical?.type).toBe('streamable-http');
    expect(parsed.canonical?.url).toBe('https://mcp-gw.dingtalk.com/server/abc123');
    expect(parsed.canonical?.headers).toEqual({ 'X-Token': 'secret' });
  });

  it('cursor rejects streamable-http as incompatible', () => {
    const parsed = parseMcpToCanonical({
      type: 'streamable-http',
      url: 'https://example.com/mcp',
    });
    expect(parsed.canonical).toBeDefined();

    const converted = serializeCanonicalMcpForTarget(parsed.canonical!, 'cursor');
    expect(converted.def).toBeNull();
    expect(converted.incompatibleReason).toContain('does not support');
    expect(converted.incompatibleReason).toContain('streamable-http');
  });

  it('claude-code accepts streamable-http', () => {
    const parsed = parseMcpToCanonical({
      type: 'streamable-http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer token' },
    });
    expect(parsed.canonical).toBeDefined();

    const converted = serializeCanonicalMcpForTarget(parsed.canonical!, 'claude-code');
    expect(converted.def).toBeDefined();
    expect(converted.def?.type).toBe('streamable-http');
    expect(converted.def?.url).toBe('https://example.com/mcp');
    expect(converted.lossy).toBe(false);
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

  it('normalizes central definition preserving all transports', () => {
    const normalized = normalizeCentralMcpDef({
      type: 'streamable-http',
      url: 'https://example.com/mcp',
      headers: { 'X-Key': 'val' },
    });
    expect(normalized.def).toEqual({
      type: 'streamable-http',
      url: 'https://example.com/mcp',
      headers: { 'X-Key': 'val' },
    });
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

  // Guards the sync<->collect baseline: `mcp sync` records the baseline from the
  // target serialization while `mcp collect` computes it from the central form.
  // For the three-way status to work across that boundary, both must land on the
  // same canonical hash even when the target format drops fields (e.g. codex omits
  // `type`). This is the property that keeps a clean pull as `replace`, not `conflict`.
  it('produces a direction-independent canonical baseline across target/central serializations', () => {
    const central = { type: 'stdio' as const, command: 'npx', args: ['-y', 'tavily-mcp'], env: { A: '1' } };
    const canonical = parseMcpToCanonical(central).canonical;
    expect(canonical).toBeDefined();

    // What `mcp sync` writes to the target (codex drops `type`).
    const targetDef = serializeCanonicalMcpForTarget(canonical!, 'codex').def;
    expect(targetDef).toBeDefined();
    expect('type' in targetDef!).toBe(false);

    // Byte-level format hashes differ between the two serializations...
    expect(computeMcpHash(targetDef!)).not.toBe(computeMcpHash(normalizeCentralMcpDef(central).def!));

    // ...but the canonical baseline hash is identical in both directions.
    const syncBaseline = computeCanonicalMcpHash(parseMcpToCanonical(targetDef!).canonical!);
    const collectHash = computeCanonicalMcpHash(parseMcpToCanonical(normalizeCentralMcpDef(central).def!).canonical!);
    expect(syncBaseline).toBe(collectHash);
  });
});
