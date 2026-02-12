import { CLI_OPTIONS, SUBCOMMANDS, COMMAND_SUBCOMMANDS } from '../util/cli-defs.js';
import { PKG_NAME, PKG_VERSION } from '../meta.js';
import type { SubcommandDef } from '../util/cli-defs.js';

/**
 * 从 CLI 元数据动态生成帮助文本。
 * @param group - 'skills' | 'commands' | undefined（显示主帮助）
 * @param subcommand - 子命令名（显示子命令帮助）
 */
export function formatHelp(group?: string, subcommand?: string): string {
  if (group === 'skills') {
    if (subcommand && subcommand in SUBCOMMANDS) {
      return formatSubcommandHelp('skills', subcommand as keyof typeof SUBCOMMANDS, SUBCOMMANDS);
    }
    return formatGroupHelp('skills', SUBCOMMANDS);
  }

  if (group === 'commands') {
    if (subcommand && subcommand in COMMAND_SUBCOMMANDS) {
      return formatSubcommandHelp('commands', subcommand as keyof typeof COMMAND_SUBCOMMANDS, COMMAND_SUBCOMMANDS);
    }
    return formatGroupHelp('commands', COMMAND_SUBCOMMANDS);
  }

  // 主帮助页
  return formatMainHelp();
}

function formatMainHelp(): string {
  const lines: string[] = [];

  lines.push(`${PKG_NAME} (ap) — LLM skills & commands manager`);
  lines.push('');
  lines.push('Usage:');
  lines.push('  ap skills <command> [args] [options]');
  lines.push('  ap commands <command> [args] [options]');
  lines.push('');

  lines.push('Skill Commands:');
  lines.push(formatSubcommandList(SUBCOMMANDS));
  lines.push('');

  lines.push('Command Commands:');
  lines.push(formatSubcommandList(COMMAND_SUBCOMMANDS));
  lines.push('');

  lines.push('Global Options:');
  lines.push(formatOptionsBlock(['help', 'version', 'dry-run', 'force']));

  lines.push('');
  lines.push('Common Options:');
  lines.push(formatOptionsBlock(['target', 'scope', 'cwd']));

  lines.push('');
  lines.push('Aliases:');
  lines.push('  skills  skill, sk, s');
  lines.push('  commands  command, cmd, c');

  lines.push('');
  lines.push('Environment:');
  lines.push('  APG_HOME / AGENT_PLUGINS_HOME  Override ~/.agent-plugins');
  lines.push('  CODEX_HOME                     Override ~/.codex (Codex global scope)');
  lines.push('');

  return lines.join('\n');
}

function formatGroupHelp(group: string, subcommands: Record<string, SubcommandDef>): string {
  const lines: string[] = [];

  lines.push(`ap ${group} — manage ${group}`);
  lines.push('');
  lines.push('Usage:');
  lines.push(`  ap ${group} <command> [args] [options]`);
  lines.push('');
  lines.push('Commands:');
  lines.push(formatSubcommandList(subcommands));
  lines.push('');

  lines.push('Global Options:');
  lines.push(formatOptionsBlock(['help', 'version', 'dry-run', 'force']));

  lines.push('');
  lines.push('Common Options:');
  lines.push(formatOptionsBlock(['target', 'scope', 'cwd']));
  lines.push('');

  return lines.join('\n');
}

function formatSubcommandList(subcommands: Record<string, SubcommandDef>): string {
  const cmdEntries = Object.entries(subcommands);
  const maxCmdLen = Math.max(...cmdEntries.map(([k, v]) => k.length + (v.args?.length ?? 0) + 1));
  const lines: string[] = [];

  for (const [name, def] of cmdEntries) {
    const cmdWithArgs = def.args ? `${name} ${def.args}` : name;
    const aliases = def.aliases?.length ? ` (${def.aliases.join(', ')})` : '';
    lines.push(`  ${cmdWithArgs.padEnd(maxCmdLen + 2)}${def.desc}${aliases}`);
  }

  return lines.join('\n');
}

function formatSubcommandHelp(
  group: string,
  cmd: string,
  subcommands: Record<string, SubcommandDef>,
): string {
  const def = subcommands[cmd]!;
  const lines: string[] = [];

  lines.push(`ap ${group} ${cmd}${def.args ? ` ${def.args}` : ''}`);
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
