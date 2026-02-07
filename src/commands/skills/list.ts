import path from 'node:path';
import fs from 'node:fs/promises';
import { listCentralSkills, getCentralSkillPath } from '../../core/skill-store.js';
import { loadRegistry } from '../../core/registry.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

// ANSI colors
const dim = '\x1b[2m';
const cyan = '\x1b[36m';
const yellow = '\x1b[33m';
const reset = '\x1b[0m';

async function readSkillDescription(skillPath: string): Promise<string | undefined> {
  try {
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    const content = await fs.readFile(skillMdPath, 'utf-8');
    
    // Parse YAML frontmatter for description
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1]!;
      const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
      if (descMatch) {
        return descMatch[1]!.trim().replace(/^["']|["']$/g, '');
      }
    }
    
    // Fallback: first non-header line
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
        return trimmed.slice(0, 80) + (trimmed.length > 80 ? '...' : '');
      }
    }
  } catch {
    // Ignore errors
  }
  return undefined;
}

function formatRelativeTime(isoDate: string | undefined): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

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
    
    // Basic output: name
    let line = `${cyan}${name}${reset}`;
    
    // Add source info
    if (record?.source) {
      if (record.source.type === 'git') {
        const repoShort = record.source.url
          .replace(/^https?:\/\/github\.com\//, '')
          .replace(/\.git$/, '');
        line += ` ${dim}(${repoShort})${reset}`;
      } else if (record.source.type === 'local') {
        line += ` ${dim}(local)${reset}`;
      } else if (record.source.type === 'collected') {
        line += ` ${dim}(from ${record.source.from.target})${reset}`;
      }
    }
    
    // Add time
    const time = formatRelativeTime(record?.updatedAt ?? record?.addedAt);
    if (time) {
      line += ` ${yellow}${time}${reset}`;
    }
    
    process.stdout.write(line + '\n');
    
    // Verbose: show description
    if (verbose) {
      const desc = await readSkillDescription(skillPath);
      if (desc) {
        process.stdout.write(`  ${dim}${desc}${reset}\n`);
      }
    }
  }
  
  process.stdout.write(`\n${dim}${skills.length} skill(s)${reset}\n`);
  return 0;
}

