import path from 'node:path';
import { getColoredLabel, getAdapters, type TargetAdapter, type Scope } from '../../targets/adapters.js';
import { listDirNames, pathExists } from '../../util/fs-utils.js';
import { resolveTargetContext } from '../../util/scope.js';
import type { ConfigV1 } from '../../core/config.js';

// ─── Target skill browsing ─────────────────────────────────────────────

export type TargetSkill = {
  name: string;
  path: string;
  adapterId: string;
  adapterLabel: string;
  scope: Scope;
  projectRoot?: string;
};

/**
 * 收集指定适配器和 scope 下的所有目标 skill。
 */
export async function gatherTargetSkills(params: {
  adapters: TargetAdapter[];
  config: ConfigV1;
  scopeFlag?: string;
  cwdFlag?: string;
  currentCwd: string;
}): Promise<TargetSkill[]> {
  const { adapters, config, scopeFlag, cwdFlag, currentCwd } = params;
  const allSkills: TargetSkill[] = [];

  for (const adapter of adapters) {
    const targetConfig = config.targets[adapter.id];

    // 为每个适配器解析上下文
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag,
      cwdFlag,
      defaultScope: targetConfig?.defaultScope,
      currentCwd,
    });

    const skillsDir = adapter.resolveSkillsDir({ scope, projectRoot, homeDir });
    const skills = await listDirNames(skillsDir);

    for (const name of skills) {
      allSkills.push({
        name,
        path: path.join(skillsDir, name),
        adapterId: adapter.id,
        adapterLabel: getColoredLabel(adapter),
        scope,
        projectRoot: scope === 'local' ? projectRoot : undefined,
      });
    }
  }

  return allSkills;
}

// ─── Cascade deletion scanning ──────────────────────────────────────────

export type SyncedCopy = {
  skillName: string;
  path: string;
  adapterId: string;
  adapterLabel: string;
  scope: Scope;
  projectRoot?: string;
};

/**
 * 扫描所有目标工具，找出指定 skill 的已同步副本。
 * 通过文件系统检查（而非 sync-state），确保结果准确。
 */
export async function findSyncedCopies(params: {
  skillNames: string[];
  config: ConfigV1;
  currentCwd: string;
}): Promise<SyncedCopy[]> {
  const { skillNames, config, currentCwd } = params;
  const adapters = getAdapters();
  const copies: SyncedCopy[] = [];

  for (const adapter of adapters) {
    const targetConfig = config.targets[adapter.id];

    // 默认只检查 global scope（local scope 需要项目上下文，manage 通常在全局操作）
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      defaultScope: targetConfig?.defaultScope ?? 'global',
      currentCwd,
    });

    const skillsDir = adapter.resolveSkillsDir({ scope, projectRoot, homeDir });

    for (const name of skillNames) {
      const skillPath = path.join(skillsDir, name);
      if (await pathExists(skillPath)) {
        copies.push({
          skillName: name,
          path: skillPath,
          adapterId: adapter.id,
          adapterLabel: getColoredLabel(adapter),
          scope,
          projectRoot: scope === 'local' ? projectRoot : undefined,
        });
      }
    }
  }

  return copies;
}
