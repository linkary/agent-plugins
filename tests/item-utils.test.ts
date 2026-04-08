import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  computeCombinedItemStats,
  computeItemHash,
  computeItemStats,
  computeCommandHash,
  copyItem,
  removeItem,
} from '../src/util/item-utils.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-item-utils-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('item-utils', () => {
  describe('computeItemHash', () => {
    it('should hash a file', async () => {
      const filePath = path.join(tmpDir, 'test.md');
      await fs.writeFile(filePath, '# Test');

      const hash = await computeItemHash(filePath);
      expect(hash).toStartWith('sha256:');
      expect(hash.length).toBeGreaterThan(10);
    });

    it('should hash a directory', async () => {
      const dirPath = path.join(tmpDir, 'test-dir');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'a.md'), 'aaa');
      await fs.writeFile(path.join(dirPath, 'b.txt'), 'bbb');

      const hash = await computeItemHash(dirPath);
      expect(hash).toStartWith('sha256:');
    });

    it('should produce same hash for same content', async () => {
      const file1 = path.join(tmpDir, 'a.md');
      const file2 = path.join(tmpDir, 'b.md');
      await fs.writeFile(file1, 'same content');
      await fs.writeFile(file2, 'same content');

      const hash1 = await computeItemHash(file1);
      const hash2 = await computeItemHash(file2);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different content', async () => {
      const file1 = path.join(tmpDir, 'a.md');
      const file2 = path.join(tmpDir, 'b.md');
      await fs.writeFile(file1, 'content A');
      await fs.writeFile(file2, 'content B');

      const hash1 = await computeItemHash(file1);
      const hash2 = await computeItemHash(file2);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('computeCommandHash', () => {
    it('should hash directory-form command', async () => {
      const cmdDir = path.join(tmpDir, 'migrate');
      await fs.mkdir(cmdDir, { recursive: true });
      await fs.writeFile(path.join(cmdDir, 'migrate.md'), '# Migrate');
      await fs.writeFile(path.join(cmdDir, 'core.mdx'), 'core');

      const hash = await computeCommandHash({
        commandName: 'migrate',
        commandsDir: tmpDir,
        form: 'directory',
      });
      expect(hash).toStartWith('sha256:');
    });

    it('should hash file-form command without shared resources', async () => {
      await fs.writeFile(path.join(tmpDir, 'auto-fix.md'), '# Auto Fix');

      const hash = await computeCommandHash({
        commandName: 'auto-fix',
        commandsDir: tmpDir,
        form: 'file',
      });
      expect(hash).toStartWith('sha256:');
    });

    it('should include shared resources in file-form hash', async () => {
      await fs.writeFile(path.join(tmpDir, 'refactor.md'), '# Refactor');
      const sharedDir = path.join(tmpDir, 'shared');
      await fs.mkdir(sharedDir, { recursive: true });
      await fs.writeFile(path.join(sharedDir, 'patterns.mdx'), 'patterns');

      const hashWith = await computeCommandHash({
        commandName: 'refactor',
        commandsDir: tmpDir,
        form: 'file',
        sharedResources: ['shared/patterns.mdx'],
      });

      const hashWithout = await computeCommandHash({
        commandName: 'refactor',
        commandsDir: tmpDir,
        form: 'file',
        sharedResources: [],
      });

      expect(hashWith).not.toBe(hashWithout);
    });
  });

  describe('computeItemStats', () => {
    it('should collect recursive size and latest change time for a directory', async () => {
      const dirPath = path.join(tmpDir, 'skill');
      const nestedDir = path.join(dirPath, 'docs');
      await fs.mkdir(nestedDir, { recursive: true });

      const readmePath = path.join(dirPath, 'README.md');
      const guidePath = path.join(nestedDir, 'guide.md');
      await fs.writeFile(readmePath, 'hello');
      await fs.writeFile(guidePath, 'world!!!');

      const early = new Date('2026-04-01T09:12:00.000Z');
      const late = new Date('2026-04-06T14:33:00.000Z');
      await fs.utimes(readmePath, early, early);
      await fs.utimes(guidePath, late, late);
      await fs.utimes(nestedDir, late, late);
      await fs.utimes(dirPath, early, early);

      const stats = await computeItemStats(dirPath);
      expect(stats).toEqual({
        sizeBytes: 13,
        changedAtMs: late.getTime(),
      });
    });

    it('should ignore configured path segments', async () => {
      const dirPath = path.join(tmpDir, 'command');
      const gitDir = path.join(dirPath, '.git');
      await fs.mkdir(gitDir, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'command.md'), 'abc');
      await fs.writeFile(path.join(gitDir, 'config'), 'ignore-me');

      const stats = await computeItemStats(dirPath, { ignoreNames: ['.git'] });
      expect(stats).toEqual({
        sizeBytes: 3,
        changedAtMs: expect.any(Number),
      });
    });
  });

  describe('computeCombinedItemStats', () => {
    it('should merge multiple paths without double counting duplicates', async () => {
      const first = path.join(tmpDir, 'first.md');
      const second = path.join(tmpDir, 'second.md');
      await fs.writeFile(first, 'abcd');
      await fs.writeFile(second, 'xy');

      const older = new Date('2026-04-01T09:12:00.000Z');
      const newer = new Date('2026-04-06T14:33:00.000Z');
      await fs.utimes(first, older, older);
      await fs.utimes(second, newer, newer);

      const stats = await computeCombinedItemStats([first, second, first]);
      expect(stats).toEqual({
        sizeBytes: 6,
        changedAtMs: newer.getTime(),
      });
    });
  });

  describe('copyItem', () => {
    it('should copy a file', async () => {
      const src = path.join(tmpDir, 'src.md');
      const dest = path.join(tmpDir, 'dest.md');
      await fs.writeFile(src, '# Source');

      await copyItem(src, dest);

      const content = await fs.readFile(dest, 'utf-8');
      expect(content).toBe('# Source');
    });

    it('should copy a directory', async () => {
      const srcDir = path.join(tmpDir, 'src-dir');
      const destDir = path.join(tmpDir, 'dest-dir');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, 'a.md'), 'aaa');
      await fs.writeFile(path.join(srcDir, 'b.txt'), 'bbb');

      await copyItem(srcDir, destDir);

      const aContent = await fs.readFile(path.join(destDir, 'a.md'), 'utf-8');
      const bContent = await fs.readFile(path.join(destDir, 'b.txt'), 'utf-8');
      expect(aContent).toBe('aaa');
      expect(bContent).toBe('bbb');
    });

    it('should create parent directories when copying a file', async () => {
      const src = path.join(tmpDir, 'src.md');
      const dest = path.join(tmpDir, 'deep', 'nested', 'dest.md');
      await fs.writeFile(src, '# Deep');

      await copyItem(src, dest);

      const content = await fs.readFile(dest, 'utf-8');
      expect(content).toBe('# Deep');
    });
  });

  describe('removeItem', () => {
    it('should remove a file', async () => {
      const filePath = path.join(tmpDir, 'to-remove.md');
      await fs.writeFile(filePath, '# Remove me');

      await removeItem(filePath);

      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should remove a directory', async () => {
      const dirPath = path.join(tmpDir, 'to-remove');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'child.md'), 'child');

      await removeItem(dirPath);

      const exists = await fs.access(dirPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should not throw for non-existent path', async () => {
      // 不应抛异常
      await removeItem(path.join(tmpDir, 'nonexistent'));
    });
  });
});
