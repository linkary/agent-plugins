import { listCentralCommands } from '../../core/command-store.js';
import { loadRegistry } from '../../core/registry.js';
import { ANSI } from '../../util/ansi.js';
import { readCommandDescription } from '../../util/command-meta.js';
import { formatRelativeTime, formatSourceShort } from '../../util/skill-meta.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdCommandsList(_positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const commands = await listCentralCommands();
  if (commands.length === 0) {
    process.stdout.write('(no commands installed)\n');
    process.stdout.write(`${ANSI.dim}Tip: use "ap commands add <source>" or "ap commands collect" to get started.${ANSI.reset}\n`);
    return 0;
  }

  const registry = await loadRegistry();
  const verbose = flags.verbose === true || flags.v === true;

  for (const cmd of commands) {
    const record = registry.commands?.[cmd.name];

    // 基本输出：名称 + 形式标记
    const formBadge = cmd.form === 'directory' ? `${ANSI.dim}[dir]${ANSI.reset}` : '';
    let line = `${ANSI.cyan}${cmd.name}${ANSI.reset} ${formBadge}`;

    // 来源信息
    const sourceLabel = formatSourceShort(record?.source);
    if (sourceLabel) {
      line += ` ${ANSI.dim}(${sourceLabel})${ANSI.reset}`;
    }

    // 时间
    const time = formatRelativeTime(record?.updatedAt ?? record?.addedAt);
    if (time) {
      line += ` ${ANSI.yellow}${time}${ANSI.reset}`;
    }

    process.stdout.write(line + '\n');

    // 详细模式：显示描述
    if (verbose) {
      const desc = await readCommandDescription(cmd.mdPath);
      if (desc) {
        process.stdout.write(`  ${ANSI.dim}${desc}${ANSI.reset}\n`);
      }
    }
  }

  process.stdout.write(`\n${ANSI.dim}${commands.length} command(s)${ANSI.reset}\n`);
  return 0;
}
