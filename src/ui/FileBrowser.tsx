import React, { useState, useEffect, useRef } from 'react';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Box, Text, useInput, useStdout } from 'ink';
import { FileViewer } from './FileViewer.js';

// ─── Types ──────────────────────────────────────────────────────────────

type FileEntry = {
  name: string;
  isDirectory: boolean;
};

type FileBrowserProps = {
  /** skill 根目录的绝对路径 */
  rootPath: string;
  skillName: string;
  onBack: () => void;
};

// ─── Component ──────────────────────────────────────────────────────────

const POINTER = '>';
const FOLDER_ICON = '📁';
const FILE_ICON = '  ';

export function FileBrowser(props: FileBrowserProps) {
  const { rootPath, skillName, onBack } = props;
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  const pageSize = Math.max(5, termHeight - 8);

  // 当前浏览目录（相对于 rootPath）
  const [currentDir, setCurrentDir] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [cursor, setCursor] = useState(0);
  // 文件预览：存储选中文件的绝对路径和名称
  const [viewingFile, setViewingFile] = useState<{ absPath: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 记住每个目录的上次选中条目名，用于返回时恢复光标
  const cursorMemory = useRef<Map<string, string>>(new Map());

  const absDir = path.join(rootPath, currentDir);
  const breadcrumb = currentDir ? `${skillName}/${currentDir}` : skillName;

  // 进入子目录：记住当前选中条目并切换
  const enterChild = (childName: string) => {
    cursorMemory.current.set(currentDir, childName);
    setCurrentDir(currentDir ? `${currentDir}/${childName}` : childName);
  };

  // 返回上级目录
  const goUp = () => {
    if (currentDir) {
      const parent = path.dirname(currentDir);
      setCurrentDir(parent === '.' ? '' : parent);
    } else {
      onBack();
    }
  };

  // 加载目录内容
  useEffect(() => {
    let cancelled = false;
    setViewingFile(null);
    setError(null);

    (async () => {
      try {
        const items = await fs.readdir(absDir);
        const stats = await Promise.all(
          items.map(async (name) => {
            try {
              const stat = await fs.stat(path.join(absDir, name));
              return { name, isDirectory: stat.isDirectory() };
            } catch {
              return { name, isDirectory: false };
            }
          }),
        );
        // 目录在前，文件在后，各自按名称排序
        stats.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        if (!cancelled) {
          setEntries(stats);

          // 恢复上次选中的条目光标位置
          const remembered = cursorMemory.current.get(currentDir);
          if (remembered) {
            const idx = stats.findIndex((e) => e.name === remembered);
            setCursor(idx >= 0 ? idx : 0);
          } else {
            setCursor(0);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setEntries([]);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [currentDir]);

  useInput((input, key) => {
    // 文件预览模式下的输入由 FileViewer 处理
    if (viewingFile) return;

    if (input === 'q' || key.escape) {
      onBack();
      return;
    }

    // 返回上级
    if (key.backspace || key.leftArrow || input === 'h') {
      goUp();
      return;
    }

    // 进入 / 打开
    if (key.return || key.rightArrow || input === 'l') {
      const entry = entries[cursor];
      if (!entry) return;
      if (entry.isDirectory) {
        enterChild(entry.name);
      } else {
        setViewingFile({ absPath: path.join(absDir, entry.name), name: entry.name });
      }
      return;
    }

    // 导航
    if (key.upArrow || input === 'k') {
      setCursor((prev) => (prev > 0 ? prev - 1 : entries.length - 1));
    }
    if (key.downArrow || input === 'j') {
      setCursor((prev) => (prev < entries.length - 1 ? prev + 1 : 0));
    }

    // 跳转到首尾
    if (input === 'g') {
      setCursor(0);
    }
    if (input === 'G') {
      setCursor(Math.max(0, entries.length - 1));
    }

    // 翻页
    if (key.pageUp || (key.ctrl && input === 'u')) {
      setCursor((prev) => Math.max(0, prev - pageSize));
    }
    if (key.pageDown || (key.ctrl && input === 'd')) {
      setCursor((prev) => Math.min(entries.length - 1, prev + pageSize));
    }
  });

  // ── 文件预览模式 ──
  if (viewingFile) {
    return (
      <FileViewer
        filePath={viewingFile.absPath}
        title={`${breadcrumb}/${viewingFile.name}`}
        onBack={() => setViewingFile(null)}
      />
    );
  }

  // ── 目录列表模式 ──
  const safeCursor = Math.min(cursor, Math.max(0, entries.length - 1));
  const pageStart = Math.max(0, Math.min(safeCursor - Math.floor(pageSize / 2), entries.length - pageSize));
  const visible = entries.slice(pageStart, pageStart + pageSize);

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{breadcrumb}/</Text>

      {error ? (
        <Text color="red">Error: {error}</Text>
      ) : entries.length === 0 ? (
        <Text dimColor>(empty directory)</Text>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {visible.map((entry, i) => {
            const realIndex = pageStart + i;
            const isActive = realIndex === safeCursor;
            const icon = entry.isDirectory ? FOLDER_ICON : FILE_ICON;
            return (
              <Text key={entry.name} color={isActive ? 'cyan' : undefined}>
                {isActive ? POINTER : ' '} {icon} {entry.name}{entry.isDirectory ? '/' : ''}
              </Text>
            );
          })}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          {'  '}↑↓/jk navigate  g/G top/end  ⏎/l open  h/← back  q quit
        </Text>
      </Box>
    </Box>
  );
}
