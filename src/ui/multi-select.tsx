import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useResolve } from './render.js';

export type MultiSelectOption<T extends string = string> = {
  label: string;
  detailLines?: string[];
  value: T;
};

type MultiSelectProps<T extends string = string> = {
  message: string;
  options: MultiSelectOption<T>[];
  defaultSelected?: T[] | 'all';
  sortDefaultSelectedToTop?: boolean;
};

const CHECKED = '◉';
const UNCHECKED = '◯';
const POINTER = '>';
const PAGE_SIZE = 15;
const DETAIL_INDENT = '     ';

export function orderMultiSelectOptions<T extends string>(
  options: MultiSelectOption<T>[],
  defaultSelected?: T[] | 'all',
  sortDefaultSelectedToTop?: boolean,
): MultiSelectOption<T>[] {
  if (!sortDefaultSelectedToTop || !defaultSelected || defaultSelected === 'all') return options;

  const selectedSet = new Set(defaultSelected);
  if (selectedSet.size === 0) return options;

  const prioritized: MultiSelectOption<T>[] = [];
  const rest: MultiSelectOption<T>[] = [];

  for (const option of options) {
    if (selectedSet.has(option.value)) prioritized.push(option);
    else rest.push(option);
  }

  if (prioritized.length === 0) return options;
  return [...prioritized, ...rest];
}

export function MultiSelect<T extends string>(props: MultiSelectProps<T>) {
  const { message, options, defaultSelected, sortDefaultSelectedToTop } = props;
  const resolve = useResolve<T[]>();

  const orderedOptions = useMemo(
    () => orderMultiSelectOptions(options, defaultSelected, sortDefaultSelectedToTop),
    [options, defaultSelected, sortDefaultSelectedToTop],
  );

  const initialSet = useMemo(() => {
    if (defaultSelected === 'all') return new Set(options.map((o) => o.value));
    return new Set(defaultSelected ?? []);
  }, [defaultSelected, options]);

  const [selected, setSelected] = useState<Set<T>>(initialSet);
  const [cursor, setCursor] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  // 搜索过滤
  const filtered = useMemo(() => {
    if (!searchTerm) return orderedOptions;
    const term = searchTerm.toLowerCase();
    return orderedOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(term) ||
        o.value.toLowerCase().includes(term) ||
        o.detailLines?.some((line) => line.toLowerCase().includes(term)),
    );
  }, [orderedOptions, searchTerm]);

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

    // Backspace / Delete: 删除搜索词末尾字符
    // macOS 的 Backspace 键发送 \x7f，Ink 映射为 key.delete 而非 key.backspace
    if (key.backspace || key.delete) {
      setSearchTerm((prev) => prev.slice(0, -1));
      setCursor(0);
      return;
    }

    // 其他字符输入作为搜索
    if (!key.ctrl && !key.meta && !key.escape && !key.tab && input) {
      setSearchTerm((prev) => prev + input);
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
            <Box key={opt.value} flexDirection="column">
              <Text color={isActive ? 'cyan' : undefined}>
                {isActive ? POINTER : ' '}
                <Text color={isChecked ? 'green' : undefined}>{isChecked ? CHECKED : UNCHECKED}</Text>
                {' '}{opt.label}
              </Text>
              {opt.detailLines?.map((line, index) => (
                <Text key={`${opt.value}-detail-${index}`} color={isActive ? 'cyan' : undefined}>
                  {DETAIL_INDENT}{line}
                </Text>
              ))}
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
