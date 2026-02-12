import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  ensureCentralCommandStore,
  listCentralCommands,
  detectCommandForm,
  findEntryMd,
  getCommandMdPath,
} from '../src/core/command-store.js';

// 使用临时目录来隔离测试
let tmpDir: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-cmd-store-'));
  originalEnv = process.env.APG_HOME;
  process.env.APG_HOME = tmpDir;
});

afterEach(async () => {
  if (originalEnv !== undefined) process.env.APG_HOME = originalEnv;
  else delete process.env.APG_HOME;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('command-store', () => {
  describe('ensureCentralCommandStore', () => {
    it('should create commands directory', async () => {
      await ensureCentralCommandStore();
      const commandsDir = path.join(tmpDir, 'commands');
      const stat = await fs.stat(commandsDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('findEntryMd', () => {
    it('should find <dir-name>.md', async () => {
      const dirPath = path.join(tmpDir, 'commands', 'my-cmd');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'my-cmd.md'), '# My command');

      const result = await findEntryMd(dirPath, 'my-cmd');
      expect(result).toBe(path.join(dirPath, 'my-cmd.md'));
    });

    it('should find index.md when named .md is missing', async () => {
      const dirPath = path.join(tmpDir, 'commands', 'my-cmd');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'index.md'), '# My command');

      const result = await findEntryMd(dirPath, 'my-cmd');
      expect(result).toBe(path.join(dirPath, 'index.md'));
    });

    it('should prefer <dir-name>.md over index.md', async () => {
      const dirPath = path.join(tmpDir, 'commands', 'my-cmd');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'my-cmd.md'), '# Named');
      await fs.writeFile(path.join(dirPath, 'index.md'), '# Index');

      const result = await findEntryMd(dirPath, 'my-cmd');
      expect(result).toBe(path.join(dirPath, 'my-cmd.md'));
    });

    it('should return null when no entry .md exists', async () => {
      const dirPath = path.join(tmpDir, 'commands', 'my-cmd');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'resource.mdx'), 'resource');

      const result = await findEntryMd(dirPath, 'my-cmd');
      expect(result).toBeNull();
    });
  });

  describe('detectCommandForm', () => {
    it('should detect directory-form', async () => {
      const dirPath = path.join(tmpDir, 'commands', 'migrate');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'migrate.md'), '# Migrate');
      await fs.writeFile(path.join(dirPath, 'core.mdx'), 'resource');

      const form = await detectCommandForm('migrate');
      expect(form).toBe('directory');
    });

    it('should detect file-form', async () => {
      const commandsDir = path.join(tmpDir, 'commands');
      await fs.mkdir(commandsDir, { recursive: true });
      await fs.writeFile(path.join(commandsDir, 'auto-fix.md'), '# Auto Fix');

      const form = await detectCommandForm('auto-fix');
      expect(form).toBe('file');
    });

    it('should return null when command does not exist', async () => {
      await fs.mkdir(path.join(tmpDir, 'commands'), { recursive: true });
      const form = await detectCommandForm('nonexistent');
      expect(form).toBeNull();
    });

    it('should prefer directory-form over file-form when both exist', async () => {
      const commandsDir = path.join(tmpDir, 'commands');
      const dirPath = path.join(commandsDir, 'my-cmd');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'my-cmd.md'), '# Dir form');
      await fs.writeFile(path.join(commandsDir, 'my-cmd.md'), '# File form');

      const form = await detectCommandForm('my-cmd');
      expect(form).toBe('directory');
    });
  });

  describe('listCentralCommands', () => {
    it('should return empty array when no commands exist', async () => {
      const result = await listCentralCommands();
      expect(result).toEqual([]);
    });

    it('should list file-form commands', async () => {
      const commandsDir = path.join(tmpDir, 'commands');
      await fs.mkdir(commandsDir, { recursive: true });
      await fs.writeFile(path.join(commandsDir, 'auto-fix.md'), '# Auto Fix');
      await fs.writeFile(path.join(commandsDir, 'init.md'), '# Init');

      const result = await listCentralCommands();
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.name)).toEqual(['auto-fix', 'init']);
      expect(result.every((c) => c.form === 'file')).toBe(true);
    });

    it('should list directory-form commands', async () => {
      const dirPath = path.join(tmpDir, 'commands', 'migrate');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'migrate.md'), '# Migrate');

      const result = await listCentralCommands();
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('migrate');
      expect(result[0]!.form).toBe('directory');
    });

    it('should list both forms together and sort alphabetically', async () => {
      const commandsDir = path.join(tmpDir, 'commands');
      await fs.mkdir(commandsDir, { recursive: true });
      await fs.writeFile(path.join(commandsDir, 'auto-fix.md'), '# Auto Fix');

      const dirPath = path.join(commandsDir, 'migrate');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'migrate.md'), '# Migrate');

      const result = await listCentralCommands();
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.name)).toEqual(['auto-fix', 'migrate']);
      expect(result.map((c) => c.form)).toEqual(['file', 'directory']);
    });

    it('should exclude resource directories without entry .md', async () => {
      const commandsDir = path.join(tmpDir, 'commands');
      await fs.mkdir(commandsDir, { recursive: true });
      const sharedDir = path.join(commandsDir, 'shared');
      await fs.mkdir(sharedDir, { recursive: true });
      await fs.writeFile(path.join(sharedDir, 'patterns.mdx'), 'resource');

      const result = await listCentralCommands();
      expect(result).toEqual([]);
    });

    it('should exclude non-.md files at top level', async () => {
      const commandsDir = path.join(tmpDir, 'commands');
      await fs.mkdir(commandsDir, { recursive: true });
      await fs.writeFile(path.join(commandsDir, 'readme.txt'), 'not a command');

      const result = await listCentralCommands();
      expect(result).toEqual([]);
    });
  });

  describe('getCommandMdPath', () => {
    it('should return .md path for file-form', async () => {
      const commandsDir = path.join(tmpDir, 'commands');
      await fs.mkdir(commandsDir, { recursive: true });
      await fs.writeFile(path.join(commandsDir, 'auto-fix.md'), '# Auto Fix');

      const result = await getCommandMdPath('auto-fix');
      expect(result).toBe(path.join(commandsDir, 'auto-fix.md'));
    });

    it('should return entry .md path for directory-form', async () => {
      const dirPath = path.join(tmpDir, 'commands', 'migrate');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'migrate.md'), '# Migrate');

      const result = await getCommandMdPath('migrate');
      expect(result).toBe(path.join(dirPath, 'migrate.md'));
    });

    it('should return null for nonexistent command', async () => {
      await fs.mkdir(path.join(tmpDir, 'commands'), { recursive: true });
      const result = await getCommandMdPath('nonexistent');
      expect(result).toBeNull();
    });
  });
});
