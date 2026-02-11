import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useResolve } from './render.js';

type ConfirmProps = {
  message: string;
  defaultValue?: boolean;
};

export function Confirm(props: ConfirmProps) {
  const { message, defaultValue = false } = props;
  const resolve = useResolve<boolean>();
  const [value, setValue] = useState<boolean | null>(null);

  const hint = defaultValue ? 'Y/n' : 'y/N';

  useInput((input, key) => {
    if (key.return) {
      resolve(value ?? defaultValue);
      return;
    }
    const lower = input.toLowerCase();
    if (lower === 'y') {
      setValue(true);
    } else if (lower === 'n') {
      setValue(false);
    }
  });

  const display = value === null ? hint : value ? 'Yes' : 'No';

  return (
    <Box>
      <Text color="green">? <Text bold>{message}</Text></Text>
      <Text> ({display})</Text>
    </Box>
  );
}
