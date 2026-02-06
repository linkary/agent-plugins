import { CLI_OPTIONS, SUBCOMMANDS } from '../util/cli-defs.js';
import { PKG_NAME, PKG_VERSION } from '../meta.js';

/**
 * Generate help text dynamically from CLI metadata.
 */
export function formatHelp(subcommand?: string): string {
  const lines: string[] = [];

  if (subcommand && subcommand in SUBCOMMANDS) {
    return formatSubcommandHelp(subcommand as keyof typeof SUBCOMMANDS);
  }

  lines.push(`${PKG_NAME} (ap) — LLM skills manager & sync`);
  lines.push('');
  lines.push('Usage:');
  lines.push('  ap skills <command> [args] [options]');
  lines.push('');
  lines.push('Commands:');

  const cmdEntries = Object.entries(SUBCOMMANDS);
  const maxCmdLen = Math.max(...cmdEntries.map(([k, v]) => k.length + (v.args?.length ?? 0) + 1));

  for (const [name, def] of cmdEntries) {
    const cmdWithArgs = def.args ? `${name} ${def.args}` : name;
    const aliases = def.aliases?.length ? ` (${def.aliases.join(', ')})` : '';
    lines.push(`  ${cmdWithArgs.padEnd(maxCmdLen + 2)}${def.desc}${aliases}`);
  }

  lines.push('');
  lines.push('Global Options:');
  lines.push(formatOptionsBlock(['help', 'version', 'dry-run', 'force']));

  lines.push('');
  lines.push('Common Options:');
  lines.push(formatOptionsBlock(['target', 'scope', 'cwd']));

  lines.push('');
  lines.push('Environment:');
  lines.push('  APG_HOME / AGENT_PLUGINS_HOME  Override ~/.agent-plugins');
  lines.push('  CODEX_HOME                     Override ~/.codex (Codex global scope)');
  lines.push('');

  return lines.join('\n');
}

function formatSubcommandHelp(cmd: keyof typeof SUBCOMMANDS): string {
  const def = SUBCOMMANDS[cmd];
  const lines: string[] = [];

  lines.push(`ap skills ${cmd}${def.args ? ` ${def.args}` : ''}`);
  lines.push('');
  lines.push(def.desc);

  if (def.aliases?.length) {
    lines.push('');
    lines.push(`Aliases: ${def.aliases.join(', ')}`);
  }

  if (def.options?.length) {
    lines.push('');
    lines.push('Options:');
    lines.push(formatOptionsBlock(def.options));
  }

  lines.push('');
  return lines.join('\n');
}

function formatOptionsBlock(keys: readonly (keyof typeof CLI_OPTIONS)[]): string {
  const lines: string[] = [];

  for (const key of keys) {
    const opt = CLI_OPTIONS[key];
    const shortPart = opt.short
      ? opt.short
          .split(',')
          .map((s) => `-${s.trim()}`)
          .join(', ')
      : '';
    const longPart = `--${key}${opt.arg ? ` ${opt.arg}` : ''}`;
    const flagStr = shortPart ? `${shortPart}, ${longPart}` : `    ${longPart}`;
    lines.push(`  ${flagStr.padEnd(28)}${opt.desc}`);
  }

  return lines.join('\n');
}

export { PKG_NAME, PKG_VERSION };
