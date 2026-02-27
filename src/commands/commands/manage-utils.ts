import path from 'node:path';
import {
  filterCommandAdapters,
  getColoredLabel,
  getAdapters,
  type TargetAdapter,
  type Scope,
} from '../../targets/adapters.js';
import { pathExists } from '../../util/fs-utils.js';
import { resolveTargetContext } from '../../util/scope.js';
import { detectTargetCommands } from '../../util/command-transform.js';
import type { ConfigV1 } from '../../core/config.js';

// ─── Target command browsing ────────────────────────────────────────────

export type TargetCommand = {
  name: string;
  /** .md 文件路径 */
  mdPath: string;
  /** 同名资源目录路径（如果存在） */
  resourceDirPath?: string;
  adapterId: string;
  adapterLabel: string;
  scope: Scope;
  projectRoot?: string;
};

/**
 * 收集指定适配器和 scope 下的所有目标命令。
 * 扫描 target commands 目录中的 .md 文件。
 */
export async function gatherTargetCommands(params: {
  adapters: TargetAdapter[];
  config: ConfigV1;
  scopeFlag?: string;
  cwdFlag?: string;
  currentCwd: string;
}): Promise<TargetCommand[]> {
  const { adapters, config, scopeFlag, cwdFlag, currentCwd } = params;
  const allCommands: TargetCommand[] = [];

  for (const adapter of adapters) {
    const targetConfig = config.targets[adapter.id];

    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag,
      cwdFlag,
      defaultScope: targetConfig?.defaultScope,
      currentCwd,
    });

    const commandsDir = adapter.resolveCommandsDir({ scope, projectRoot, homeDir });
    const entries = await detectTargetCommands(commandsDir);

    for (const entry of entries) {
      allCommands.push({
        name: entry.name,
        mdPath: entry.mdPath,
        resourceDirPath: entry.resourceDirPath,
        adapterId: adapter.id,
        adapterLabel: getColoredLabel(adapter),
        scope,
        projectRoot: scope === 'local' ? projectRoot : undefined,
      });
    }
  }

  return allCommands;
}

// ─── Cascade deletion scanning ──────────────────────────────────────────

export type SyncedCommandCopy = {
  commandName: string;
  /** .md 文件路径 */
  mdPath: string;
  /** 同名资源目录路径 */
  resourceDirPath?: string;
  adapterId: string;
  adapterLabel: string;
  scope: Scope;
  projectRoot?: string;
};

/**
 * 扫描所有目标工具，找出指定命令的已同步副本。
 */
export async function findSyncedCommandCopies(params: {
  commandNames: string[];
  config: ConfigV1;
  currentCwd: string;
}): Promise<SyncedCommandCopy[]> {
  const { commandNames, config, currentCwd } = params;
  const adapters = filterCommandAdapters(getAdapters());
  const copies: SyncedCommandCopy[] = [];

  for (const adapter of adapters) {
    const targetConfig = config.targets[adapter.id];

    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      defaultScope: targetConfig?.defaultScope ?? 'global',
      currentCwd,
    });

    const commandsDir = adapter.resolveCommandsDir({ scope, projectRoot, homeDir });

    for (const name of commandNames) {
      const mdPath = path.join(commandsDir, `${name}.md`);
      if (await pathExists(mdPath)) {
        const resourceDirPath = path.join(commandsDir, name);
        const hasResourceDir = await pathExists(resourceDirPath);
        copies.push({
          commandName: name,
          mdPath,
          resourceDirPath: hasResourceDir ? resourceDirPath : undefined,
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
