import React, { useState, useCallback, useMemo } from 'react';
import { render } from 'ink';
import { Box, Text, useInput, useStdout } from 'ink';
import { readCentralGlobalRuleItems, getCentralGlobalRulesPath } from '../../core/rule-store.js';
import { shortHash, displayItem, type RuleItem } from '../../util/global-rules-store.js';
import { SkillBrowser, type SkillEntry } from '../../ui/skill-browser.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdRulesShow(_positionals: string[], _flags: ParsedFlags, ctx: CliRunContext) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('show requires an interactive terminal (TTY).\n');
    return 1;
  }

  const items = await readCentralGlobalRuleItems();
  if (items.length === 0) {
    process.stdout.write('(no global rules found)\n');
    return 0;
  }

  const globalPath = getCentralGlobalRulesPath();
  const contentByHash = new Map(items.map((item) => [item.hash, item.content]));
  const entries: SkillEntry[] = items.map((item) => ({
    name: `[${shortHash(item.hash)}] ${displayItem(item)}`,
    path: globalPath,
  }));

  return new Promise<number>((resolve) => {
    const instance = render(
      <ShowApp
        entries={entries}
        contentByHash={contentByHash}
        currentCwd={ctx.cwd}
        onExit={() => {
          instance.unmount();
          resolve(0);
        }}
      />,
    );
  });
}

// ---------------------------------------------------------------------------
// App: SkillBrowser ↔ ContentViewer 切换
// ---------------------------------------------------------------------------

type ShowAppProps = {
  entries: SkillEntry[];
  contentByHash: Map<string, string>;
  currentCwd: string;
  onExit: () => void;
};

function ShowApp({ entries, contentByHash, currentCwd, onExit }: ShowAppProps) {
  const [view, setView] = useState<'browser' | 'viewer'>('browser');
  const [selectedEntry, setSelectedEntry] = useState<SkillEntry | null>(null);

  const handleSelect = useCallback((entry: SkillEntry) => {
    setSelectedEntry(entry);
    setView('viewer');
  }, []);

  const handleBack = useCallback(() => {
    setView('browser');
  }, []);

  if (view === 'viewer' && selectedEntry) {
    // 从 name 中提取 hash: "[abcdef12] ..." → 找到对应 content
    const hashPrefix = selectedEntry.name.match(/^\[([0-9a-f]+)\]/)?.[1] ?? '';
    const fullHash = [...contentByHash.keys()].find((h) => h.includes(hashPrefix)) ?? '';
    const content = contentByHash.get(fullHash) ?? '';

    return (
      <ContentViewer
        title={hashPrefix}
        content={content}
        onBack={handleBack}
      />
    );
  }

  return (
    <SkillBrowser
      skills={entries}
      currentCwd={currentCwd}
      initialSkillName={selectedEntry?.name}
      onSelect={handleSelect}
      onExit={onExit}
      listLabel="Rules"
      formatInfoTitle={(entry) => {
        const hash = entry.name.match(/^\[([0-9a-f]+)\]/)?.[1] ?? entry.name;
        return hash;
      }}
      readDescription={async (_path, name) => {
        const hashPrefix = name.match(/^\[([0-9a-f]+)\]/)?.[1] ?? '';
        const fullHash = [...contentByHash.keys()].find((h) => h.includes(hashPrefix));
        return fullHash ? contentByHash.get(fullHash) : undefined;
      }}
      findSynced={async () => []}
    />
  );
}

// ---------------------------------------------------------------------------
// ContentViewer: 纯文本内容查看器 (与 FileViewer 相同的键盘操作)
// ---------------------------------------------------------------------------

type ContentViewerProps = {
  title: string;
  content: string;
  onBack: () => void;
};

function ContentViewer({ title, content, onBack }: ContentViewerProps) {
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  const viewHeight = Math.max(5, termHeight - 5);

  const lines = useMemo(() => content.split('\n'), [content]);
  const [scrollOffset, setScrollOffset] = useState(0);
  const maxScroll = Math.max(0, lines.length - viewHeight);

  const visibleLines = useMemo(
    () => lines.slice(scrollOffset, scrollOffset + viewHeight),
    [lines, scrollOffset, viewHeight],
  );

  useInput((input, key) => {
    if (key.escape || key.backspace || input === 'q') {
      onBack();
      return;
    }
    if (key.upArrow || input === 'k') {
      setScrollOffset((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow || input === 'j') {
      setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
    }
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
    if (input === 'g') setScrollOffset(0);
    if (input === 'G') setScrollOffset(maxScroll);
  });

  const pct = maxScroll > 0 ? Math.round((scrollOffset / maxScroll) * 100) : 100;
  const posLabel =
    maxScroll === 0 ? 'All' : scrollOffset === 0 ? 'Top' : scrollOffset >= maxScroll ? 'Bot' : `${pct}%`;

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color="cyan">{title}</Text>
        <Text dimColor>
          {scrollOffset + 1}-{Math.min(scrollOffset + viewHeight, lines.length)}/{lines.length} {posLabel}
        </Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} height={viewHeight + 2}>
        {visibleLines.map((line, i) => (
          <Text key={`${scrollOffset}-${i}`}>{line}</Text>
        ))}
      </Box>

      <Box>
        <Text dimColor>{'  '}↑↓/jk scroll  f/b page  d/u half  g/G top/end  q/Esc back</Text>
      </Box>
    </Box>
  );
}
