import path from 'node:path';
import { getCentralSkillsDir } from '../util/apg-paths.js';
import { ensureDir, listDirNames } from '../util/fs-utils.js';

export async function ensureCentralStore(): Promise<void> {
  await ensureDir(getCentralSkillsDir());
}

export function getCentralSkillPath(skillName: string): string {
  return path.join(getCentralSkillsDir(), skillName);
}

export async function listCentralSkills(): Promise<string[]> {
  await ensureCentralStore();
  return await listDirNames(getCentralSkillsDir());
}
