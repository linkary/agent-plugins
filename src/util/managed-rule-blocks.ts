/**
 * Shared managed-block parsing/rendering for single-file global rules.
 *
 * Used by Cursor (SQLite User Rules), Claude Code (~/.claude/CLAUDE.md),
 * and Antigravity (~/.gemini/GEMINI.md) to embed managed rule blocks
 * inside a host document without overwriting user content.
 */
import { canonicalRuleIdFromPath } from './rule-transform.js';

const BLOCK_RE = /<!--\s*ap-rule:start\s+id="([^"]+)"\s*-->\s*\n?([\s\S]*?)\n?<!--\s*ap-rule:end\s*-->\s*\n?/g;

export type ManagedRuleBlock = {
  id: string;
  relativePath: string;
  content: string;
};

/** Parse all `<!-- ap-rule:start id="..." -->` blocks from text. */
export function parseManagedRuleBlocks(text: string): ManagedRuleBlock[] {
  const out: ManagedRuleBlock[] = [];
  BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null = BLOCK_RE.exec(text);
  while (match) {
    const id = canonicalRuleIdFromPath(match[1]!);
    out.push({
      id,
      relativePath: `${id}.md`,
      content: match[2]!,
    });
    match = BLOCK_RE.exec(text);
  }
  return out;
}

/** Strip all managed blocks from text, returning only user-authored content. */
export function stripManagedBlocks(text: string): string {
  BLOCK_RE.lastIndex = 0;
  return text.replace(BLOCK_RE, '').trim();
}

/** Render a single managed block with start/end markers. */
export function renderManagedBlock(id: string, content: string): string {
  const body = content.replace(/\s+$/, '');
  return `<!-- ap-rule:start id="${id}" -->\n${body}\n<!-- ap-rule:end -->`;
}

/**
 * Merge managed rule blocks into existing text, preserving user-authored content.
 * Replaces all existing managed blocks and appends new ones.
 */
export function renderManagedRulesText(
  existingText: string,
  managedRules: Map<string, string>,
): string {
  const unmanaged = stripManagedBlocks(existingText);
  const managedBlocks = Array.from(managedRules.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, content]) => renderManagedBlock(id, content));
  const sections: string[] = [];
  if (unmanaged) sections.push(unmanaged);
  if (managedBlocks.length > 0) sections.push(managedBlocks.join('\n\n'));
  if (sections.length === 0) return '';
  return `${sections.join('\n\n').replace(/\s+$/, '')}\n`;
}
