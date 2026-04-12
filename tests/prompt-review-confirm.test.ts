import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

let capturedElement: { props: Record<string, unknown> } | null = null;
const originalStdinIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');

mock.module('../src/ui/render.js', () => ({
  runInk: async (element: { props: Record<string, unknown> }) => {
    capturedElement = element;
    return false;
  },
}));

beforeEach(() => {
  capturedElement = null;
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
});

afterEach(() => {
  if (originalStdinIsTTY) Object.defineProperty(process.stdin, 'isTTY', originalStdinIsTTY);
  else delete (process.stdin as { isTTY?: boolean }).isTTY;
});

describe('promptReviewConfirm', () => {
  it('forwards review summary and detail lines to the Ink component', async () => {
    const { promptReviewConfirm } = await import(`../src/util/prompt.js?review-prompt-test=${Math.random()}`);

    await promptReviewConfirm({
      message: 'Remove 2 skills?',
      summaryLines: ['Source: central skills', 'Selected: 2'],
      detailLines: ['alpha', 'beta'],
      default: false,
    });

    expect(capturedElement?.props.message).toBe('Remove 2 skills?');
    expect(capturedElement?.props.summaryLines).toEqual(['Source: central skills', 'Selected: 2']);
    expect(capturedElement?.props.detailLines).toEqual(['alpha', 'beta']);
    expect(capturedElement?.props.defaultValue).toBe(false);
  });
});
