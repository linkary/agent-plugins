import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useResolve } from './render.js';

export type MultiSelectOption<T extends string = string> = {
  label: string;
  value: T;
};

type MultiSelectProps<T extends string = string> = {
  message: string;
  options: MultiSelectOption<T>[];
  defaultSelected?: T[] | 'all';
};

const CHECKED = '◉';
const UNCHECKED = '◯';
const POINTER = '>';
const PAGE_SIZE = 15;

export function MultiSelect<T extends string>(props: MultiSelectProps<T>) {
  const { message, options, defaultSelected } = props;
  const resolve = useResolve<T[]>();

  const initialSet = useMemo(() => {
    if (defaultSelected === 'all') return new Set(options.map((o) => o.value));
    return new Set(defaultSelected ?? []);
  }, []);

  const [selected, setSelected] = useState<Set<T>>(initialSet);
  const [cursor, setCursor] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  // 搜索过滤
  const filtered = useMemo(() => {
    if (!searchTerm) return options;
    const term = searchTerm.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(term) || o.value.toLowerCase().includes(term),
    );
  }, [options, searchTerm]);

  // 分页
  const safeCursor = Math.min(cursor, Math.max(0, filtered.length - 1));
  const pageStart = Math.max(0, Math.min(safeCursor - Math.floor(PAGE_SIZE / 2), filtered.length - PAGE_SIZE));
  const visible = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useInput((input, key) => {
    if (key.return) {
      // 提交选中项（保留原始顺序）
      const result = options.filter((o) => selected.has(o.value)).map((o) => o.value);
      resolve(result);
      return;
    }

    if (input === ' ') {
      // 切换当前项
      const item = filtered[safeCursor];
      if (!item) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(item.value)) next.delete(item.value);
        else next.add(item.value);
        return next;
      });
      return;
    }

    if (key.upArrow) {
      setCursor((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
      return;
    }

    // Ctrl+A: 全选/全不选
    if (key.ctrl && input === 'a') {
      const allSelected = filtered.every((o) => selected.has(o.value));
      setSelected((prev) => {
        const next = new Set(prev);
        if (allSelected) {
          filtered.forEach((o) => next.delete(o.value));
        } else {
          filtered.forEach((o) => next.add(o.value));
        }
        return next;
      });
      return;
    }

    // Ctrl+R: 反选
    if (key.ctrl && input === 'r') {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((o) => {
          if (next.has(o.value)) next.delete(o.value);
          else next.add(o.value);
        });
        return next;
      });
      return;
    }

    // 其他字符输入作为搜索
    if (!key.ctrl && !key.meta && !key.escape && !key.tab && input) {
      setSearchTerm((prev) => prev + input);
      setCursor(0);
      return;
    }

    if (key.backspace) {
      setSearchTerm((prev) => prev.slice(0, -1));
      setCursor(0);
      return;
    }

    if (key.escape) {
      if (searchTerm) {
        setSearchTerm('');
        setCursor(0);
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="green">? <Text bold>{message}</Text></Text>
        {searchTerm ? <Text color="cyan"> [search: &quot;{searchTerm}&quot;]</Text> : null}
      </Box>
      {filtered.length === 0 ? (
        <Text dimColor>  (no matches)</Text>
      ) : (
        visible.map((opt, i) => {
          const realIndex = pageStart + i;
          const isActive = realIndex === safeCursor;
          const isChecked = selected.has(opt.value);
          return (
            <Box key={opt.value}>
              <Text color={isActive ? 'cyan' : undefined}>
                {isActive ? POINTER : ' '}
                <Text color={isChecked ? 'green' : undefined}>{isChecked ? CHECKED : UNCHECKED}</Text>
                {' '}{opt.label}
              </Text>
            </Box>
          );
        })
      )}
      <Text dimColor>
        {'  '}↑↓ navigate  space toggle  {selected.size} selected  ^a all  ^r invert  ⏎ submit
      </Text>
    </Box>
  );
}
