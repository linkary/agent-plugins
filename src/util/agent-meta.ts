import path from 'node:path';
import fs from 'node:fs/promises';

export async function readAgentDescription(agentPath: string): Promise<string | undefined> {
  const candidates = ['AGENT.md', 'SKILL.md'];

  for (const filename of candidates) {
    try {
      const content = await fs.readFile(path.join(agentPath, filename), 'utf-8');

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
    } catch {
      // try next candidate
    }
  }

  return undefined;
}
