import { listCentralSkills, getCentralSkillPath } from '../../core/skill-store.js';
import { loadRegistry } from '../../core/registry.js';
import { ANSI } from '../../util/ansi.js';
import { readSkillDescription, formatRelativeTime, formatSourceShort } from '../../util/skill-meta.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

export async function cmdSkillsList(_positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const skills = await listCentralSkills();
  if (skills.length === 0) {
    process.stdout.write('(no skills installed)\n');
    return 0;
  }

  const registry = await loadRegistry();
  const verbose = flags.verbose === true || flags.v === true;

  for (const name of skills) {
    const record = registry.skills[name];
    const skillPath = getCentralSkillPath(name);

    // 基本输出：名称
    let line = `${ANSI.cyan}${name}${ANSI.reset}`;

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
      const desc = await readSkillDescription(skillPath);
      if (desc) {
        process.stdout.write(`  ${ANSI.dim}${desc}${ANSI.reset}\n`);
      }
    }
  }

  process.stdout.write(`\n${ANSI.dim}${skills.length} skill(s)${ANSI.reset}\n`);
  return 0;
}
