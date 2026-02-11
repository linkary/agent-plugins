import { buildShortFlagMap, getValueShortFlags } from './cli-defs.js';

export type ParsedFlags = Record<string, string | boolean | string[]>;

// Build maps from metadata at module load time
const SHORT_TO_LONG = buildShortFlagMap();
const VALUE_SHORT_FLAGS = getValueShortFlags();

function pushFlag(flags: ParsedFlags, key: string, value: string | boolean) {
  const existing = flags[key];
  if (existing === undefined) {
    flags[key] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(String(value));
    return;
  }
  flags[key] = [String(existing), String(value)];
}

export function parseOptions(argv: string[]): { positionals: string[]; flags: ParsedFlags } {
  const positionals: string[] = [];
  const flags: ParsedFlags = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }

    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      const rawKey = (eq === -1 ? token.slice(2) : token.slice(2, eq)).trim();
      if (!rawKey) continue;
      if (eq !== -1) {
        pushFlag(flags, rawKey, token.slice(eq + 1));
        continue;
      }

      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        pushFlag(flags, rawKey, next);
        i++;
      } else {
        pushFlag(flags, rawKey, true);
      }
      continue;
    }

    if (token.startsWith('-') && token.length > 1) {
      const letters = token.slice(1).split('');
      for (let j = 0; j < letters.length; j++) {
        const ch = letters[j];
        const longName = SHORT_TO_LONG[ch];

        // Check if this short flag takes a value
        if (VALUE_SHORT_FLAGS.has(ch)) {
          const next = argv[i + 1];
          if (next === undefined) {
            pushFlag(flags, longName ?? ch, true);
            continue;
          }
          pushFlag(flags, longName ?? ch, next);
          i++;
          continue;
        }

        // Boolean flag
        pushFlag(flags, longName ?? ch, true);
      }
      continue;
    }

    positionals.push(token);
  }

  // Normalize scope shortcuts: --global/-g → scope=global, --local/-l → scope=local
  if (flags.global === true || flags.g === true) flags.scope = 'global';
  if (flags.local === true || flags.l === true) flags.scope = 'local';

  return { positionals, flags };
}
