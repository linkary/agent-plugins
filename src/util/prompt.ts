/**
 * Prompt adapter layer — delegates to ink components while preserving
 * the same API surface that command files depend on.
 */
import React from 'react';
import { runInk } from '../ui/render.js';
import { Select, type SelectOption } from '../ui/select.js';
import { MultiSelect, type MultiSelectOption } from '../ui/multi-select.js';
import { Confirm } from '../ui/confirm.js';
import { Choice } from '../ui/choice.js';
import { ReviewConfirm } from '../ui/review-confirm.js';

export type { SelectOption } from '../ui/select.js';

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
  /** Keep initially selected values at the top of the list */
  sortDefaultSelectedToTop?: boolean;
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
      sortDefaultSelectedToTop: params.sortDefaultSelectedToTop,
    }),
  );
}

// ─── promptConfirm ──────────────────────────────────────────────────────

export async function promptConfirm(params: string | { message: string; default?: boolean }): Promise<boolean> {
  if (!process.stdin.isTTY) {
    throw new Error('Interactive prompt requires a TTY');
  }

  const promptParams = typeof params === 'string' ? { message: params } : params;
  return runInk<boolean>(
    React.createElement(Confirm, {
      message: promptParams.message,
      defaultValue: promptParams.default,
    }),
  );
}

// ─── promptReviewConfirm ────────────────────────────────────────────────

export async function promptReviewConfirm(params: {
  message: string;
  summaryLines?: string[];
  detailLines?: string[];
  default?: boolean;
}): Promise<boolean> {
  if (!process.stdin.isTTY) {
    throw new Error('Interactive prompt requires a TTY');
  }

  return runInk<boolean>(
    React.createElement(ReviewConfirm, {
      message: params.message,
      summaryLines: params.summaryLines,
      detailLines: params.detailLines,
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
