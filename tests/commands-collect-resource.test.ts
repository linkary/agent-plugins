import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cmdCommandsCollect } from '../src/commands/commands/collect.js';

let tmpDir: string;
let originalApgHome: string | undefined;
let originalAgentPluginsHome: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-cmd-collect-resource-'));
  originalApgHome = process.env.APG_HOME;
  originalAgentPluginsHome = process.env.AGENT_PLUGINS_HOME;
  process.env.APG_HOME = path.join(tmpDir, 'apg-home');
  delete process.env.AGENT_PLUGINS_HOME;
});

afterEach(async () => {
  if (originalApgHome !== undefined) process.env.APG_HOME = originalApgHome;
  else delete process.env.APG_HOME;

  if (originalAgentPluginsHome !== undefined) process.env.AGENT_PLUGINS_HOME = originalAgentPluginsHome;
  else delete process.env.AGENT_PLUGINS_HOME;

  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('commands collect resource-only changes', () => {
  it('should detect conflict when only same-name resource directory differs', async () => {
    const projectRoot = path.join(tmpDir, 'project');
    const targetCommandsDir = path.join(projectRoot, '.cursor', 'commands');
    await fs.mkdir(path.join(targetCommandsDir, 'demo'), { recursive: true });
    await fs.writeFile(path.join(targetCommandsDir, 'demo.md'), '# Demo\n');
    await fs.writeFile(path.join(targetCommandsDir, 'demo', 'resource.txt'), 'source-resource-v2');

    const centralCommandsDir = path.join(process.env.APG_HOME!, 'commands');
    await fs.mkdir(path.join(centralCommandsDir, 'demo'), { recursive: true });
    await fs.writeFile(path.join(centralCommandsDir, 'demo.md'), '# Demo\n');
    await fs.writeFile(path.join(centralCommandsDir, 'demo', 'resource.txt'), 'central-resource-v1');

    const exitCode = await cmdCommandsCollect(
      [],
      { target: 'cursor', scope: 'local', cwd: projectRoot },
      { cwd: projectRoot },
    );

    expect(exitCode).toBe(1);
  });
});

