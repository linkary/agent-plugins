/**
 * Skill comparison utilities for deduplication and similarity detection.
 * This module provides extensible methods to compare skills across different sources.
 */

import { computeDirHash } from './hash-dir.js';
import { pathExists } from './fs-utils.js';

export type SkillCompareResult = {
  /** Whether the skills are considered the same (for deduplication) */
  isSame: boolean;
  /** Similarity score from 0 to 1 (1 = identical) */
  similarity: number;
};

/**
 * Compare two skills to determine if they are the same.
 * Currently compares by directory hash. Can be extended to use more sophisticated
 * comparison methods (e.g., comparing SKILL.md content, semantic analysis).
 *
 * @param srcDirA - Path to first skill directory
 * @param srcDirB - Path to second skill directory
 * @returns Comparison result with isSame flag and similarity score
 */
export async function compareSkills(srcDirA: string, srcDirB: string): Promise<SkillCompareResult> {
  const [existsA, existsB] = await Promise.all([pathExists(srcDirA), pathExists(srcDirB)]);

  if (!existsA || !existsB) {
    return { isSame: false, similarity: 0 };
  }

  const [hashA, hashB] = await Promise.all([
    computeDirHash(srcDirA, { ignoreNames: ['.git'] }),
    computeDirHash(srcDirB, { ignoreNames: ['.git'] }),
  ]);

  if (hashA === hashB) {
    return { isSame: true, similarity: 1 };
  }

  // TODO: Future enhancement - compute similarity based on file overlap, content diff, etc.
  // For now, different hash = not the same
  return { isSame: false, similarity: 0 };
}

/**
 * Check if a skill name matches between two entries.
 * This is the first-pass filter before doing expensive content comparison.
 */
export function skillNamesMatch(nameA: string, nameB: string): boolean {
  return nameA.toLowerCase() === nameB.toLowerCase();
}
