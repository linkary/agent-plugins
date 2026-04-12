import path from 'node:path';
import fs from 'node:fs/promises';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { getCentralAgentsDir } from '../util/apg-paths.js';
import { copyDir } from '../util/copy-dir.js';
import { ensureDir, pathExists, removeDirContents } from '../util/fs-utils.js';
import type { AgentEntry, AgentReadResult, AgentSpec } from './agent-types.js';

const CANONICAL_META_FILENAME = 'agent.toml';
const CANONICAL_PROMPT_FILENAME = 'prompt.md';
const CANONICAL_RESOURCES_DIRNAME = 'resources';
const LEGACY_AGENT_FILENAMES = ['AGENT.md', 'SKILL.md'] as const;
const IGNORED_NAMES = new Set(['.git']);

type ParsedFrontmatter = {
  attributes: Record<string, unknown>;
  body: string;
};

function trimQuotes(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '');
}

function parseInlineArray(value: string): string[] | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return undefined;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((part) => trimQuotes(part))
    .filter((part) => part.length > 0);
}

function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { attributes: {}, body: content };

  const attributes: Record<string, unknown> = {};
  for (const line of match[1].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const rawValue = trimmed.slice(idx + 1).trim();
    const inlineArray = parseInlineArray(rawValue);
    if (inlineArray) {
      attributes[key] = inlineArray;
      continue;
    }
    if (rawValue === 'true') {
      attributes[key] = true;
      continue;
    }
    if (rawValue === 'false') {
      attributes[key] = false;
      continue;
    }
    attributes[key] = trimQuotes(rawValue);
  }

  return {
    attributes,
    body: content.slice(match[0].length),
  };
}

function toStringRecord(input: unknown): Record<string, string> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function parseMarkdownAgentContent(content: string, fallbackName: string): AgentSpec {
  const parsed = parseFrontmatter(content);
  const attrs = parsed.attributes;
  const tools = Array.isArray(attrs.tools)
    ? attrs.tools.map((item) => String(item))
    : undefined;
  const metadata = Object.fromEntries(
    Object.entries(attrs).filter(([key]) => !['name', 'description', 'model', 'color', 'tools'].includes(key)),
  );

  return {
    name: typeof attrs.name === 'string' && attrs.name.trim() ? attrs.name.trim() : fallbackName,
    description: typeof attrs.description === 'string' && attrs.description.trim() ? attrs.description.trim() : undefined,
    prompt: parsed.body.trim() ? parsed.body.replace(/^\s+/, '') : '',
    model: typeof attrs.model === 'string' && attrs.model.trim() ? attrs.model.trim() : undefined,
    color: typeof attrs.color === 'string' && attrs.color.trim() ? attrs.color.trim() : undefined,
    tools: tools && tools.length > 0 ? tools : undefined,
    metadata: Object.keys(metadata).length > 0 ? Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k, String(v)])) : undefined,
  };
}

function serializeMarkdownAgent(spec: AgentSpec): string {
  const frontmatter: string[] = ['---', `name: ${spec.name}`];
  if (spec.description) frontmatter.push(`description: ${JSON.stringify(spec.description)}`);
  if (spec.model) frontmatter.push(`model: ${spec.model}`);
  if (spec.color) frontmatter.push(`color: ${spec.color}`);
  if (spec.tools?.length) frontmatter.push(`tools: [${spec.tools.map((tool) => JSON.stringify(tool)).join(', ')}]`);
  if (spec.metadata) {
    for (const [key, value] of Object.entries(spec.metadata).sort(([a], [b]) => a.localeCompare(b))) {
      frontmatter.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  frontmatter.push('---', '');

  const prompt = spec.prompt.trim() ? spec.prompt.trimEnd() : '';
  return `${frontmatter.join('\n')}${prompt ? `${prompt}\n` : ''}`;
}

function parseCanonicalToml(content: string, fallbackName: string): Omit<AgentSpec, 'prompt'> {
  const parsed = parseToml(content) as Record<string, unknown>;
  const tools = Array.isArray(parsed.tools) ? parsed.tools.map((item) => String(item)) : undefined;
  const metadata = toStringRecord(parsed.metadata);
  const extensions =
    parsed.extensions && typeof parsed.extensions === 'object' && !Array.isArray(parsed.extensions)
      ? (parsed.extensions as Record<string, Record<string, unknown>>)
      : undefined;

  return {
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : fallbackName,
    description: typeof parsed.description === 'string' && parsed.description.trim() ? parsed.description.trim() : undefined,
    model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : undefined,
    color: typeof parsed.color === 'string' && parsed.color.trim() ? parsed.color.trim() : undefined,
    tools: tools && tools.length > 0 ? tools : undefined,
    metadata,
    extensions,
  };
}

async function readLegacyDirectoryAgent(entryPath: string, name: string, entry: AgentEntry): Promise<AgentReadResult | null> {
  for (const filename of LEGACY_AGENT_FILENAMES) {
    const promptPath = path.join(entryPath, filename);
    if (!(await pathExists(promptPath))) continue;
    const content = await fs.readFile(promptPath, 'utf8');
    return {
      entry,
      spec: parseMarkdownAgentContent(content, name),
      promptPath,
    };
  }
  return null;
}

function toCanonicalTomlRecord(spec: AgentSpec): Record<string, unknown> {
  const record: Record<string, unknown> = {
    name: spec.name,
  };
  if (spec.description) record.description = spec.description;
  if (spec.model) record.model = spec.model;
  if (spec.color) record.color = spec.color;
  if (spec.tools?.length) record.tools = spec.tools;
  if (spec.metadata && Object.keys(spec.metadata).length > 0) record.metadata = spec.metadata;
  if (spec.extensions && Object.keys(spec.extensions).length > 0) record.extensions = spec.extensions;
  return record;
}

async function copyResourceEntries(sourceDir: string, destDir: string): Promise<void> {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  let copied = false;
  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name)) continue;
    if (entry.name === CANONICAL_META_FILENAME || entry.name === CANONICAL_PROMPT_FILENAME || entry.name === CANONICAL_RESOURCES_DIRNAME) {
      continue;
    }
    if (LEGACY_AGENT_FILENAMES.includes(entry.name as (typeof LEGACY_AGENT_FILENAMES)[number])) continue;

    const srcPath = path.join(sourceDir, entry.name);
    const targetBase = path.join(destDir, CANONICAL_RESOURCES_DIRNAME);
    const destPath = path.join(targetBase, entry.name);
    await ensureDir(targetBase);
    copied = true;

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, { ignoreNames: [...IGNORED_NAMES] });
    } else if (entry.isFile()) {
      await ensureDir(path.dirname(destPath));
      await fs.copyFile(srcPath, destPath);
    }
  }

  if (!copied) {
    const resourcesDir = path.join(destDir, CANONICAL_RESOURCES_DIRNAME);
    await fs.rm(resourcesDir, { recursive: true, force: true });
  }
}

function classifyEntry(root: string, entry: fs.Dirent): AgentEntry | null {
  if (entry.name.startsWith('.')) return null;
  if (entry.isDirectory()) {
    const entryPath = path.join(root, entry.name);
    return {
      name: entry.name,
      path: entryPath,
      storage: 'legacy-directory',
      form: 'directory',
    };
  }
  if (!entry.isFile() || !entry.name.endsWith('.md')) return null;
  const name = entry.name.slice(0, -3);
  return {
    name,
    path: path.join(root, entry.name),
    storage: 'legacy-file',
    form: 'file',
  };
}

async function detectCanonicalStorage(entry: AgentEntry): Promise<AgentEntry> {
  if (entry.form !== 'directory') return entry;
  const metaPath = path.join(entry.path, CANONICAL_META_FILENAME);
  const promptPath = path.join(entry.path, CANONICAL_PROMPT_FILENAME);
  if ((await pathExists(metaPath)) && (await pathExists(promptPath))) {
    return { ...entry, storage: 'canonical' };
  }
  return entry;
}

export async function ensureCentralAgentStore(): Promise<void> {
  await ensureDir(getCentralAgentsDir());
}

export function getCentralAgentPath(agentName: string): string {
  return path.join(getCentralAgentsDir(), agentName);
}

export function getCentralAgentPromptPath(agentName: string): string {
  return path.join(getCentralAgentPath(agentName), CANONICAL_PROMPT_FILENAME);
}

export function getCentralAgentMetaPath(agentName: string): string {
  return path.join(getCentralAgentPath(agentName), CANONICAL_META_FILENAME);
}

export async function listCentralAgents(): Promise<string[]> {
  return (await listCentralAgentItems()).map((entry) => entry.name);
}

export async function listCentralAgentItems(): Promise<AgentEntry[]> {
  await ensureCentralAgentStore();
  const root = getCentralAgentsDir();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const dedup = new Map<string, AgentEntry>();

  for (const rawEntry of entries) {
    const classified = classifyEntry(root, rawEntry);
    if (!classified) continue;
    if (classified.form === 'directory') {
      dedup.set(classified.name, await detectCanonicalStorage(classified));
      continue;
    }
    if (dedup.has(classified.name)) continue;
    dedup.set(classified.name, classified);
  }

  return [...dedup.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveCentralAgentPath(agentName: string): Promise<string | null> {
  const entry = await resolveCentralAgentEntry(agentName);
  return entry?.path ?? null;
}

export async function resolveCentralAgentEntry(agentName: string): Promise<AgentEntry | null> {
  const dirPath = getCentralAgentPath(agentName);
  if (await pathExists(dirPath)) {
    return await detectCanonicalStorage({
      name: agentName,
      path: dirPath,
      storage: 'legacy-directory',
      form: 'directory',
    });
  }
  const filePath = `${dirPath}.md`;
  if (await pathExists(filePath)) {
    return {
      name: agentName,
      path: filePath,
      storage: 'legacy-file',
      form: 'file',
    };
  }
  return null;
}

export async function readCentralAgentSpec(agentName: string): Promise<AgentReadResult | null> {
  const entry = await resolveCentralAgentEntry(agentName);
  if (!entry) return null;

  if (entry.storage === 'canonical') {
    const [metaRaw, promptRaw] = await Promise.all([
      fs.readFile(path.join(entry.path, CANONICAL_META_FILENAME), 'utf8'),
      fs.readFile(path.join(entry.path, CANONICAL_PROMPT_FILENAME), 'utf8'),
    ]);
    return {
      entry,
      spec: {
        ...parseCanonicalToml(metaRaw, agentName),
        prompt: promptRaw,
      },
      promptPath: path.join(entry.path, CANONICAL_PROMPT_FILENAME),
    };
  }

  if (entry.form === 'file') {
    const content = await fs.readFile(entry.path, 'utf8');
    return {
      entry,
      spec: parseMarkdownAgentContent(content, agentName),
      promptPath: entry.path,
    };
  }

  return await readLegacyDirectoryAgent(entry.path, agentName, entry);
}

export async function writeCentralAgentSpec(
  spec: AgentSpec,
  options?: { sourceDir?: string; sourceFile?: string },
): Promise<string> {
  await ensureCentralAgentStore();
  const destDir = getCentralAgentPath(spec.name);
  await ensureDir(destDir);
  await removeDirContents(destDir);

  await fs.writeFile(getCentralAgentMetaPath(spec.name), stringifyToml(toCanonicalTomlRecord(spec)) + '\n', 'utf8');
  await fs.writeFile(getCentralAgentPromptPath(spec.name), spec.prompt.trim() ? `${spec.prompt.trimEnd()}\n` : '', 'utf8');

  if (options?.sourceDir) {
    await copyResourceEntries(options.sourceDir, destDir);
  } else if (options?.sourceFile) {
    await fs.rm(path.join(destDir, CANONICAL_RESOURCES_DIRNAME), { recursive: true, force: true });
  }

  const legacyFilePath = `${destDir}.md`;
  await fs.rm(legacyFilePath, { force: true });
  return destDir;
}

export async function renderCentralAgentMarkdown(agentName: string): Promise<string | null> {
  const read = await readCentralAgentSpec(agentName);
  if (!read) return null;
  return serializeMarkdownAgent(read.spec);
}

export async function listCentralAgentSpecs(): Promise<AgentReadResult[]> {
  const entries = await listCentralAgentItems();
  const results = await Promise.all(entries.map((entry) => readCentralAgentSpec(entry.name)));
  return results.filter((result): result is AgentReadResult => result !== null);
}

export { serializeMarkdownAgent };
