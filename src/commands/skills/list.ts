import { listCentralSkills } from '../../core/skill-store.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdSkillsList(_positionals: string[], _flags: ParsedFlags, _ctx: CliRunContext) {
  const skills = await listCentralSkills();
  if (skills.length === 0) {
    process.stdout.write('(no skills installed)\n');
    return 0;
  }
  for (const name of skills) process.stdout.write(`${name}\n`);
  return 0;
}
