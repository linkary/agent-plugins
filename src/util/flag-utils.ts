import type { ParsedFlags } from './options.js';

function getRawFlagValue(flags: ParsedFlags, key: string): string | boolean | undefined {
  const value = flags[key];
  if (Array.isArray(value)) {
    const last = value[value.length - 1];
    return last;
  }
  return value;
}

export function getStringFlag(flags: ParsedFlags, key: string): string | undefined {
  const value = getRawFlagValue(flags, key);
  return typeof value === 'string' ? value : undefined;
}

export function getBooleanFlag(flags: ParsedFlags, key: string): boolean {
  const value = getRawFlagValue(flags, key);
  if (value === true) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

export function getPositiveIntFlag(
  flags: ParsedFlags,
  key: string,
  fallback: number,
  opts?: { min?: number; max?: number },
): number {
  const raw = getStringFlag(flags, key);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;

  const min = opts?.min ?? 1;
  const max = opts?.max ?? Number.MAX_SAFE_INTEGER;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}
