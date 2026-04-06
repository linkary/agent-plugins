import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

let capturedElement: { props: Record<string, unknown> } | null = null;
const originalStdinIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');

mock.module('../src/ui/render.js', () => ({
  runInk: async (element: { props: Record<string, unknown> }) => {
    capturedElement = element;
    return [];
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

describe('promptMultiSelect', () => {
  it('forwards sortDefaultSelectedToTop when enabled', async () => {
    const { promptMultiSelect } = await import(`../src/util/prompt.js?prompt-test=${Math.random()}`);

    await promptMultiSelect({
      message: 'Pick items',
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
      defaultSelected: ['b'],
      sortDefaultSelectedToTop: true,
    });

    expect(capturedElement?.props.sortDefaultSelectedToTop).toBe(true);
    expect(capturedElement?.props.defaultSelected).toEqual(['b']);
  });

  it('preserves previous behavior when sortDefaultSelectedToTop is omitted', async () => {
    const { promptMultiSelect } = await import(`../src/util/prompt.js?prompt-test=${Math.random()}`);

    await promptMultiSelect({
      message: 'Pick items',
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
      defaultSelected: ['b'],
    });

    expect(capturedElement?.props.sortDefaultSelectedToTop).toBeUndefined();
    expect(capturedElement?.props.defaultSelected).toEqual(['b']);
  });
});
