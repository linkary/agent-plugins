import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  parseCommandMeta,
  parseCommandMetaFromContent,
  readCommandDescription,
} from '../src/util/command-meta.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-cmd-meta-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('command-meta', () => {
  describe('parseCommandMetaFromContent', () => {
    it('should parse description from frontmatter', () => {
      const content = `---
description: Short description for listing
tags: [typescript, migration]
---

# My Command

Content here.`;

      const meta = parseCommandMetaFromContent(content);
      expect(meta.description).toBe('Short description for listing');
      expect(meta.tags).toEqual(['typescript', 'migration']);
    });

    it('should parse resources list from frontmatter', () => {
      const content = `---
description: A refactoring command
resources:
  - shared/typescript-patterns
  - libs/ast-helpers.mdx
tags: [refactor]
---

# Advanced Refactor`;

      const meta = parseCommandMetaFromContent(content);
      expect(meta.description).toBe('A refactoring command');
      expect(meta.resources).toEqual(['shared/typescript-patterns', 'libs/ast-helpers.mdx']);
      expect(meta.tags).toEqual(['refactor']);
    });

    it('should fall back to first heading when no description in frontmatter', () => {
      const content = `---
tags: [misc]
---

# My Great Command

This command does things.`;

      const meta = parseCommandMetaFromContent(content);
      expect(meta.description).toBe('My Great Command');
    });

    it('should extract first heading when no frontmatter at all', () => {
      const content = `# Simple Command

Do something simple.`;

      const meta = parseCommandMetaFromContent(content);
      expect(meta.description).toBe('Simple Command');
    });

    it('should return empty object for empty content', () => {
      const meta = parseCommandMetaFromContent('');
      expect(meta.description).toBeUndefined();
      expect(meta.resources).toBeUndefined();
      expect(meta.tags).toBeUndefined();
    });

    it('should preserve raw frontmatter fields', () => {
      const content = `---
description: Test
allowed-tools: all
model: opus
---

# Test`;

      const meta = parseCommandMetaFromContent(content);
      expect(meta.raw?.['allowed-tools']).toBe('all');
      expect(meta.raw?.model).toBe('opus');
    });

    it('should handle inline array syntax for tags', () => {
      const content = `---
tags: [a, b, c]
---

# Tagged`;

      const meta = parseCommandMetaFromContent(content);
      expect(meta.tags).toEqual(['a', 'b', 'c']);
    });

    it('should handle quoted values', () => {
      const content = `---
description: "Quoted description"
---

# Test`;

      const meta = parseCommandMetaFromContent(content);
      expect(meta.description).toBe('Quoted description');
    });
  });

  describe('parseCommandMeta', () => {
    it('should parse frontmatter from a file', async () => {
      const filePath = path.join(tmpDir, 'test.md');
      await fs.writeFile(
        filePath,
        `---
description: File-based test
resources:
  - shared/utils
---

# Test Command`,
      );

      const meta = await parseCommandMeta(filePath);
      expect(meta.description).toBe('File-based test');
      expect(meta.resources).toEqual(['shared/utils']);
    });

    it('should return empty object for non-existent file', async () => {
      const meta = await parseCommandMeta(path.join(tmpDir, 'nonexistent.md'));
      expect(meta).toEqual({});
    });
  });

  describe('readCommandDescription', () => {
    it('should return description from frontmatter', async () => {
      const filePath = path.join(tmpDir, 'desc.md');
      await fs.writeFile(
        filePath,
        `---
description: My description
---

# Heading`,
      );

      const desc = await readCommandDescription(filePath);
      expect(desc).toBe('My description');
    });

    it('should fallback to first heading', async () => {
      const filePath = path.join(tmpDir, 'heading.md');
      await fs.writeFile(filePath, '# Fallback Heading\n\nContent.');

      const desc = await readCommandDescription(filePath);
      expect(desc).toBe('Fallback Heading');
    });

    it('should return undefined for empty file', async () => {
      const filePath = path.join(tmpDir, 'empty.md');
      await fs.writeFile(filePath, '');

      const desc = await readCommandDescription(filePath);
      expect(desc).toBeUndefined();
    });
  });
});
