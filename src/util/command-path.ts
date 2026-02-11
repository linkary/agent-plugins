const ALIASES = {
  // Root commands
  skills: ['skills', 'skill', 'sk', 's'],
  // Actions
  add: ['add', 'a'],
  rm: ['rm', 'remove', 'del', 'delete'],
  update: ['update', 'up', 'u'],
  sync: ['sync', 'sy'],
  collect: ['collect', 'col', 'c'],
  list: ['list', 'ls'],
  show: ['show', 'info', 'i'],
  help: ['help', 'h'],
  // Legacy (deprecated): `agent skills ...`
  agent: ['agent'],
} as const;

type Canonical = keyof typeof ALIASES;

function resolveToken(token: string, allowed: readonly Canonical[]): Canonical | null {
  const lower = token.toLowerCase();
  for (const name of allowed) {
    if (ALIASES[name].includes(lower)) return name;
  }
  return null;
}

export function resolveCommandPath(argv: string[]): {
  path: Canonical[];
  rest: string[];
  error: string | null;
} {
  // Legacy syntax: `agent skills <action> ...`
  if (argv[0] && resolveToken(argv[0], ['agent']) === 'agent') {
    const second = argv[1];
    const secondResolved = second ? resolveToken(second, ['skills']) : null;
    if (!secondResolved) {
      return {
        path: ['agent'],
        rest: argv.slice(1),
        error: `Unknown subcommand for agent: ${second ?? '(none)'}`,
      };
    }

    const actionToken = argv[2];
    const actionResolved = actionToken
      ? resolveToken(actionToken, ['add', 'rm', 'update', 'sync', 'collect', 'list', 'show', 'help'])
      : 'help';

    if (!actionResolved) {
      return {
        path: ['skills'],
        rest: argv.slice(2),
        error: `Unknown action for skills: ${actionToken}`,
      };
    }

    return { path: ['skills', actionResolved], rest: argv.slice(3), error: null };
  }

  // New syntax: `skills <action> ...`
  const root = argv[0];
  const rootResolved = root ? resolveToken(root, ['skills']) : null;
  if (!rootResolved) {
    return { path: [], rest: argv, error: `Unknown command: ${root ?? '(none)'}` };
  }

  const actionToken = argv[1];
  const actionResolved = actionToken
    ? resolveToken(actionToken, ['add', 'rm', 'update', 'sync', 'collect', 'list', 'show', 'help'])
    : 'help';

  if (!actionResolved) {
    return {
      path: [rootResolved],
      rest: argv.slice(1),
      error: `Unknown action for ${rootResolved}: ${actionToken}`,
    };
  }

  return { path: [rootResolved, actionResolved], rest: argv.slice(2), error: null };
}
