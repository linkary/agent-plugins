import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { readSkillDescription, formatRelativeTime, formatSourceShort } from '../util/skill-meta.js';
import { findSyncedCopies, type SyncedCopy } from '../commands/skills/manage-utils.js';
import { loadConfig } from '../core/config.js';
import type { SkillRecord } from '../core/registry.js';

// ─── Types ──────────────────────────────────────────────────────────────

export type SkillEntry = {
  name: string;
  path: string;
  record?: SkillRecord;
};

type SkillBrowserProps = {
  skills: SkillEntry[];
  currentCwd: string;
  /** 恢复上次选中的 skill 名称 */
  initialSkillName?: string;
  onSelect: (skill: SkillEntry) => void;
  onExit: () => void;
};

type MetaInfo = {
  description?: string;
  source: string;
  addedAt: string;
  updatedAt: string;
  path: string;
  syncedTo: SyncedCopy[];
};

// ─── Component ──────────────────────────────────────────────────────────

const POINTER = '>';
const MIN_INFO_WIDTH = 30;

export function SkillBrowser(props: SkillBrowserProps) {
  const { skills, currentCwd, initialSkillName, onSelect, onExit } = props;
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  const termHeight = stdout?.rows ?? 24;

  // 搜索过滤
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    if (!searchQuery) return skills;
    const q = searchQuery.toLowerCase();
    return skills.filter((s) => s.name.toLowerCase().includes(q));
  }, [skills, searchQuery]);

  // 初始光标位置：恢复上次选中的 skill
  const initialIndex = useMemo(() => {
    if (!initialSkillName) return 0;
    const idx = filtered.findIndex((s) => s.name === initialSkillName);
    return idx >= 0 ? idx : 0;
  }, []); // 仅初始化一次

  const [cursor, setCursor] = useState(initialIndex);
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const [loading, setLoading] = useState(false);

  // 左右面板宽度计算
  const listWidth = Math.max(20, Math.floor(termWidth * 0.35));
  const infoWidth = Math.max(MIN_INFO_WIDTH, termWidth - listWidth - 3);
  const pageSize = Math.max(5, termHeight - 6);

  // 光标越界修正
  const safeCursor = Math.min(cursor, Math.max(0, filtered.length - 1));

  // 加载当前高亮 skill 的元数据
  useEffect(() => {
    const skill = filtered[safeCursor];
    if (!skill) { setMeta(null); return; }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const config = await loadConfig();
      const [desc, syncedCopies] = await Promise.all([
        readSkillDescription(skill.path),
        findSyncedCopies({ skillNames: [skill.name], config, currentCwd }),
      ]);

      if (cancelled) return;

      setMeta({
        description: desc,
        source: formatSourceShort(skill.record?.source),
        addedAt: formatRelativeTime(skill.record?.addedAt),
        updatedAt: formatRelativeTime(skill.record?.updatedAt),
        path: skill.path,
        syncedTo: syncedCopies,
      });
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [safeCursor, filtered]);

  useInput((input, key) => {
    // ── 搜索模式下的输入处理 ──
    if (searchMode) {
      if (key.escape || key.return) {
        setSearchMode(false);
        return;
      }
      if (key.backspace || key.delete) {
        setSearchQuery((prev) => prev.slice(0, -1));
        setCursor(0);
        return;
      }
      // 普通字符追加到搜索词
      if (input && !key.ctrl && !key.meta) {
        setSearchQuery((prev) => prev + input);
        setCursor(0);
      }
      return;
    }

    // ── 普通模式 ──
    if (input === 'q' || key.escape) {
      if (searchQuery) {
        // 先清除搜索
        setSearchQuery('');
        setCursor(0);
        return;
      }
      onExit();
      return;
    }
    if (input === '/') {
      setSearchMode(true);
      return;
    }
    if (key.return) {
      const skill = filtered[safeCursor];
      if (skill) onSelect(skill);
      return;
    }

    // 导航
    if (key.upArrow || input === 'k') {
      setCursor((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
    }
    if (key.downArrow || input === 'j') {
      setCursor((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
    }

    // 跳转到首尾
    if (input === 'g') {
      setCursor(0);
    }
    if (input === 'G') {
      setCursor(Math.max(0, filtered.length - 1));
    }

    // 翻页
    if (key.pageUp || (key.ctrl && input === 'u')) {
      setCursor((prev) => Math.max(0, prev - pageSize));
    }
    if (key.pageDown || (key.ctrl && input === 'd')) {
      setCursor((prev) => Math.min(filtered.length - 1, prev + pageSize));
    }
  });

  // 分页
  const pageStart = Math.max(0, Math.min(safeCursor - Math.floor(pageSize / 2), filtered.length - pageSize));
  const visible = filtered.slice(pageStart, pageStart + pageSize);

  const currentSkill = filtered[safeCursor];

  return (
    <Box flexDirection="column">
      {/* 搜索栏 */}
      {(searchMode || searchQuery) && (
        <Box>
          <Text color="yellow">/{searchQuery}</Text>
          {searchMode && <Text color="yellow">_</Text>}
          {searchQuery && !searchMode && (
            <Text dimColor> ({filtered.length} match{filtered.length !== 1 ? 'es' : ''})</Text>
          )}
        </Box>
      )}

      {/* 主面板 */}
      <Box>
        {/* 左侧：skill 列表 */}
        <Box
          flexDirection="column"
          width={listWidth}
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
        >
          <Text bold color="cyan">Skills ({filtered.length})</Text>
          {visible.map((skill, i) => {
            const realIndex = pageStart + i;
            const isActive = realIndex === safeCursor;
            return (
              <Text key={skill.name} color={isActive ? 'cyan' : undefined} wrap="truncate">
                {isActive ? POINTER : ' '} {skill.name}
              </Text>
            );
          })}
          {filtered.length > pageSize && (
            <Text dimColor>  {safeCursor + 1}/{filtered.length}</Text>
          )}
        </Box>

        {/* 右侧：元数据面板 */}
        <Box
          flexDirection="column"
          width={infoWidth}
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
        >
          <Text bold color="cyan">Info</Text>
          {loading ? (
            <Text dimColor>Loading...</Text>
          ) : meta && currentSkill ? (
            <Box flexDirection="column">
              <Text bold>{currentSkill.name}</Text>
              {meta.source ? (
                <Text><Text dimColor>Source:  </Text>{meta.source}</Text>
              ) : null}
              {meta.addedAt ? (
                <Text><Text dimColor>Added:   </Text>{meta.addedAt}</Text>
              ) : null}
              {meta.updatedAt ? (
                <Text><Text dimColor>Updated: </Text>{meta.updatedAt}</Text>
              ) : null}
              <Text wrap="truncate"><Text dimColor>Path:    </Text>{meta.path}</Text>
              {meta.description ? (
                <Box marginTop={1}>
                  <Text wrap="wrap">{meta.description}</Text>
                </Box>
              ) : null}
              {meta.syncedTo.length > 0 ? (
                <Box flexDirection="column" marginTop={1}>
                  <Text dimColor>Synced to:</Text>
                  {meta.syncedTo.map((c) => (
                    <Text key={`${c.adapterId}-${c.scope}`}>
                      {'  '}{c.adapterLabel} ({c.scope})
                    </Text>
                  ))}
                </Box>
              ) : null}
            </Box>
          ) : (
            <Text dimColor>(no skill selected)</Text>
          )}
        </Box>
      </Box>

      {/* 帮助行 */}
      <Box>
        <Text dimColor>
          {'  '}↑↓/jk navigate  g/G top/end  PgUp/PgDn page  / search  ⏎ open  q quit
        </Text>
      </Box>
    </Box>
  );
}
