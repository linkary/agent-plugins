import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cmdMcpCollect } from '../src/commands/mcp/collect.js';

let tmpHomeDir = '';
let tmpApgHome = '';
let tmpProjectRoot = '';
let originalHome: string | undefined;
let originalApgHome: string | undefined;

async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const originalWrite = process.stderr.write.bind(process.stderr);
  let output = '';

  (process.stderr.write as unknown as (chunk: unknown, ...args: unknown[]) => boolean) = (
    chunk: unknown,
    ...args: unknown[]
  ) => {
    output += typeof chunk === 'string' ? chunk : String(chunk ?? '');
    const cb = args.find((arg) => typeof arg === 'function') as ((error?: Error | null) => void) | undefined;
    cb?.(null);
    return true;
  };

  try {
    await fn();
  } finally {
    (process.stderr.write as unknown as typeof originalWrite) = originalWrite;
  }

  return output;
}

beforeEach(async () => {
  tmpHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-mcp-collect-home-'));
  tmpApgHome = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-mcp-collect-apg-'));
  tmpProjectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-mcp-collect-project-'));
  originalHome = process.env.HOME;
  originalApgHome = process.env.APG_HOME;
  process.env.HOME = tmpHomeDir;
  process.env.APG_HOME = tmpApgHome;
});

afterEach(async () => {
  if (originalHome !== undefined) process.env.HOME = originalHome;
  else delete process.env.HOME;

  if (originalApgHome !== undefined) process.env.APG_HOME = originalApgHome;
  else delete process.env.APG_HOME;

  await fs.rm(tmpHomeDir, { recursive: true, force: true });
  await fs.rm(tmpApgHome, { recursive: true, force: true });
  await fs.rm(tmpProjectRoot, { recursive: true, force: true });
});

describe('mcp collect', () => {
  it('reports duplicate source conflicts with adapter labels', async () => {
    const cursorConfig = path.join(tmpProjectRoot, '.cursor', 'mcp.json');
    const qoderConfig = path.join(tmpProjectRoot, '.mcp.json');
    await fs.mkdir(path.dirname(cursorConfig), { recursive: true });
    await fs.mkdir(path.dirname(qoderConfig), { recursive: true });

    await fs.writeFile(cursorConfig, JSON.stringify({ mcpServers: { srv: { type: 'stdio', command: 'a' } } }), 'utf-8');
    await fs.writeFile(qoderConfig, JSON.stringify({ mcpServers: { srv: { type: 'stdio', command: 'b' } } }), 'utf-8');

    const stderr = await captureStderr(async () => {
      const code = await cmdMcpCollect(
        ['srv'],
        { target: 'cursor,qoder', force: true, scope: 'local', cwd: tmpProjectRoot },
        { cwd: process.cwd() },
      );
      expect(code).toBe(0);
    });

    expect(stderr).toContain('Duplicate source conflict:');
    expect(stderr).toContain('Cursor');
    expect(stderr).toContain('Qoder');
    expect(stderr).not.toContain('undefined');
  });
});
