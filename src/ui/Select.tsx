import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useResolve } from './render.js';

export type SelectOption<T extends string = string> = {
  label: string;
  value: T;
};

type SelectProps<T extends string = string> = {
  message: string;
  options: SelectOption<T>[];
  defaultValue?: T;
};

const POINTER = '>';
const PAGE_SIZE = 15;

export function Select<T extends string>(props: SelectProps<T>) {
  const { message, options, defaultValue } = props;
  const resolve = useResolve<T>();

  const initialIndex = defaultValue ? Math.max(0, options.findIndex((o) => o.value === defaultValue)) : 0;
  const [cursor, setCursor] = useState(initialIndex);

  // 分页
  const pageStart = Math.max(0, Math.min(cursor - Math.floor(PAGE_SIZE / 2), options.length - PAGE_SIZE));
  const visible = options.slice(pageStart, pageStart + PAGE_SIZE);

  useInput((input, key) => {
    if (key.return) {
      resolve(options[cursor]!.value);
      return;
    }
    if (key.upArrow) {
      setCursor((prev) => (prev > 0 ? prev - 1 : options.length - 1));
    }
    if (key.downArrow) {
      setCursor((prev) => (prev < options.length - 1 ? prev + 1 : 0));
    }
    // vim 风格
    if (input === 'k') {
      setCursor((prev) => (prev > 0 ? prev - 1 : options.length - 1));
    }
    if (input === 'j') {
      setCursor((prev) => (prev < options.length - 1 ? prev + 1 : 0));
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="green">? <Text bold>{message}</Text></Text>
      {visible.map((opt, i) => {
        const realIndex = pageStart + i;
        const isActive = realIndex === cursor;
        return (
          <Box key={opt.value}>
            <Text color={isActive ? 'cyan' : undefined}>
              {isActive ? POINTER : ' '} {opt.label}
            </Text>
          </Box>
        );
      })}
      {options.length > PAGE_SIZE && (
        <Text dimColor>  ({cursor + 1}/{options.length})</Text>
      )}
    </Box>
  );
}
