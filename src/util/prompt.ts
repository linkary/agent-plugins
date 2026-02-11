/**
 * Prompt adapter layer — delegates to ink components while preserving
 * the same API surface that command files depend on.
 */
import React from 'react';
import { runInk } from '../ui/render.js';
import { Select, type SelectOption } from '../ui/Select.js';
import { MultiSelect, type MultiSelectOption } from '../ui/MultiSelect.js';
import { Confirm } from '../ui/Confirm.js';
import { Choice } from '../ui/Choice.js';

export type { SelectOption } from '../ui/Select.js';

// ─── promptSelect ───────────────────────────────────────────────────────

export async function promptSelect<T extends string>(params: {
  message: string;
  options: SelectOption<T>[];
  defaultValue?: T;
}): Promise<T> {
  if (!process.stdin.isTTY) {
    throw new Error('Interactive prompt requires a TTY');
  }
  if (params.options.length === 0) throw new Error('No options available');

  return runInk<T>(
    React.createElement(Select, {
      message: params.message,
      options: params.options,
      defaultValue: params.defaultValue,
    }),
  );
}

// ─── promptMultiSelect ──────────────────────────────────────────────────

export async function promptMultiSelect<T extends string>(params: {
  message: string;
  options: MultiSelectOption<T>[];
  /** Values to pre-select; if 'all', all options are selected */
  defaultSelected?: T[] | 'all';
  /** Enable real-time filter for large lists (>20 items) */
  searchable?: boolean;
}): Promise<T[]> {
  if (!process.stdin.isTTY) {
    throw new Error('Interactive prompt requires a TTY');
  }
  if (params.options.length === 0) return [];

  return runInk<T[]>(
    React.createElement(MultiSelect, {
      message: params.message,
      options: params.options,
      defaultSelected: params.defaultSelected,
    }),
  );
}

// ─── promptConfirm ──────────────────────────────────────────────────────

export async function promptConfirm(params: { message: string; default?: boolean }): Promise<boolean> {
  if (!process.stdin.isTTY) {
    throw new Error('Interactive prompt requires a TTY');
  }

  return runInk<boolean>(
    React.createElement(Confirm, {
      message: params.message,
      defaultValue: params.default,
    }),
  );
}

// ─── promptChoice ───────────────────────────────────────────────────────

export async function promptChoice(params: {
  message: string;
  options: { key: string; label: string }[];
}): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error('Interactive prompt requires a TTY');
  }
  if (params.options.length === 0) throw new Error('No options available');

  return runInk<string>(
    React.createElement(Choice, {
      message: params.message,
      options: params.options,
    }),
  );
}
