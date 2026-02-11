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
  target: { short: 't', arg: '<tools>', desc: 'Target tools (cursor|gemini|codex|claude-code|antigravity|openskills|agents|all)' },
  scope: { arg: '<scope>', desc: 'Scope: global (default) or local' },
  global: { short: 'g', desc: 'Alias for --scope=global' },
  local: { short: 'l', desc: 'Alias for --scope=local' },
  name: { short: 'n', arg: '<name>', desc: 'Override skill name' },
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
    aliases: ['a'],
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
} as const satisfies Record<string, SubcommandDef>;

/** Root command aliases */
export const ROOT_ALIASES: Record<string, string> = {
  skills: 'skills',
  skill: 'skills',
  sk: 'skills',
  s: 'skills',
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
