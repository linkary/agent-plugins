import path from 'node:path';
import type { ResolveParams, TargetAdapter } from '../adapter-base.js';

/** 标准 dot-dir 目录解析:global → ~/<dot>/<kind>,local → <proj>/<dot>/<kind>。 */
export function dotDirKind(dot: string, kind: string): (params: ResolveParams) => string {
  return ({ scope, projectRoot, homeDir }) =>
    scope === 'global' ? path.join(homeDir, dot, kind) : path.join(projectRoot, dot, kind);
}

/** 生成 skills / agents / commands 三个标准解析器(rules 因工具差异较大,单独提供)。 */
export function dotDir(dot: string): Pick<TargetAdapter, 'resolveSkillsDir' | 'resolveAgentsDir' | 'resolveCommandsDir'> {
  return {
    resolveSkillsDir: dotDirKind(dot, 'skills'),
    resolveAgentsDir: dotDirKind(dot, 'agents'),
    resolveCommandsDir: dotDirKind(dot, 'commands'),
  };
}

/** dot-dir 下的 rules:local 用目录,global 另有机制(SQLite/单文件),返回 ''。 */
export function dotRulesLocalOnly(dot: string): (params: ResolveParams) => string {
  return ({ scope, projectRoot }) => (scope === 'global' ? '' : path.join(projectRoot, dot, 'rules'));
}

/** dot-dir 下的 rules:local 与 global 都用目录。 */
export function dotRules(dot: string): (params: ResolveParams) => string {
  return dotDirKind(dot, 'rules');
}
