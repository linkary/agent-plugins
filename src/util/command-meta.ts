/**
 * 命令元数据解析工具。
 * 从 .md 文件中解析 YAML frontmatter 以获取 description、resources、tags 等信息。
 */
import fs from 'node:fs/promises';

// ─── Types ──────────────────────────────────────────────────────────────

export type CommandMeta = {
  description?: string;
  resources?: string[];
  tags?: string[];
  /** 保留原始 frontmatter 中的其它字段（如 Claude Code 的 allowed-tools） */
  raw?: Record<string, unknown>;
};

// ─── Frontmatter parsing ────────────────────────────────────────────────

/**
 * 从 .md 文件中解析 YAML frontmatter。
 * 使用简单的 key-value 解析（不引入完整 YAML 解析器依赖）。
 */
export async function parseCommandMeta(mdFilePath: string): Promise<CommandMeta> {
  try {
    const content = await fs.readFile(mdFilePath, 'utf-8');
    return parseCommandMetaFromContent(content);
  } catch {
    return {};
  }
}

/**
 * 从 .md 内容字符串解析元数据。
 */
export function parseCommandMetaFromContent(content: string): CommandMeta {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) {
    // 无 frontmatter，尝试从第一个标题提取描述
    return { description: extractFirstHeading(content) };
  }

  const frontmatter = frontmatterMatch[1]!;
  const raw: Record<string, unknown> = {};
  const meta: CommandMeta = {};

  // 解析简单的 YAML key-value 和列表
  const lines = frontmatter.split('\n');
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const line of lines) {
    // 列表项: "  - value"
    const listItemMatch = line.match(/^\s+-\s+(.+)$/);
    if (listItemMatch && currentKey && currentList) {
      currentList.push(listItemMatch[1]!.trim());
      continue;
    }

    // 有新的 key，先保存上一个列表
    if (currentKey && currentList) {
      raw[currentKey] = currentList;
      currentKey = null;
      currentList = null;
    }

    // key: value 或 key: [inline-list]
    const kvMatch = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1]!.trim();
    const value = kvMatch[2]!.trim();

    if (!value) {
      // 下一行可能是列表
      currentKey = key;
      currentList = [];
      continue;
    }

    // 内联数组: [a, b, c]
    const inlineArrayMatch = value.match(/^\[(.*)\]$/);
    if (inlineArrayMatch) {
      raw[key] = inlineArrayMatch[1]!
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      continue;
    }

    // 简单值（去引号）
    raw[key] = value.replace(/^["']|["']$/g, '');
  }

  // 保存最后一个列表
  if (currentKey && currentList) {
    raw[currentKey] = currentList;
  }

  // 提取已知字段
  if (typeof raw.description === 'string') {
    meta.description = raw.description;
  }
  if (Array.isArray(raw.resources)) {
    meta.resources = raw.resources as string[];
  }
  if (Array.isArray(raw.tags)) {
    meta.tags = raw.tags as string[];
  }

  meta.raw = raw;

  // 如果 frontmatter 没有 description，尝试从正文第一个标题提取
  if (!meta.description) {
    const bodyStart = content.indexOf('---', 3);
    if (bodyStart !== -1) {
      const body = content.slice(bodyStart + 3);
      meta.description = extractFirstHeading(body);
    }
  }

  return meta;
}

/**
 * 从 .md 文件中读取描述。
 * 优先级: frontmatter.description > 第一个 # 标题文本。
 */
export async function readCommandDescription(mdFilePath: string): Promise<string | undefined> {
  const meta = await parseCommandMeta(mdFilePath);
  return meta.description;
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * 从 Markdown 内容中提取第一个标题文本。
 */
function extractFirstHeading(content: string): string | undefined {
  for (const line of content.split('\n')) {
    const headingMatch = line.match(/^#+\s+(.+)$/);
    if (headingMatch) {
      return headingMatch[1]!.trim().slice(0, 120);
    }
  }
  return undefined;
}
