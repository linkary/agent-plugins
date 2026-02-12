import { formatHelp } from './help.js';
import { resolveCommandPath } from '../util/command-path.js';
import { parseOptions } from '../util/options.js';
import { cmdSkillsAdd } from '../commands/skills/add.js';
import { cmdSkillsCollect } from '../commands/skills/collect.js';
import { cmdSkillsList } from '../commands/skills/list.js';
import { cmdSkillsRemove } from '../commands/skills/rm.js';
import { cmdSkillsSync } from '../commands/skills/sync.js';
import { cmdSkillsUpdate } from '../commands/skills/update.js';
import { cmdSkillsShow } from '../commands/skills/show.js';
import { cmdCommandsAdd } from '../commands/commands/add.js';
import { cmdCommandsCollect } from '../commands/commands/collect.js';
import { cmdCommandsList } from '../commands/commands/list.js';
import { cmdCommandsRemove } from '../commands/commands/rm.js';
import { cmdCommandsSync } from '../commands/commands/sync.js';
import { cmdCommandsUpdate } from '../commands/commands/update.js';
import { cmdCommandsShow } from '../commands/commands/show.js';
import { cmdMcpAdd } from '../commands/mcp/add.js';
import { cmdMcpCollect } from '../commands/mcp/collect.js';
import { cmdMcpList } from '../commands/mcp/list.js';
import { cmdMcpRemove } from '../commands/mcp/rm.js';
import { cmdMcpSync } from '../commands/mcp/sync.js';
import { cmdMcpUpdate } from '../commands/mcp/update.js';
import { cmdMcpShow } from '../commands/mcp/show.js';
import { PKG_NAME, PKG_VERSION } from '../meta.js';

export type CliRunContext = {
  cwd: string;
};

export async function runCli(argv: string[], ctx: CliRunContext): Promise<number> {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(formatHelp());
    return 0;
  }
  if (argv.includes('--version') || argv.includes('-V')) {
    process.stdout.write(`${PKG_NAME} ${PKG_VERSION}\n`);
    return 0;
  }

  const { path, rest, error } = resolveCommandPath(argv);
  if (error) {
    process.stderr.write(`${error}\n\n`);
    process.stdout.write(formatHelp());
    return 1;
  }

  const { positionals, flags } = parseOptions(rest);
  const group = path[0];
  const cmd = path[1] ?? 'help';

  if (group === 'skills') {
    return await dispatchSkills(cmd, positionals, flags, ctx);
  }

  if (group === 'commands') {
    return await dispatchCommands(cmd, positionals, flags, ctx);
  }

  if (group === 'mcp') {
    return await dispatchMcp(cmd, positionals, flags, ctx);
  }

  process.stderr.write(`Unknown group: ${group}\n\n`);
  process.stdout.write(formatHelp());
  return 1;
}

async function dispatchSkills(
  cmd: string,
  positionals: string[],
  flags: Record<string, string | boolean>,
  ctx: CliRunContext,
): Promise<number> {
  switch (cmd) {
    case 'add':
      return await cmdSkillsAdd(positionals, flags, ctx);
    case 'rm':
      return await cmdSkillsRemove(positionals, flags, ctx);
    case 'update':
      return await cmdSkillsUpdate(positionals, flags, ctx);
    case 'sync':
      return await cmdSkillsSync(positionals, flags, ctx);
    case 'collect':
      return await cmdSkillsCollect(positionals, flags, ctx);
    case 'list':
      return await cmdSkillsList(positionals, flags, ctx);
    case 'show':
      return await cmdSkillsShow(positionals, flags, ctx);
    case 'help':
    default:
      process.stdout.write(formatHelp('skills'));
      return cmd === 'help' ? 0 : 1;
  }
}

async function dispatchCommands(
  cmd: string,
  positionals: string[],
  flags: Record<string, string | boolean>,
  ctx: CliRunContext,
): Promise<number> {
  switch (cmd) {
    case 'add':
      return await cmdCommandsAdd(positionals, flags, ctx);
    case 'rm':
      return await cmdCommandsRemove(positionals, flags, ctx);
    case 'update':
      return await cmdCommandsUpdate(positionals, flags, ctx);
    case 'sync':
      return await cmdCommandsSync(positionals, flags, ctx);
    case 'collect':
      return await cmdCommandsCollect(positionals, flags, ctx);
    case 'list':
      return await cmdCommandsList(positionals, flags, ctx);
    case 'show':
      return await cmdCommandsShow(positionals, flags, ctx);
    case 'help':
    default:
      process.stdout.write(formatHelp('commands'));
      return cmd === 'help' ? 0 : 1;
  }
}

async function dispatchMcp(
  cmd: string,
  positionals: string[],
  flags: Record<string, string | boolean>,
  ctx: CliRunContext,
): Promise<number> {
  switch (cmd) {
    case 'add':
      return await cmdMcpAdd(positionals, flags, ctx);
    case 'rm':
      return await cmdMcpRemove(positionals, flags, ctx);
    case 'update':
      return await cmdMcpUpdate(positionals, flags, ctx);
    case 'sync':
      return await cmdMcpSync(positionals, flags, ctx);
    case 'collect':
      return await cmdMcpCollect(positionals, flags, ctx);
    case 'list':
      return await cmdMcpList(positionals, flags, ctx);
    case 'show':
      return await cmdMcpShow(positionals, flags, ctx);
    case 'help':
    default:
      process.stdout.write(formatHelp('mcp'));
      return cmd === 'help' ? 0 : 1;
  }
}
