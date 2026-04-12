import crypto from 'node:crypto';
import path from 'node:path';
import type { TargetId } from '../targets/adapters.js';
import { normalizeRulePath } from './rule-utils.js';

export type RuleFrontmatterValue = string | boolean | string[];
export type RuleFormat = 'cursor-mdc' | 'claude-md';
export type RuleCapability =
  | { kind: 'prompt'; format: RuleFormat; extension: '.mdc' | '.md' }
  | { kind: 'exec'; extension: '.rules'; reason: string }
  | { kind: 'unsupported'; reason: string };

export type CanonicalRule = {
  id: string;
  body: string;
  description?: string;
  paths: string[];
  alwaysApply?: boolean;
  extra: Record<string, RuleFrontmatterValue>;
};

type ParsedFrontmatter = {
  attrs: Record<string, RuleFrontmatterValue>;
  body: string;
};

const RULE_EXT_RE = /\.(md|mdc)$/i;

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, '');
}

function parseScalar(value: string): string | boolean {
  const lowered = value.trim().toLowerCase();
  if (lowered === 'true') return true;
  if (lowered === 'false') return false;
  return stripQuotes(value.trim());
}

function parseInlineArray(value: string): string[] | null {
  const match = value.match(/^\[(.*)\]$/);
  if (!match) return null;
  return match[1]!
    .split(',')
    .map((item) => stripQuotes(item.trim()))
    .filter(Boolean);
}

function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { attrs: {}, body: content };

  const attrs: Record<string, RuleFrontmatterValue> = {};
  const lines = match[1]!.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) {
      i++;
      continue;
    }

    const key = kv[1]!;
    const rawValue = kv[2]!.trim();
    if (!rawValue) {
      const list: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const item = lines[j]!.match(/^\s*-\s+(.+)$/);
        if (!item) break;
        list.push(stripQuotes(item[1]!.trim()));
        j++;
      }
      if (list.length > 0) attrs[key] = list;
      i = j;
      continue;
    }

    const inlineArray = parseInlineArray(rawValue);
    if (inlineArray) {
      attrs[key] = inlineArray;
      i++;
      continue;
    }
    attrs[key] = parseScalar(rawValue);
    i++;
  }

  return { attrs, body: content.slice(match[0].length) };
}

function formatYamlScalar(value: string | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === '') return '""';
  if (/[:#[\]{}]|^\s|\s$/.test(value)) return JSON.stringify(value);
  return value;
}

function formatFrontmatter(attrs: Record<string, RuleFrontmatterValue>): string {
  const entries = Object.entries(attrs);
  if (entries.length === 0) return '';

  const lines: string[] = ['---'];
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${formatYamlScalar(item)}`);
      continue;
    }
    lines.push(`${key}: ${formatYamlScalar(value)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

function asString(value: RuleFrontmatterValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asBoolean(value: RuleFrontmatterValue | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asStringArray(value: RuleFrontmatterValue | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

export function canonicalRuleIdFromPath(rulePath: string): string {
  const normalized = normalizeRulePath(rulePath);
  return normalized.replace(RULE_EXT_RE, '');
}

export function getRuleCapability(target: TargetId): RuleCapability {
  switch (target) {
    case 'cursor':
      return { kind: 'prompt', format: 'cursor-mdc', extension: '.mdc' };
    case 'claude-code':
    case 'qoder':
    case 'antigravity':
      return { kind: 'prompt', format: 'claude-md', extension: '.md' };
    case 'codex':
      return {
        kind: 'exec',
        extension: '.rules',
        reason: 'Codex rules are execution-policy rules, not prompt rules.',
      };
    default:
      return {
        kind: 'unsupported',
        reason: 'This target does not use a compatible rules directory format.',
      };
  }
}

export function parseRuleToCanonical(rulePath: string, content: string): CanonicalRule {
  const parsed = parseFrontmatter(content);
  const raw = { ...parsed.attrs };
  const apId = asString(raw.ap_id);
  delete raw.ap_id;

  const description = asString(raw.description);
  delete raw.description;

  const cursorPaths = asStringArray(raw.globs);
  delete raw.globs;
  const claudePaths = asStringArray(raw.paths);
  delete raw.paths;
  const paths = cursorPaths.length > 0 ? cursorPaths : claudePaths;

  const alwaysApply = asBoolean(raw.alwaysApply);
  delete raw.alwaysApply;

  const id = canonicalRuleIdFromPath(apId ?? rulePath);
  const body = parsed.body || '';

  // Keep unknown frontmatter keys for round-trip stability.
  const extra: Record<string, RuleFrontmatterValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' || typeof value === 'boolean' || Array.isArray(value)) {
      extra[key] = value;
    }
  }

  return {
    id,
    body,
    description,
    paths,
    alwaysApply,
    extra,
    // format intentionally inferred/consumed here to normalize content semantics
  };
}

export function serializeCanonicalRule(
  rule: CanonicalRule,
  targetFormat: RuleFormat,
): { relativePath: string; content: string; lossy: boolean } {
  const attrs: Record<string, RuleFrontmatterValue> = {
    ap_id: rule.id,
    ...rule.extra,
  };

  if (rule.description) attrs.description = rule.description;
  if (rule.paths.length > 0) {
    if (targetFormat === 'cursor-mdc') attrs.globs = [...rule.paths];
    else attrs.paths = [...rule.paths];
  }
  if (typeof rule.alwaysApply === 'boolean') attrs.alwaysApply = rule.alwaysApply;

  const extension = targetFormat === 'cursor-mdc' ? '.mdc' : '.md';
  const relativePath = `${rule.id}${extension}`;
  let body = rule.body;
  if (!body.startsWith('\n')) body = `\n${body}`;
  const content = `${formatFrontmatter(attrs)}${body}`.replace(/\n+$/, '\n');
  return { relativePath, content, lossy: false };
}

export function selectPreferredRulePathsForTarget(paths: string[], targetFormat: RuleFormat): string[] {
  const byId = new Map<string, string[]>();
  for (const candidate of paths) {
    const id = canonicalRuleIdFromPath(candidate);
    const list = byId.get(id);
    if (list) list.push(candidate);
    else byId.set(id, [candidate]);
  }

  const preferredExt = targetFormat === 'cursor-mdc' ? '.mdc' : '.md';
  const out: string[] = [];
  for (const items of byId.values()) {
    const sorted = [...items].sort((a, b) => {
      const aScore = path.extname(a).toLowerCase() === preferredExt ? 0 : 1;
      const bScore = path.extname(b).toLowerCase() === preferredExt ? 0 : 1;
      if (aScore !== bScore) return aScore - bScore;
      return a.localeCompare(b);
    });
    out.push(sorted[0]!);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function computeRuleContentHash(content: string): string {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

export function computeCanonicalRuleHash(rule: CanonicalRule): string {
  const normalized = {
    id: rule.id,
    body: rule.body,
    description: rule.description ?? '',
    paths: [...rule.paths].sort(),
    alwaysApply: rule.alwaysApply ?? null,
    extra: Object.fromEntries(Object.entries(rule.extra).sort(([a], [b]) => a.localeCompare(b))),
  };
  return computeRuleContentHash(JSON.stringify(normalized));
}
