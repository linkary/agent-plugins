import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useResolve } from './render.js';

type ReviewConfirmProps = {
  message: string;
  summaryLines?: string[];
  detailLines?: string[];
  defaultValue?: boolean;
};

const PAGE_SIZE = 12;

export function getVisibleReviewLines(lines: string[], offset: number, pageSize = PAGE_SIZE) {
  const maxOffset = Math.max(0, lines.length - pageSize);
  const safeOffset = Math.min(Math.max(offset, 0), maxOffset);
  return {
    offset: safeOffset,
    end: Math.min(lines.length, safeOffset + pageSize),
    visibleLines: lines.slice(safeOffset, safeOffset + pageSize),
    total: lines.length,
  };
}

export function ReviewConfirm(props: ReviewConfirmProps) {
  const { message, summaryLines = [], detailLines = [], defaultValue = false } = props;
  const resolve = useResolve<boolean>();
  const [value, setValue] = useState<boolean | null>(null);
  const [detailOffset, setDetailOffset] = useState(0);

  const hint = defaultValue ? 'Y/n' : 'y/N';
  const display = value === null ? hint : value ? 'Yes' : 'No';
  const detailPage = getVisibleReviewLines(detailLines, detailOffset);
  const hasOverflow = detailPage.total > detailPage.visibleLines.length;

  useInput((input, key) => {
    if (key.return) {
      resolve(value ?? defaultValue);
      return;
    }

    const lower = input.toLowerCase();
    if (lower === 'y') {
      setValue(true);
      return;
    }
    if (lower === 'n') {
      setValue(false);
      return;
    }

    if (key.upArrow || lower === 'k') {
      setDetailOffset((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (key.downArrow || lower === 'j') {
      setDetailOffset((prev) => Math.min(prev + 1, Math.max(0, detailLines.length - PAGE_SIZE)));
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="green">? <Text bold>{message}</Text></Text>
        <Text> ({display})</Text>
      </Box>
      {summaryLines.map((line, index) => (
        <Text key={`summary-${index}`}>  {line}</Text>
      ))}
      {detailPage.visibleLines.map((line, index) => (
        <Text key={`detail-${detailPage.offset + index}`}>  {line}</Text>
      ))}
      <Text dimColor>
        {'  '}y confirm  n cancel
        {detailLines.length > 0
          ? `  ${hasOverflow ? '↑↓ scroll' : 'review'}  ${detailPage.offset + 1}-${detailPage.end}/${detailPage.total}`
          : ''}
        {'  '}⏎ submit
      </Text>
    </Box>
  );
}
