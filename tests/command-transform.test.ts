import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  syncDirectoryCommand,
  syncFileCommand,
  collectToDirectory,
  collectToFile,
  detectTargetCommands,
} from '../src/util/command-transform.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-cmd-transform-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('command-transform', () => {
  describe('syncDirectoryCommand', () => {
    it('should transform directory-form to flat-form', async () => {
      // 构建 central directory-form 结构
      const srcDir = path.join(tmpDir, 'central', 'migrate');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, 'migrate.md'), '# Migrate');
      await fs.writeFile(path.join(srcDir, 'core.mdx'), 'core resource');
      await fs.writeFile(path.join(srcDir, 'utils.mdx'), 'utils resource');

      const targetDir = path.join(tmpDir, 'target');
      await fs.mkdir(targetDir, { recursive: true });

      await syncDirectoryCommand({ srcDir, targetDir, commandName: 'migrate' });

      // 验证 flat-form 结构
      const targetMd = await fs.readFile(path.join(targetDir, 'migrate.md'), 'utf-8');
      expect(targetMd).toBe('# Migrate');

      const coreResource = await fs.readFile(path.join(targetDir, 'migrate', 'core.mdx'), 'utf-8');
      expect(coreResource).toBe('core resource');

      const utilsResource = await fs.readFile(path.join(targetDir, 'migrate', 'utils.mdx'), 'utf-8');
      expect(utilsResource).toBe('utils resource');
    });

    it('should handle index.md convention', async () => {
      const srcDir = path.join(tmpDir, 'central', 'my-cmd');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, 'index.md'), '# Index Command');
      await fs.writeFile(path.join(srcDir, 'data.mdx'), 'data');

      const targetDir = path.join(tmpDir, 'target');
      await fs.mkdir(targetDir, { recursive: true });

      await syncDirectoryCommand({ srcDir, targetDir, commandName: 'my-cmd' });

      // index.md 应复制为 my-cmd.md
      const targetMd = await fs.readFile(path.join(targetDir, 'my-cmd.md'), 'utf-8');
      expect(targetMd).toBe('# Index Command');
    });

    it('should not create resource dir if no resources', async () => {
      const srcDir = path.join(tmpDir, 'central', 'simple');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, 'simple.md'), '# Simple');

      const targetDir = path.join(tmpDir, 'target');
      await fs.mkdir(targetDir, { recursive: true });

      await syncDirectoryCommand({ srcDir, targetDir, commandName: 'simple' });

      const targetMdExists = await fs.access(path.join(targetDir, 'simple.md')).then(() => true).catch(() => false);
      const resourceDirExists = await fs.access(path.join(targetDir, 'simple')).then(() => true).catch(() => false);

      expect(targetMdExists).toBe(true);
      expect(resourceDirExists).toBe(false);
    });
  });

  describe('syncFileCommand', () => {
    it('should copy .md file and shared resources', async () => {
      const centralRoot = path.join(tmpDir, 'central');
      await fs.mkdir(centralRoot, { recursive: true });
      await fs.writeFile(path.join(centralRoot, 'refactor.md'), '# Refactor');

      const sharedDir = path.join(centralRoot, 'shared');
      await fs.mkdir(sharedDir, { recursive: true });
      await fs.writeFile(path.join(sharedDir, 'patterns.mdx'), 'patterns');

      const targetDir = path.join(tmpDir, 'target');

      await syncFileCommand({
        mdFilePath: path.join(centralRoot, 'refactor.md'),
        sharedResources: ['shared/patterns.mdx'],
        centralRoot,
        targetDir,
        commandName: 'refactor',
      });

      const targetMd = await fs.readFile(path.join(targetDir, 'refactor.md'), 'utf-8');
      expect(targetMd).toBe('# Refactor');

      const targetResource = await fs.readFile(path.join(targetDir, 'shared', 'patterns.mdx'), 'utf-8');
      expect(targetResource).toBe('patterns');
    });

    it('should copy .md without resources when none declared', async () => {
      const centralRoot = path.join(tmpDir, 'central');
      await fs.mkdir(centralRoot, { recursive: true });
      await fs.writeFile(path.join(centralRoot, 'simple.md'), '# Simple');

      const targetDir = path.join(tmpDir, 'target');

      await syncFileCommand({
        mdFilePath: path.join(centralRoot, 'simple.md'),
        sharedResources: [],
        centralRoot,
        targetDir,
        commandName: 'simple',
      });

      const targetMd = await fs.readFile(path.join(targetDir, 'simple.md'), 'utf-8');
      expect(targetMd).toBe('# Simple');
    });
  });

  describe('collectToDirectory', () => {
    it('should merge .md and resource dir into directory-form', async () => {
      // target flat-form
      const targetDir = path.join(tmpDir, 'target');
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(path.join(targetDir, 'migrate.md'), '# Migrate');
      const resourceDir = path.join(targetDir, 'migrate');
      await fs.mkdir(resourceDir, { recursive: true });
      await fs.writeFile(path.join(resourceDir, 'core.mdx'), 'core');

      // collect to central
      const destDir = path.join(tmpDir, 'central', 'migrate');

      await collectToDirectory({
        mdFilePath: path.join(targetDir, 'migrate.md'),
        resourceDirPath: resourceDir,
        destDir,
        commandName: 'migrate',
      });

      const centralMd = await fs.readFile(path.join(destDir, 'migrate.md'), 'utf-8');
      expect(centralMd).toBe('# Migrate');

      const centralResource = await fs.readFile(path.join(destDir, 'core.mdx'), 'utf-8');
      expect(centralResource).toBe('core');
    });

    it('should skip .git directories when collecting resources', async () => {
      const targetDir = path.join(tmpDir, 'target');
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(path.join(targetDir, 'migrate.md'), '# Migrate');

      const resourceDir = path.join(targetDir, 'migrate');
      await fs.mkdir(path.join(resourceDir, '.git'), { recursive: true });
      await fs.writeFile(path.join(resourceDir, 'core.mdx'), 'core');
      await fs.writeFile(path.join(resourceDir, '.git', 'HEAD'), 'ref: refs/heads/main\n');

      const destDir = path.join(tmpDir, 'central', 'migrate');

      await collectToDirectory({
        mdFilePath: path.join(targetDir, 'migrate.md'),
        resourceDirPath: resourceDir,
        destDir,
        commandName: 'migrate',
      });

      const gitDirExists = await fs
        .access(path.join(destDir, '.git'))
        .then(() => true)
        .catch(() => false);

      expect(await fs.readFile(path.join(destDir, 'core.mdx'), 'utf-8')).toBe('core');
      expect(gitDirExists).toBe(false);
    });

    it('should handle .md without resource dir', async () => {
      const targetDir = path.join(tmpDir, 'target');
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(path.join(targetDir, 'simple.md'), '# Simple');

      const destDir = path.join(tmpDir, 'central', 'simple');

      await collectToDirectory({
        mdFilePath: path.join(targetDir, 'simple.md'),
        destDir,
        commandName: 'simple',
      });

      const centralMd = await fs.readFile(path.join(destDir, 'simple.md'), 'utf-8');
      expect(centralMd).toBe('# Simple');
    });
  });

  describe('collectToFile', () => {
    it('should copy .md file to destination', async () => {
      const srcMd = path.join(tmpDir, 'target', 'auto-fix.md');
      await fs.mkdir(path.join(tmpDir, 'target'), { recursive: true });
      await fs.writeFile(srcMd, '# Auto Fix');

      const destMd = path.join(tmpDir, 'central', 'auto-fix.md');

      await collectToFile({ mdFilePath: srcMd, destMdPath: destMd });

      const content = await fs.readFile(destMd, 'utf-8');
      expect(content).toBe('# Auto Fix');
    });
  });

  describe('detectTargetCommands', () => {
    it('should detect .md files in target dir', async () => {
      const targetDir = path.join(tmpDir, 'target');
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(path.join(targetDir, 'auto-fix.md'), '# Auto Fix');
      await fs.writeFile(path.join(targetDir, 'init.md'), '# Init');

      const result = await detectTargetCommands(targetDir);
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.name)).toEqual(['auto-fix', 'init']);
      expect(result.every((c) => c.resourceDirPath === undefined)).toBe(true);
    });

    it('should associate same-name resource directories', async () => {
      const targetDir = path.join(tmpDir, 'target');
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(path.join(targetDir, 'migrate.md'), '# Migrate');
      await fs.mkdir(path.join(targetDir, 'migrate'), { recursive: true });
      await fs.writeFile(path.join(targetDir, 'migrate', 'core.mdx'), 'core');

      const result = await detectTargetCommands(targetDir);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('migrate');
      expect(result[0]!.resourceDirPath).toBe(path.join(targetDir, 'migrate'));
    });

    it('should return empty for nonexistent directory', async () => {
      const result = await detectTargetCommands(path.join(tmpDir, 'nonexistent'));
      expect(result).toEqual([]);
    });

    it('should ignore non-.md files', async () => {
      const targetDir = path.join(tmpDir, 'target');
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(path.join(targetDir, 'readme.txt'), 'not a command');
      await fs.writeFile(path.join(targetDir, 'data.json'), '{}');

      const result = await detectTargetCommands(targetDir);
      expect(result).toEqual([]);
    });
  });
});
