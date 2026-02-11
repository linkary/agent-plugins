import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useResolve } from './render.js';

type ChoiceOption = {
  key: string;
  label: string;
};

type ChoiceProps = {
  message: string;
  options: ChoiceOption[];
};

/**
 * 单键选择组件：每个选项绑定一个快捷键，按键即选。
 * 用于冲突解决等场景 (o/b/s/k)。
 */
export function Choice(props: ChoiceProps) {
  const { message, options } = props;
  const resolve = useResolve<string>();

  const keyMap = new Map(options.map((o) => [o.key.toLowerCase(), o.key]));

  useInput((input) => {
    const matched = keyMap.get(input.toLowerCase());
    if (matched) {
      resolve(matched);
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="green">? <Text bold>{message}</Text></Text>
      {options.map((opt) => (
        <Box key={opt.key}>
          <Text>  <Text color="cyan" bold>{opt.key}</Text> {opt.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
