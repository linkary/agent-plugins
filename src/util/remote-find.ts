type FindGroup = 'skills' | 'agents' | 'commands' | 'mcp';

type FetchLike = (
  url: string,
  init?: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export type RemoteFindResult = {
  name: string;
  source?: string;
  description?: string;
  url?: string;
  addHint?: string;
  badge?: string;
};

export type RemoteFindResponse = {
  results: RemoteFindResult[];
  error?: string;
};

export type RemoteFindOptions = {
  limit?: number;
  fetcher?: FetchLike;
};

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const FETCH_TIMEOUT_MS = 7000;

const SKILLS_API_BASE = (process.env.APG_FIND_SKILLS_API ?? process.env.SKILLS_API_URL ?? 'https://skills.sh').replace(
  /\/+$/,
  '',
);
const GITHUB_API_BASE = (process.env.APG_FIND_GITHUB_API ?? 'https://api.github.com').replace(/\/+$/, '');

type SkillsSearchResponse = {
  skills?: Array<{
    id?: string;
    name?: string;
    source?: string;
    installs?: number;
  }>;
};

type GitHubRepo = {
  full_name?: string;
  html_url?: string;
  description?: string;
  stargazers_count?: number;
};

type GitHubCodeSearchResponse = {
  items?: Array<{
    path?: string;
    html_url?: string;
    repository?: GitHubRepo;
  }>;
};

type GitHubRepoSearchResponse = {
  items?: GitHubRepo[];
};

function normalizeLimit(input?: number): number {
  if (!input || !Number.isFinite(input)) return DEFAULT_LIMIT;
  const rounded = Math.floor(input);
  if (rounded < 1) return 1;
  if (rounded > MAX_LIMIT) return MAX_LIMIT;
  return rounded;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err ?? 'unknown error');
}

function formatInstalls(count: number | undefined): string | undefined {
  if (!count || count <= 0) return undefined;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M installs`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K installs`;
  return `${count} install${count === 1 ? '' : 's'}`;
}

function formatStars(count: number | undefined): string | undefined {
  if (!count || count <= 0) return undefined;
  if (count >= 1_000_000) return `★ ${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1_000) return `★ ${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `★ ${count}`;
}

function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'agent-plugins-find/1.0',
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function dedupeByUrlOrName(items: RemoteFindResult[]): RemoteFindResult[] {
  const seen = new Set<string>();
  const out: RemoteFindResult[] = [];

  for (const item of items) {
    const key = `${item.url ?? ''}|${item.source ?? ''}|${item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function inferNameFromPath(pathLike: string | undefined, fallback: string): string {
  if (!pathLike) return fallback;
  const normalized = pathLike.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) return fallback;

  const last = parts[parts.length - 1]!;
  if (/^agent\.md$/i.test(last) || /^skill\.md$/i.test(last) || /^command\.md$/i.test(last)) {
    return parts.length >= 2 ? parts[parts.length - 2]! : fallback;
  }
  if (last.toLowerCase().endsWith('.md')) {
    return last.slice(0, -3);
  }
  return last;
}

async function fetchJson<T>(fetcher: FetchLike, url: string, headers?: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetcher(url, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchSkills(query: string, limit: number, fetcher: FetchLike): Promise<RemoteFindResult[]> {
  const url = `${SKILLS_API_BASE}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  const data = await fetchJson<SkillsSearchResponse>(fetcher, url);
  const items = Array.isArray(data.skills) ? data.skills : [];

  return items
    .map((item) => {
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const slug = typeof item.id === 'string' ? item.id.trim() : '';
      if (!name) return null;
      const source = typeof item.source === 'string' ? item.source.trim() : undefined;
      return {
        name,
        source,
        url: slug ? `${SKILLS_API_BASE}/${slug}` : undefined,
        addHint: source ? `ap skills add ${source}` : undefined,
        badge: formatInstalls(item.installs),
      } satisfies RemoteFindResult;
    })
    .filter((item): item is RemoteFindResult => Boolean(item));
}

async function searchGitHubCode(
  query: string,
  filename: 'AGENT.md' | 'COMMAND.md' | 'SKILL.md',
  addPrefix: 'agents' | 'commands' | 'skills',
  limit: number,
  fetcher: FetchLike,
): Promise<RemoteFindResult[]> {
  const q = `${query} filename:${filename}`;
  const url = `${GITHUB_API_BASE}/search/code?q=${encodeURIComponent(q)}&per_page=${limit}`;
  const data = await fetchJson<GitHubCodeSearchResponse>(fetcher, url, getGitHubHeaders());
  const items = Array.isArray(data.items) ? data.items : [];

  return items
    .map((item) => {
      const repoName = item.repository?.full_name ?? '';
      const repoUrl = item.repository?.html_url;
      if (!repoName || !repoUrl) return null;
      const fallback = repoName.split('/').pop() ?? repoName;
      const name = inferNameFromPath(item.path, fallback);

      return {
        name,
        source: repoName,
        description: item.repository?.description,
        url: item.html_url ?? repoUrl,
        addHint: `ap ${addPrefix} add ${repoUrl}`,
      } satisfies RemoteFindResult;
    })
    .filter((item): item is RemoteFindResult => Boolean(item));
}

async function searchGitHubRepos(
  query: string,
  addPrefix: 'agents' | 'commands' | 'mcp',
  limit: number,
  fetcher: FetchLike,
): Promise<RemoteFindResult[]> {
  const url = `${GITHUB_API_BASE}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`;
  const data = await fetchJson<GitHubRepoSearchResponse>(fetcher, url, getGitHubHeaders());
  const items = Array.isArray(data.items) ? data.items : [];

  return items
    .map((item) => {
      const repoName = item.full_name ?? '';
      const repoUrl = item.html_url;
      if (!repoName || !repoUrl) return null;
      const name = repoName.split('/').pop() ?? repoName;

      return {
        name,
        source: repoName,
        description: item.description ?? undefined,
        url: repoUrl,
        addHint: addPrefix === 'mcp' ? undefined : `ap ${addPrefix} add ${repoUrl}`,
        badge: formatStars(item.stargazers_count),
      } satisfies RemoteFindResult;
    })
    .filter((item): item is RemoteFindResult => Boolean(item));
}

export async function searchRemoteForGroup(
  group: FindGroup,
  query: string,
  opts?: RemoteFindOptions,
): Promise<RemoteFindResponse> {
  const q = query.trim();
  if (!q) return { results: [] };

  const limit = normalizeLimit(opts?.limit);
  const fetcher = opts?.fetcher ?? ((globalThis.fetch as FetchLike | undefined) ?? null);
  if (!fetcher) return { results: [], error: 'fetch is not available in this runtime' };

  try {
    if (group === 'skills') {
      const primary = await searchSkills(q, limit, fetcher);
      if (primary.length > 0) return { results: dedupeByUrlOrName(primary).slice(0, limit) };
      const fallback = await searchGitHubCode(q, 'SKILL.md', 'skills', limit, fetcher);
      return { results: dedupeByUrlOrName(fallback).slice(0, limit) };
    }

    if (group === 'agents') {
      const primary = await searchGitHubCode(q, 'AGENT.md', 'agents', limit, fetcher);
      if (primary.length > 0) return { results: dedupeByUrlOrName(primary).slice(0, limit) };
      const fallback = await searchGitHubRepos(`${q} coding agent`, 'agents', limit, fetcher);
      return { results: dedupeByUrlOrName(fallback).slice(0, limit) };
    }

    if (group === 'commands') {
      const primary = await searchGitHubCode(q, 'COMMAND.md', 'commands', limit, fetcher);
      if (primary.length > 0) return { results: dedupeByUrlOrName(primary).slice(0, limit) };
      const fallback = await searchGitHubRepos(`${q} prompt command`, 'commands', limit, fetcher);
      return { results: dedupeByUrlOrName(fallback).slice(0, limit) };
    }

    const mcpRepos = await searchGitHubRepos(`${q} mcp server`, 'mcp', limit, fetcher);
    return { results: dedupeByUrlOrName(mcpRepos).slice(0, limit) };
  } catch (err) {
    return { results: [], error: toErrorMessage(err) };
  }
}
