export type ParsedFlags = Record<string, string | boolean | string[]>;

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
        // single-char flags that take values
        if (ch === 't' || ch === 'n' || ch === 'C') {
          const next = argv[i + 1];
          if (next === undefined) {
            pushFlag(flags, ch, true);
            continue;
          }
          pushFlag(flags, ch, next);
          i++;
          continue;
        }
        pushFlag(flags, ch, true);
      }
      continue;
    }

    positionals.push(token);
  }

  // Normalize common short flags
  if (flags.g === true) flags.scope = 'global';
  if (flags.l === true) flags.scope = 'local';
  if (flags.t) flags.target = flags.t;
  if (flags.n) flags.name = flags.n;
  if (flags.C) flags.cwd = flags.C;
  if (flags.f === true) flags.force = true;
  if (flags.d === true) flags['dry-run'] = true;

  return { positionals, flags };
}
