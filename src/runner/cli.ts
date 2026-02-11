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

  if (path[0] !== 'skills') {
    process.stderr.write('Only `skills` commands are supported currently.\n\n');
    process.stdout.write(formatHelp());
    return 1;
  }

  const { positionals, flags } = parseOptions(rest);
  const cmd = path[1] ?? 'help';

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
      process.stdout.write(formatHelp());
      return cmd === 'help' ? 0 : 1;
  }
}
