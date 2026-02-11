import React, { useState, useEffect, useMemo } from 'react';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Box, Text, useInput, useStdout } from 'ink';
import { codeToANSI } from '@shikijs/cli';
import type { BundledLanguage } from 'shiki';

// ─── Types ──────────────────────────────────────────────────────────────

type FileViewerProps = {
  filePath: string;
  title: string;
  onBack: () => void;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; lines: string[]; totalLines: number };

// ─── 文件扩展名 → shiki 语言映射 ──────────────────────────────────────

const EXT_TO_LANG: Record<string, BundledLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.jsonc': 'jsonc',
  '.md': 'markdown',
  '.mdx': 'mdx',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.py': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.fish': 'fish',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.xml': 'xml',
  '.svg': 'xml',
  '.lua': 'lua',
  '.vim': 'viml',
  '.dockerfile': 'dockerfile',
  '.tf': 'terraform',
  '.hcl': 'hcl',
  '.ini': 'ini',
  '.env': 'dotenv',
  '.txt': 'text',
};

/** 根据文件名推断 shiki 语言标识 */
function detectLanguage(filePath: string): BundledLanguage {
  const ext = path.extname(filePath).toLowerCase();
  if (ext && EXT_TO_LANG[ext]) return EXT_TO_LANG[ext];

  // 特殊文件名
  const base = path.basename(filePath).toLowerCase();
  if (base === 'dockerfile' || base.startsWith('dockerfile.')) return 'dockerfile';
  if (base === 'makefile' || base === 'gnumakefile') return 'makefile';
  if (base === '.gitignore' || base === '.dockerignore') return 'gitignore';

  return 'text';
}

// ─── 文件大小限制（避免加载巨大二进制文件）──────────────────────────────
const MAX_FILE_SIZE = 256 * 1024; // 256 KB

// ─── Component ──────────────────────────────────────────────────────────

const THEME = 'vitesse-dark';

export function FileViewer(props: FileViewerProps) {
  const { filePath, title, onBack } = props;
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  // 留出标题行(1) + 状态行(1) + 帮助行(1) + 边距
  const viewHeight = Math.max(5, termHeight - 5);

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [scrollOffset, setScrollOffset] = useState(0);

  // 加载并高亮文件
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 检查文件大小
        const stat = await fs.stat(filePath);
        if (stat.size > MAX_FILE_SIZE) {
          if (!cancelled) {
            setState({
              status: 'error',
              message: `File too large (${(stat.size / 1024).toFixed(0)} KB, limit ${MAX_FILE_SIZE / 1024} KB)`,
            });
          }
          return;
        }

        const raw = await fs.readFile(filePath, 'utf-8');
        const lang = detectLanguage(filePath);

        let highlighted: string;
        try {
          highlighted = await codeToANSI(raw, lang, THEME);
        } catch {
          // 高亮失败时回退到纯文本
          highlighted = raw;
        }

        if (!cancelled) {
          const lines = highlighted.split('\n');
          setState({ status: 'ready', lines, totalLines: lines.length });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [filePath]);

  // 可见行窗口
  const visibleLines = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.lines.slice(scrollOffset, scrollOffset + viewHeight);
  }, [state, scrollOffset, viewHeight]);

  const maxScroll = state.status === 'ready' ? Math.max(0, state.totalLines - viewHeight) : 0;

  useInput((input, key) => {
    // 返回
    if (key.escape || key.backspace || input === 'q') {
      onBack();
      return;
    }
    if (state.status !== 'ready') return;

    // 逐行滚动
    if (key.upArrow || input === 'k') {
      setScrollOffset((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow || input === 'j') {
      setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
    }

    // 翻页（f/b 全页，d/u 半页）
    if (key.pageDown || input === 'f' || input === ' ') {
      setScrollOffset((prev) => Math.min(maxScroll, prev + viewHeight));
    }
    if (key.pageUp || input === 'b') {
      setScrollOffset((prev) => Math.max(0, prev - viewHeight));
    }
    if (input === 'd') {
      setScrollOffset((prev) => Math.min(maxScroll, prev + Math.floor(viewHeight / 2)));
    }
    if (input === 'u') {
      setScrollOffset((prev) => Math.max(0, prev - Math.floor(viewHeight / 2)));
    }

    // 跳转首尾
    if (input === 'g') {
      setScrollOffset(0);
    }
    if (input === 'G') {
      setScrollOffset(maxScroll);
    }
  });

  // ── 渲染 ──

  if (state.status === 'loading') {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">{title}</Text>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  if (state.status === 'error') {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">{title}</Text>
        <Text color="red">{state.message}</Text>
        <Text dimColor>  q/Esc/← back</Text>
      </Box>
    );
  }

  // 滚动百分比指示
  const pct = maxScroll > 0 ? Math.round((scrollOffset / maxScroll) * 100) : 100;
  const posLabel = maxScroll === 0
    ? 'All'
    : scrollOffset === 0
      ? 'Top'
      : scrollOffset >= maxScroll
        ? 'Bot'
        : `${pct}%`;

  return (
    <Box flexDirection="column">
      {/* 标题 + 行号信息 */}
      <Box justifyContent="space-between">
        <Text bold color="cyan">{title}</Text>
        <Text dimColor>
          {scrollOffset + 1}-{Math.min(scrollOffset + viewHeight, state.totalLines)}/{state.totalLines} {posLabel}
        </Text>
      </Box>

      {/* 高亮内容 */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        height={viewHeight + 2} // +2 for border
      >
        {visibleLines.map((line, i) => {
          const lineNum = scrollOffset + i + 1;
          const gutterWidth = String(state.totalLines).length;
          const gutter = String(lineNum).padStart(gutterWidth, ' ');
          return (
            <Text key={`${scrollOffset}-${i}`}>
              <Text dimColor>{gutter} │ </Text>{line}
            </Text>
          );
        })}
      </Box>

      {/* 帮助行 */}
      <Box>
        <Text dimColor>
          {'  '}↑↓/jk scroll  f/b page  d/u half  g/G top/end  q/Esc back
        </Text>
      </Box>
    </Box>
  );
}
