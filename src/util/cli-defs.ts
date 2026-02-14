/**
 * CLI option and subcommand definitions.
 * Single source of truth for help generation and option parsing.
 */

export type OptionDef = {
  /** Short flag(s), comma-separated if multiple (e.g., 'g,l' for scope) */
  short?: string;
  /** Argument placeholder (e.g., '<tools>'); presence indicates flag takes a value */
  arg?: string;
  /** Description for help text */
  desc: string;
};

export type SubcommandDef = {
  /** Description for help text */
  desc: string;
  /** Positional args placeholder (e.g., '<source>', '[skill...]') */
  args?: string;
  /** Aliases for this subcommand */
  aliases?: string[];
  /** Option keys this subcommand accepts */
  options?: (keyof typeof CLI_OPTIONS)[];
};

/** Global CLI options */
export const CLI_OPTIONS = {
  help: { short: 'h', desc: 'Show help' },
  version: { short: 'V', desc: 'Show version' },
  'dry-run': { short: 'd', desc: 'Preview changes without applying' },
  force: { short: 'f', desc: 'Overwrite on conflicts' },
  target: {
    short: 't',
    arg: '<tools>',
    desc: 'Target tools (cursor|gemini|codex|claude-code|antigravity|openskills|agents|opencode|qoder|all)',
  },
  scope: { arg: '<scope>', desc: 'Scope: global (default) or local' },
  global: { short: 'g', desc: 'Alias for --scope=global' },
  local: { short: 'l', desc: 'Alias for --scope=local' },
  name: { short: 'n', arg: '<name>', desc: 'Override skill name' },
  type: { arg: '<type>', desc: 'MCP transport type (stdio|sse|http|ws)' },
  command: { arg: '<cmd>', desc: 'MCP stdio command' },
  args: { arg: '<args>', desc: 'MCP stdio args (space-separated)' },
  url: { arg: '<url>', desc: 'MCP server URL (for sse/http/ws)' },
  ref: { arg: '<ref>', desc: 'Git ref (branch/tag/commit)' },
  cwd: { short: 'C', arg: '<dir>', desc: 'Override project directory for local scope' },
  all: { short: 'a', desc: 'Apply to all skills' },
  verbose: { short: 'v', desc: 'Show detailed output' },
} as const;

/** Subcommands under `skills` */
export const SUBCOMMANDS = {
  add: {
    desc: 'Add skill from git URL or local path',
    args: '<source>',
    aliases: ['a', 'install', 'i'],
    options: ['name', 'ref', 'force', 'dry-run'],
  },
  rm: {
    desc: 'Remove skill(s)',
    args: '[skill...]',
    aliases: ['remove', 'del', 'delete'],
    options: ['target', 'scope', 'global', 'local', 'cwd', 'dry-run'],
  },
  update: {
    desc: 'Update skill(s) from original source',
    args: '[skill...]',
    aliases: ['up', 'u'],
    options: ['all', 'force', 'dry-run'],
  },
  sync: {
    desc: 'Sync central skills → target tools',
    args: '[skill...]',
    aliases: ['sy'],
    options: ['target', 'scope', 'force', 'dry-run', 'cwd'],
  },
  collect: {
    desc: 'Collect skills from target tools → central',
    args: '[skill...]',
    aliases: ['col', 'c'],
    options: ['target', 'scope', 'all', 'force', 'dry-run'],
  },
  list: {
    desc: 'List central skills',
    aliases: ['ls'],
    options: ['verbose'],
  },
  show: {
    desc: 'Browse and inspect skills',
    args: '[skill]',
    aliases: ['info', 's'],
    options: ['target', 'scope', 'global', 'local', 'cwd'],
  },
} as const satisfies Record<string, SubcommandDef>;

/** Subcommands under `agents` */
export const AGENT_SUBCOMMANDS = {
  add: {
    desc: 'Add agent from git URL or local path',
    args: '<source>',
    aliases: ['a', 'install', 'i'],
    options: ['name', 'ref', 'force', 'dry-run'],
  },
  rm: {
    desc: 'Remove agent(s)',
    args: '[agent...]',
    aliases: ['remove', 'del', 'delete'],
    options: ['target', 'scope', 'global', 'local', 'cwd', 'dry-run'],
  },
  update: {
    desc: 'Update agent(s) from original source',
    args: '[agent...]',
    aliases: ['up', 'u'],
    options: ['all', 'force', 'dry-run'],
  },
  sync: {
    desc: 'Sync central agents → target tools',
    args: '[agent...]',
    aliases: ['sy'],
    options: ['target', 'scope', 'force', 'dry-run', 'cwd'],
  },
  collect: {
    desc: 'Collect agents from target tools → central',
    args: '[agent...]',
    aliases: ['col', 'c'],
    options: ['target', 'scope', 'all', 'force', 'dry-run'],
  },
  list: {
    desc: 'List central agents',
    aliases: ['ls'],
    options: ['verbose'],
  },
} as const satisfies Record<string, SubcommandDef>;

/** Subcommands under `commands` */
export const COMMAND_SUBCOMMANDS = {
  add: {
    desc: 'Add command from git URL or local path',
    args: '<source>',
    aliases: ['a', 'install', 'i'],
    options: ['name', 'ref', 'force', 'dry-run'],
  },
  rm: {
    desc: 'Remove command(s)',
    args: '[command...]',
    aliases: ['remove', 'del', 'delete'],
    options: ['target', 'scope', 'global', 'local', 'cwd', 'dry-run'],
  },
  update: {
    desc: 'Update command(s) from original source',
    args: '[command...]',
    aliases: ['up', 'u'],
    options: ['all', 'force', 'dry-run'],
  },
  sync: {
    desc: 'Sync central commands → target tools',
    args: '[command...]',
    aliases: ['sy'],
    options: ['target', 'scope', 'force', 'dry-run', 'cwd'],
  },
  collect: {
    desc: 'Collect commands from target tools → central',
    args: '[command...]',
    aliases: ['col', 'c'],
    options: ['target', 'scope', 'all', 'force', 'dry-run'],
  },
  list: {
    desc: 'List central commands',
    aliases: ['ls'],
    options: ['verbose'],
  },
  show: {
    desc: 'Browse and inspect commands',
    args: '[command]',
    aliases: ['info', 's'],
    options: ['target', 'scope', 'global', 'local', 'cwd'],
  },
} as const satisfies Record<string, SubcommandDef>;

/** Subcommands under `mcp` */
export const MCP_SUBCOMMANDS = {
  add: {
    desc: 'Add MCP server definition to central store',
    args: '[name]',
    aliases: ['a'],
    options: ['name', 'type', 'command', 'args', 'url', 'force', 'dry-run'],
  },
  rm: {
    desc: 'Remove MCP server(s)',
    args: '[server...]',
    aliases: ['remove', 'del', 'delete'],
    options: ['dry-run'],
  },
  update: {
    desc: 'Update MCP server(s) from original source',
    args: '[server...]',
    aliases: ['up', 'u'],
    options: ['all', 'dry-run'],
  },
  sync: {
    desc: 'Sync central MCP servers → target tool configs',
    args: '[server...]',
    aliases: ['sy'],
    options: ['target', 'scope', 'force', 'dry-run', 'cwd'],
  },
  collect: {
    desc: 'Collect MCP servers from target tool configs → central',
    args: '[server...]',
    aliases: ['col', 'c'],
    options: ['target', 'scope', 'all', 'force', 'dry-run'],
  },
  list: {
    desc: 'List central MCP servers',
    aliases: ['ls'],
    options: ['verbose'],
  },
  show: {
    desc: 'Display MCP server definition details',
    args: '[server]',
    aliases: ['info', 's'],
    options: [],
  },
} as const satisfies Record<string, SubcommandDef>;

/** Root command aliases */
export const ROOT_ALIASES: Record<string, string> = {
  skills: 'skills',
  skill: 'skills',
  sk: 'skills',
  s: 'skills',
  agent: 'agents',
  agents: 'agents',
  ag: 'agents',
  commands: 'commands',
  command: 'commands',
  cmd: 'commands',
  c: 'commands',
  mcp: 'mcp',
  m: 'mcp',
};

/** Build a map from short flag → long option name */
export function buildShortFlagMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [key, def] of Object.entries(CLI_OPTIONS)) {
    if ('short' in def && def.short) {
      for (const s of def.short.split(',')) {
        map[s.trim()] = key;
      }
    }
  }
  return map;
}

/** Get set of short flags that take a value (have an `arg`) */
export function getValueShortFlags(): Set<string> {
  const set = new Set<string>();
  for (const def of Object.values(CLI_OPTIONS)) {
    if ('short' in def && def.short && 'arg' in def && def.arg) {
      for (const s of def.short.split(',')) {
        set.add(s.trim());
      }
    }
  }
  return set;
}

/** Get set of long flags that take a value (have an `arg`) */
export function getValueLongFlags(): Set<string> {
  const set = new Set<string>();
  for (const [key, def] of Object.entries(CLI_OPTIONS)) {
    if ('arg' in def && def.arg) {
      set.add(key);
    }
  }
  return set;
}
