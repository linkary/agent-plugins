import path from 'node:path';
import fs from 'node:fs/promises';

export async function readAgentDescription(agentPath: string): Promise<string | undefined> {
  const extract = (content: string): string | undefined => {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1]!;
      const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
      if (descMatch) {
        return descMatch[1]!.trim().replace(/^["']|["']$/g, '');
      }
    }

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
        return trimmed.slice(0, 80) + (trimmed.length > 80 ? '...' : '');
      }
    }
    return undefined;
  };

  try {
    const stat = await fs.stat(agentPath);
    if (stat.isFile()) {
      const content = await fs.readFile(agentPath, 'utf-8');
      return extract(content);
    }
  } catch {
    return undefined;
  }

  for (const filename of ['AGENT.md', 'SKILL.md']) {
    try {
      const content = await fs.readFile(path.join(agentPath, filename), 'utf-8');
      const desc = extract(content);
      if (desc) return desc;
    } catch {
      // try next candidate
    }
  }

  return undefined;
}
