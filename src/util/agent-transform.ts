import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { stringify as stringifyToml, parse as parseToml } from 'smol-toml';
import { computeDirHash } from './hash-dir.js';
import { ensureDir, pathExists, removeDir, removeDirContents } from './fs-utils.js';
import { parseMarkdownAgentContent, serializeMarkdownAgent } from '../core/agent-store.js';
import type { AgentEntry, AgentSpec } from '../core/agent-types.js';
import type { TargetAdapter, TargetId } from '../targets/adapters.js';

const CANONICAL_META_FILENAME = 'agent.toml';
const CANONICAL_PROMPT_FILENAME = 'prompt.md';
const CANONICAL_RESOURCES_DIRNAME = 'resources';
const CODEX_ROLE_FILENAME = 'agent.toml';
const LEGACY_AGENT_FILENAMES = ['AGENT.md', 'SKILL.md'] as const;
const IGNORED_NAMES = new Set(['.git']);
const CODEX_EXTENSION_KEY = 'codex';
const CODEX_SUPPORTED_EXTENSION_KEYS = [
  'approval_policy',
  'mcp_servers',
  'model_reasoning_effort',
  'nickname_candidates',
  'profile',
  'sandbox_mode',
  'skills',
  'web_search',
] as const;

export type FilesystemAgentEntry = AgentEntry;

function normalizeStringMap(input?: Record<string, string>): Record<string, string> | undefined {
  if (!input || Object.keys(input).length === 0) return undefined;
  return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)));
}

function normalizeSpec(spec: AgentSpec): string {
  return JSON.stringify({
    name: spec.name,
    description: spec.description ?? null,
    prompt: spec.prompt,
    model: spec.model ?? null,
    color: spec.color ?? null,
    tools: spec.tools ? [...spec.tools].sort() : [],
    metadata: normalizeStringMap(spec.metadata) ?? {},
    extensions: spec.extensions ?? {},
  });
}

async function classifyDirectoryStorage(dirPath: string): Promise<AgentEntry['storage']> {
  const metaPath = path.join(dirPath, CANONICAL_META_FILENAME);
  const promptPath = path.join(dirPath, CANONICAL_PROMPT_FILENAME);
  if ((await pathExists(metaPath)) && (await pathExists(promptPath))) return 'canonical';
  if (await pathExists(path.join(dirPath, CODEX_ROLE_FILENAME))) return 'codex-toml';
  return 'legacy-directory';
}

export async function classifyFilesystemAgentPath(agentPath: string, fallbackName?: string): Promise<FilesystemAgentEntry | null> {
  try {
    const stat = await fs.stat(agentPath);
    if (stat.isFile()) {
      const ext = path.extname(agentPath).toLowerCase();
      return {
        name: fallbackName ?? path.basename(agentPath, path.extname(agentPath)),
        path: agentPath,
        storage: ext === '.toml' ? 'codex-toml' : 'legacy-file',
        form: 'file',
      };
    }
    if (!stat.isDirectory()) return null;
    return {
      name: fallbackName ?? path.basename(agentPath),
      path: agentPath,
      storage: await classifyDirectoryStorage(agentPath),
      form: 'directory',
    };
  } catch {
    return null;
  }
}

async function readCanonicalDirectoryAgent(entry: FilesystemAgentEntry): Promise<AgentSpec | null> {
  const metaPath = path.join(entry.path, CANONICAL_META_FILENAME);
  const promptPath = path.join(entry.path, CANONICAL_PROMPT_FILENAME);
  if (!(await pathExists(metaPath)) || !(await pathExists(promptPath))) return null;

  const [metaRaw, promptRaw] = await Promise.all([fs.readFile(metaPath, 'utf8'), fs.readFile(promptPath, 'utf8')]);
  const parsed = parseToml(metaRaw) as Record<string, unknown>;
  const tools = Array.isArray(parsed.tools) ? parsed.tools.map((item) => String(item)) : undefined;
  const metadata =
    parsed.metadata && typeof parsed.metadata === 'object' && !Array.isArray(parsed.metadata)
      ? Object.fromEntries(
          Object.entries(parsed.metadata as Record<string, unknown>)
            .filter(([, value]) => typeof value === 'string')
            .map(([key, value]) => [key, value as string]),
        )
      : undefined;

  return {
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : entry.name,
    description: typeof parsed.description === 'string' && parsed.description.trim() ? parsed.description.trim() : undefined,
    prompt: promptRaw,
    model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : undefined,
    color: typeof parsed.color === 'string' && parsed.color.trim() ? parsed.color.trim() : undefined,
    tools: tools && tools.length > 0 ? tools : undefined,
    metadata,
    extensions:
      parsed.extensions && typeof parsed.extensions === 'object' && !Array.isArray(parsed.extensions)
        ? (parsed.extensions as Record<string, Record<string, unknown>>)
        : undefined,
  };
}

function normalizeCodexExtensionObject(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!value || Object.keys(value).length === 0) return undefined;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

function getCodexExtension(spec: AgentSpec): Record<string, unknown> | undefined {
  const raw = spec.extensions?.[CODEX_EXTENSION_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const filtered: Record<string, unknown> = {};
  for (const key of CODEX_SUPPORTED_EXTENSION_KEYS) {
    if (raw[key] !== undefined) filtered[key] = raw[key];
  }
  return normalizeCodexExtensionObject(filtered);
}

function deriveDescriptionFromPrompt(prompt: string): string | undefined {
  for (const line of prompt.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    return trimmed.slice(0, 120);
  }
  return undefined;
}

function resolveCodexDescription(spec: AgentSpec): string {
  return (
    spec.description?.trim() ||
    deriveDescriptionFromPrompt(spec.prompt) ||
    `${spec.name} agent role`
  );
}

function resolveCodexInstructions(spec: AgentSpec): string {
  const trimmed = spec.prompt.trim();
  if (trimmed) return spec.prompt.trimEnd();
  return spec.description?.trim() || `You are ${spec.name}. Help with the assigned task.`;
}

function buildCodexRoleRecord(spec: AgentSpec): Record<string, unknown> {
  const record: Record<string, unknown> = {
    name: spec.name,
    description: resolveCodexDescription(spec),
    developer_instructions: resolveCodexInstructions(spec),
  };
  if (spec.model) record.model = spec.model;
  const codexExtension = getCodexExtension(spec);
  if (codexExtension) {
    for (const [key, value] of Object.entries(codexExtension)) record[key] = value;
  }
  return record;
}

function parseCodexRoleContent(content: string, fallbackName: string): AgentSpec | null {
  const parsed = parseToml(content) as Record<string, unknown>;
  const developerInstructions = typeof parsed.developer_instructions === 'string' ? parsed.developer_instructions : '';
  const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : fallbackName;
  const description =
    typeof parsed.description === 'string' && parsed.description.trim() ? parsed.description.trim() : undefined;

  const codexExtension: Record<string, unknown> = {};
  for (const key of CODEX_SUPPORTED_EXTENSION_KEYS) {
    if (parsed[key] !== undefined) codexExtension[key] = parsed[key];
  }

  return {
    name,
    description,
    prompt: developerInstructions,
    model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : undefined,
    extensions: Object.keys(codexExtension).length > 0 ? { [CODEX_EXTENSION_KEY]: codexExtension } : undefined,
  };
}

async function readCodexTomlAgent(entry: FilesystemAgentEntry): Promise<AgentSpec | null> {
  const filePath = entry.form === 'directory' ? path.join(entry.path, CODEX_ROLE_FILENAME) : entry.path;
  if (!(await pathExists(filePath))) return null;
  const raw = await fs.readFile(filePath, 'utf8');
  return parseCodexRoleContent(raw, entry.name);
}

async function readLegacyDirectoryAgent(entry: FilesystemAgentEntry): Promise<AgentSpec | null> {
  for (const filename of LEGACY_AGENT_FILENAMES) {
    const promptPath = path.join(entry.path, filename);
    if (!(await pathExists(promptPath))) continue;
    const raw = await fs.readFile(promptPath, 'utf8');
    return parseMarkdownAgentContent(raw, entry.name);
  }
  return null;
}

async function listResourceEntries(sourcePath: string, storage: AgentEntry['storage'], form: AgentEntry['form']): Promise<string[]> {
  if (form !== 'directory') return [];

  if (storage === 'canonical') {
    const resourcesDir = path.join(sourcePath, CANONICAL_RESOURCES_DIRNAME);
    if (!(await pathExists(resourcesDir))) return [];
    const entries = await fs.readdir(resourcesDir, { withFileTypes: true });
    return entries.filter((entry) => !IGNORED_NAMES.has(entry.name)).map((entry) => entry.name).sort();
  }

  const entries = await fs.readdir(sourcePath, { withFileTypes: true });
  return entries
    .filter((entry) => !IGNORED_NAMES.has(entry.name))
    .filter((entry) => !LEGACY_AGENT_FILENAMES.includes(entry.name as (typeof LEGACY_AGENT_FILENAMES)[number]))
    .filter(
      (entry) =>
        entry.name !== CANONICAL_META_FILENAME &&
        entry.name !== CANONICAL_PROMPT_FILENAME &&
        entry.name !== CODEX_ROLE_FILENAME,
    )
    .map((entry) => entry.name)
    .sort();
}

async function computeResourceHash(entry: FilesystemAgentEntry): Promise<string | null> {
  if (entry.form !== 'directory') return null;

  if (entry.storage === 'canonical') {
    const resourcesDir = path.join(entry.path, CANONICAL_RESOURCES_DIRNAME);
    if (!(await pathExists(resourcesDir))) return null;
    return await computeDirHash(resourcesDir, { ignoreNames: ['.git'] });
  }

  const names = await listResourceEntries(entry.path, entry.storage, entry.form);
  if (names.length === 0) return null;

  const hash = crypto.createHash('sha256');
  for (const name of names) {
    const fullPath = path.join(entry.path, name);
    const stat = await fs.stat(fullPath);
    const itemHash = stat.isDirectory()
      ? await computeDirHash(fullPath, { ignoreNames: ['.git'] })
      : `sha256:${crypto.createHash('sha256').update(await fs.readFile(fullPath)).digest('hex')}`;
    hash.update(`${name}:${itemHash}`);
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

async function copyResourceEntries(sourceEntry: FilesystemAgentEntry, destDir: string): Promise<boolean> {
  const names = await listResourceEntries(sourceEntry.path, sourceEntry.storage, sourceEntry.form);
  if (names.length === 0) return false;

  for (const name of names) {
    const srcBase = sourceEntry.storage === 'canonical' ? path.join(sourceEntry.path, CANONICAL_RESOURCES_DIRNAME) : sourceEntry.path;
    const srcPath = path.join(srcBase, name);
    const destPath = path.join(destDir, name);
    const stat = await fs.stat(srcPath);
    if (stat.isDirectory()) {
      await ensureDir(path.dirname(destPath));
      await removeDir(destPath);
      const { copyDir } = await import('./copy-dir.js');
      await copyDir(srcPath, destPath, { ignoreNames: ['.git'] });
    } else {
      await ensureDir(path.dirname(destPath));
      await fs.copyFile(srcPath, destPath);
    }
  }

  return true;
}

export async function scanFilesystemAgents(agentsDir: string): Promise<FilesystemAgentEntry[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.readdir(agentsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const dedup = new Map<string, FilesystemAgentEntry>();
  for (const dirent of entries) {
    if (dirent.name.startsWith('.')) continue;
    if (dirent.isDirectory()) {
      const entryPath = path.join(agentsDir, dirent.name);
      dedup.set(dirent.name, {
        name: dirent.name,
        path: entryPath,
        storage: await classifyDirectoryStorage(entryPath),
        form: 'directory',
      });
      continue;
    }
    if (!dirent.isFile() || (!dirent.name.endsWith('.md') && !dirent.name.endsWith('.toml'))) continue;
    const ext = path.extname(dirent.name);
    const name = dirent.name.slice(0, -ext.length);
    if (dedup.has(name)) continue;
    dedup.set(name, {
      name,
      path: path.join(agentsDir, dirent.name),
      storage: ext === '.toml' ? 'codex-toml' : 'legacy-file',
      form: 'file',
    });
  }

  return [...dedup.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function compareFilesystemAgents(
  sourceEntry: FilesystemAgentEntry,
  targetEntry: FilesystemAgentEntry,
): Promise<'same' | 'different' | 'unreadable'> {
  return compareAgentEntries(sourceEntry, targetEntry, 'central');
}

function getTargetAgentFormat(target: TargetId | TargetAdapter | 'central'): 'central' | 'filesystem-markdown' | 'codex-toml' {
  if (target === 'central') return 'central';
  if (typeof target === 'string') return target === 'codex' ? 'codex-toml' : 'filesystem-markdown';
  return target.agentFormat ?? 'filesystem-markdown';
}

function normalizeSpecForTarget(spec: AgentSpec, target: TargetId | TargetAdapter | 'central'): string {
  const format = getTargetAgentFormat(target);
  if (format !== 'codex-toml') return normalizeSpec(spec);
  return JSON.stringify(buildCodexRoleRecord(spec));
}

export async function compareAgentEntries(
  sourceEntry: FilesystemAgentEntry,
  targetEntry: FilesystemAgentEntry,
  target: TargetId | TargetAdapter | 'central',
): Promise<'same' | 'different' | 'unreadable'> {
  const [sourceHash, targetHash] = await Promise.all([
    computeAgentHashForTarget(sourceEntry, target),
    computeAgentHashForTarget(targetEntry, target),
  ]);
  if (!sourceHash || !targetHash) return 'unreadable';
  return sourceHash === targetHash ? 'same' : 'different';
}

export async function readAgentSpecFromEntry(entry: FilesystemAgentEntry): Promise<AgentSpec | null> {
  if (entry.storage === 'canonical') {
    return await readCanonicalDirectoryAgent(entry);
  }

  if (entry.storage === 'codex-toml') {
    return await readCodexTomlAgent(entry);
  }

  if (entry.form === 'file') {
    const raw = await fs.readFile(entry.path, 'utf8');
    return parseMarkdownAgentContent(raw, entry.name);
  }

  return await readLegacyDirectoryAgent(entry);
}

export async function computeAgentCanonicalHash(entry: FilesystemAgentEntry): Promise<string | null> {
  return computeAgentHashForTarget(entry, 'central');
}

export async function computeAgentHashForTarget(
  entry: FilesystemAgentEntry,
  target: TargetId | TargetAdapter | 'central',
): Promise<string | null> {
  const spec = await readAgentSpecFromEntry(entry);
  if (!spec) return null;

  const resourceHash = await computeResourceHash(entry);
  const hash = crypto.createHash('sha256');
  hash.update(normalizeSpecForTarget(spec, target));
  hash.update('\0');
  hash.update(resourceHash ?? '');
  return `sha256:${hash.digest('hex')}`;
}

export async function computeAgentSpecHash(spec: AgentSpec, resourceHash?: string | null): Promise<string> {
  const hash = crypto.createHash('sha256');
  hash.update(normalizeSpec(spec));
  hash.update('\0');
  hash.update(resourceHash ?? '');
  return `sha256:${hash.digest('hex')}`;
}

export async function resolveFilesystemAgentPaths(targetDir: string, sourceEntry: FilesystemAgentEntry): Promise<{
  destPath: string;
  altDestPath: string;
  form: 'directory' | 'file';
}> {
  const resolved = await resolveTargetAgentPaths({ id: 'cursor', agentFormat: 'filesystem-markdown' } as TargetAdapter, targetDir, sourceEntry);
  return {
    destPath: resolved.destPath,
    altDestPath: resolved.altDestPaths[0] ?? '',
    form: resolved.form,
  };
}

export async function resolveTargetAgentPaths(
  adapter: TargetAdapter,
  targetDir: string,
  sourceEntry: FilesystemAgentEntry,
): Promise<{
  destPath: string;
  altDestPaths: string[];
  form: 'directory' | 'file';
}> {
  const hasResources = (await listResourceEntries(sourceEntry.path, sourceEntry.storage, sourceEntry.form)).length > 0;
  if (getTargetAgentFormat(adapter) === 'codex-toml') {
    return hasResources
      ? {
          destPath: path.join(targetDir, sourceEntry.name),
          altDestPaths: [path.join(targetDir, `${sourceEntry.name}.toml`), path.join(targetDir, `${sourceEntry.name}.md`)],
          form: 'directory',
        }
      : {
          destPath: path.join(targetDir, `${sourceEntry.name}.toml`),
          altDestPaths: [path.join(targetDir, sourceEntry.name), path.join(targetDir, `${sourceEntry.name}.md`)],
          form: 'file',
        };
  }
  return hasResources
    ? {
        destPath: path.join(targetDir, sourceEntry.name),
        altDestPaths: [path.join(targetDir, `${sourceEntry.name}.md`)],
        form: 'directory',
      }
    : {
        destPath: path.join(targetDir, `${sourceEntry.name}.md`),
        altDestPaths: [path.join(targetDir, sourceEntry.name)],
        form: 'file',
      };
}

export async function resolveNamedTargetAgentPath(
  adapter: TargetAdapter,
  agentsDir: string,
  name: string,
): Promise<{ path: string; form: 'directory' | 'file' } | null> {
  const candidates =
    getTargetAgentFormat(adapter) === 'codex-toml'
      ? [path.join(agentsDir, name), path.join(agentsDir, `${name}.toml`), path.join(agentsDir, `${name}.md`)]
      : [path.join(agentsDir, name), path.join(agentsDir, `${name}.md`)];

  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) continue;
    const stat = await fs.stat(candidate);
    return { path: candidate, form: stat.isDirectory() ? 'directory' : 'file' };
  }

  return null;
}

export async function writeAgentToTarget(params: {
  adapter: TargetAdapter;
  spec: AgentSpec;
  sourceEntry: FilesystemAgentEntry;
  targetDir: string;
}): Promise<{ destPath: string; form: 'directory' | 'file' }> {
  const { adapter, spec, sourceEntry, targetDir } = params;
  const paths = await resolveTargetAgentPaths(adapter, targetDir, sourceEntry);
  const format = getTargetAgentFormat(adapter);
  const content =
    format === 'codex-toml' ? `${stringifyToml(buildCodexRoleRecord(spec))}\n` : serializeMarkdownAgent(spec);

  if (paths.form === 'file') {
    await ensureDir(targetDir);
    await fs.writeFile(paths.destPath, content, 'utf8');
    for (const cleanupPath of paths.altDestPaths) await fs.rm(cleanupPath, { recursive: true, force: true });
    return { destPath: paths.destPath, form: 'file' };
  }

  await ensureDir(paths.destPath);
  await removeDirContents(paths.destPath);
  await fs.writeFile(
    path.join(paths.destPath, format === 'codex-toml' ? CODEX_ROLE_FILENAME : 'AGENT.md'),
    content,
    'utf8',
  );
  await copyResourceEntries(sourceEntry, paths.destPath);
  for (const cleanupPath of paths.altDestPaths) await fs.rm(cleanupPath, { recursive: true, force: true });
  return { destPath: paths.destPath, form: 'directory' };
}

export async function writeAgentToFilesystemTarget(params: {
  spec: AgentSpec;
  sourceEntry: FilesystemAgentEntry;
  targetDir: string;
}): Promise<{ destPath: string; form: 'directory' | 'file' }> {
  const { spec, sourceEntry, targetDir } = params;
  return writeAgentToTarget({
    adapter: { id: 'cursor', agentFormat: 'filesystem-markdown' } as TargetAdapter,
    spec,
    sourceEntry,
    targetDir,
  });
}
