import path from 'node:path';
import { type Scope, type ResolveParams } from '../targets/adapters.js';
import { findProjectRoot } from './project-root.js';
import { getHomeDir } from './apg-paths.js';

/**
 * Resolves the scope based on CLI flags and target-specific configuration.
 * Priority: --scope flag > target-specific defaultScope > system default (global)
 */
export function resolveScope(scopeFlag: string | undefined, defaultScope: Scope | undefined): Scope {
  if (scopeFlag === 'global') return 'global';
  if (scopeFlag === 'local') return 'local';
  return defaultScope === 'local' ? 'local' : 'global';
}

/**
 * Common parameters for resolving sync/collect directories.
 */
export type ResolvedTargetContext = ResolveParams & {
  startCwd: string;
};

/**
 * Helper to prepare parameters needed for adapter.resolveSkillsDir
 */
export async function resolveTargetContext(params: {
  scopeFlag?: string;
  cwdFlag?: string;
  defaultScope?: Scope;
  currentCwd: string;
}): Promise<ResolvedTargetContext> {
  const { scopeFlag, cwdFlag, defaultScope, currentCwd } = params;

  const scope = resolveScope(scopeFlag, defaultScope);
  const startCwd = cwdFlag ? path.resolve(cwdFlag) : currentCwd;
  const homeDir = getHomeDir();
  const projectRoot = scope === 'local' ? await findProjectRoot(startCwd) : startCwd;

  return {
    scope,
    startCwd,
    homeDir,
    projectRoot,
  };
}
