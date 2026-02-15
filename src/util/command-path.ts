import {
  ROOT_ALIASES,
  SUBCOMMANDS,
  AGENT_SUBCOMMANDS,
  COMMAND_SUBCOMMANDS,
  MCP_SUBCOMMANDS,
  type SubcommandDef,
} from './cli-defs.js';

const ROOT_GROUPS = ['skills', 'agents', 'commands', 'mcp'] as const;
type RootGroup = (typeof ROOT_GROUPS)[number];
type Action = 'add' | 'rm' | 'update' | 'sync' | 'collect' | 'find' | 'list' | 'show' | 'help';
type Canonical = RootGroup | Action | 'agent';

const SUBCOMMANDS_BY_GROUP: Record<RootGroup, Record<string, SubcommandDef>> = {
  skills: SUBCOMMANDS,
  agents: AGENT_SUBCOMMANDS,
  commands: COMMAND_SUBCOMMANDS,
  mcp: MCP_SUBCOMMANDS,
};

function resolveRootGroup(token: string | undefined): RootGroup | null {
  if (!token) return null;
  const resolved = ROOT_ALIASES[token.toLowerCase()];
  if (!resolved) return null;
  return ROOT_GROUPS.includes(resolved as RootGroup) ? (resolved as RootGroup) : null;
}

function resolveAction(group: RootGroup, token: string | undefined): Action | null {
  if (!token) return 'help';
  const normalized = token.toLowerCase();
  if (normalized === 'help' || normalized === 'h') return 'help';

  const defs = SUBCOMMANDS_BY_GROUP[group];
  for (const [name, def] of Object.entries(defs)) {
    if (normalized === name) return name as Action;
    if (def.aliases?.includes(normalized)) return name as Action;
  }
  return null;
}

export function resolveCommandPath(argv: string[]): {
  path: Canonical[];
  rest: string[];
  error: string | null;
} {
  // Legacy syntax: `agent skills <action> ...`
  // Also supports shorthand: `agent <action> ...` => `agents <action> ...`.
  if (argv[0]?.toLowerCase() === 'agent') {
    const second = argv[1];
    const asGroup = resolveRootGroup(second);

    if (asGroup) {
      const actionToken = argv[2];
      const actionResolved = resolveAction(asGroup, actionToken);
      if (!actionResolved) {
        return {
          path: [asGroup],
          rest: argv.slice(2),
          error: `Unknown action for ${asGroup}: ${actionToken}`,
        };
      }
      return { path: [asGroup, actionResolved], rest: argv.slice(3), error: null };
    }

    const shorthandAction = resolveAction('agents', second);
    if (!shorthandAction) {
      return {
        path: ['agent'],
        rest: argv.slice(1),
        error: `Unknown subcommand for agent: ${second ?? '(none)'}`,
      };
    }
    return { path: ['agents', shorthandAction], rest: argv.slice(2), error: null };
  }

  const root = argv[0];
  const rootResolved = resolveRootGroup(root);
  if (!rootResolved) {
    return { path: [], rest: argv, error: `Unknown command: ${root ?? '(none)'}` };
  }

  const actionToken = argv[1];
  const actionResolved = resolveAction(rootResolved, actionToken);
  if (!actionResolved) {
    return {
      path: [rootResolved],
      rest: argv.slice(1),
      error: `Unknown action for ${rootResolved}: ${actionToken}`,
    };
  }

  return { path: [rootResolved, actionResolved], rest: argv.slice(2), error: null };
}
