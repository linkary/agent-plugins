import { formatHelp } from './help.js';
import { resolveCommandPath } from '../util/command-path.js';
import { parseOptions } from '../util/options.js';
import { cmdSkillsAdd } from '../commands/skills/add.js';
import { cmdSkillsCollect } from '../commands/skills/collect.js';
import { cmdSkillsFind } from '../commands/skills/find.js';
import { cmdSkillsList } from '../commands/skills/list.js';
import { cmdSkillsRemove } from '../commands/skills/rm.js';
import { cmdSkillsSync } from '../commands/skills/sync.js';
import { cmdSkillsUpdate } from '../commands/skills/update.js';
import { cmdSkillsShow } from '../commands/skills/show.js';
import { cmdSkillsOrganize } from '../commands/skills/organize.js';
import { cmdAgentsAdd } from '../commands/agents/add.js';
import { cmdAgentsCollect } from '../commands/agents/collect.js';
import { cmdAgentsFind } from '../commands/agents/find.js';
import { cmdAgentsList } from '../commands/agents/list.js';
import { cmdAgentsRemove } from '../commands/agents/rm.js';
import { cmdAgentsSync } from '../commands/agents/sync.js';
import { cmdAgentsUpdate } from '../commands/agents/update.js';
import { cmdAgentsShow } from '../commands/agents/show.js';
import { cmdAgentsOrganize } from '../commands/agents/organize.js';
import { cmdCommandsAdd } from '../commands/commands/add.js';
import { cmdCommandsCollect } from '../commands/commands/collect.js';
import { cmdCommandsFind } from '../commands/commands/find.js';
import { cmdCommandsList } from '../commands/commands/list.js';
import { cmdCommandsRemove } from '../commands/commands/rm.js';
import { cmdCommandsSync } from '../commands/commands/sync.js';
import { cmdCommandsUpdate } from '../commands/commands/update.js';
import { cmdCommandsShow } from '../commands/commands/show.js';
import { cmdCommandsOrganize } from '../commands/commands/organize.js';
import { cmdRulesAdd } from '../commands/rules/add.js';
import { cmdRulesCollect } from '../commands/rules/collect.js';
import { cmdRulesFind } from '../commands/rules/find.js';
import { cmdRulesList } from '../commands/rules/list.js';
import { cmdRulesRemove } from '../commands/rules/rm.js';
import { cmdRulesShow } from '../commands/rules/show.js';
import { cmdRulesSync } from '../commands/rules/sync.js';
import { cmdRulesValidate } from '../commands/rules/validate.js';
import { cmdRulesOrganize } from '../commands/rules/organize.js';
import { cmdMcpAdd } from '../commands/mcp/add.js';
import { cmdMcpCollect } from '../commands/mcp/collect.js';
import { cmdMcpFind } from '../commands/mcp/find.js';
import { cmdMcpList } from '../commands/mcp/list.js';
import { cmdMcpRemove } from '../commands/mcp/rm.js';
import { cmdMcpSync } from '../commands/mcp/sync.js';
import { cmdMcpUpdate } from '../commands/mcp/update.js';
import { cmdMcpShow } from '../commands/mcp/show.js';
import { cmdMcpOrganize } from '../commands/mcp/organize.js';
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

  if (group === 'agents') {
    return await dispatchAgents(cmd, positionals, flags, ctx);
  }

  if (group === 'mcp') {
    return await dispatchMcp(cmd, positionals, flags, ctx);
  }

  if (group === 'rules') {
    return await dispatchRules(cmd, positionals, flags, ctx);
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
    case 'find':
      return await cmdSkillsFind(positionals, flags, ctx);
    case 'list':
      return await cmdSkillsList(positionals, flags, ctx);
    case 'show':
      return await cmdSkillsShow(positionals, flags, ctx);
    case 'organize':
      return await cmdSkillsOrganize(positionals, flags, ctx);
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
    case 'find':
      return await cmdCommandsFind(positionals, flags, ctx);
    case 'list':
      return await cmdCommandsList(positionals, flags, ctx);
    case 'show':
      return await cmdCommandsShow(positionals, flags, ctx);
    case 'organize':
      return await cmdCommandsOrganize(positionals, flags, ctx);
    case 'help':
    default:
      process.stdout.write(formatHelp('commands'));
      return cmd === 'help' ? 0 : 1;
  }
}

async function dispatchAgents(
  cmd: string,
  positionals: string[],
  flags: Record<string, string | boolean>,
  ctx: CliRunContext,
): Promise<number> {
  switch (cmd) {
    case 'add':
      return await cmdAgentsAdd(positionals, flags, ctx);
    case 'rm':
      return await cmdAgentsRemove(positionals, flags, ctx);
    case 'update':
      return await cmdAgentsUpdate(positionals, flags, ctx);
    case 'sync':
      return await cmdAgentsSync(positionals, flags, ctx);
    case 'collect':
      return await cmdAgentsCollect(positionals, flags, ctx);
    case 'find':
      return await cmdAgentsFind(positionals, flags, ctx);
    case 'list':
      return await cmdAgentsList(positionals, flags, ctx);
    case 'show':
      return await cmdAgentsShow(positionals, flags, ctx);
    case 'organize':
      return await cmdAgentsOrganize(positionals, flags, ctx);
    case 'help':
    default:
      process.stdout.write(formatHelp('agents'));
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
    case 'find':
      return await cmdMcpFind(positionals, flags, ctx);
    case 'list':
      return await cmdMcpList(positionals, flags, ctx);
    case 'show':
      return await cmdMcpShow(positionals, flags, ctx);
    case 'organize':
      return await cmdMcpOrganize(positionals, flags, ctx);
    case 'help':
    default:
      process.stdout.write(formatHelp('mcp'));
      return cmd === 'help' ? 0 : 1;
  }
}

async function dispatchRules(
  cmd: string,
  positionals: string[],
  flags: Record<string, string | boolean>,
  ctx: CliRunContext,
): Promise<number> {
  switch (cmd) {
    case 'add':
      return await cmdRulesAdd(positionals, flags, ctx);
    case 'rm':
      return await cmdRulesRemove(positionals, flags, ctx);
    case 'sync':
      return await cmdRulesSync(positionals, flags, ctx);
    case 'collect':
      return await cmdRulesCollect(positionals, flags, ctx);
    case 'find':
      return await cmdRulesFind(positionals, flags, ctx);
    case 'list':
      return await cmdRulesList(positionals, flags, ctx);
    case 'show':
      return await cmdRulesShow(positionals, flags, ctx);
    case 'validate':
      return await cmdRulesValidate(positionals, flags, ctx);
    case 'organize':
      return await cmdRulesOrganize(positionals, flags, ctx);
    case 'help':
    default:
      process.stdout.write(formatHelp('rules'));
      return cmd === 'help' ? 0 : 1;
  }
}
