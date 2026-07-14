import os from 'node:os';
import path from 'node:path';
import { pathExists } from '../util/fs-utils.js';
import type { DetectContext, TargetAdapter } from './adapters.js';

/** 检测依赖（可注入以便跨平台测试;默认使用真实环境与文件系统）。 */
export type InstalledDetectionDeps = {
  homeDir?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  exists?: (p: string) => Promise<boolean>;
  binOnPath?: (name: string) => Promise<boolean>;
};

function detectContext(deps: InstalledDetectionDeps): DetectContext {
  return {
    homeDir: deps.homeDir ?? os.homedir(),
    platform: deps.platform ?? process.platform,
    env: deps.env ?? process.env,
  };
}

/**
 * 构造「在 PATH 中查找可执行文件」的函数(跨平台):
 * Windows 依据 PATHEXT 追加扩展名(.EXE/.CMD/.BAT/...),其余平台按原名查找。
 */
export function makeBinOnPath(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  exists: (p: string) => Promise<boolean>,
): (name: string) => Promise<boolean> {
  const pathVar = env.PATH ?? env.Path ?? '';
  const sep = platform === 'win32' ? ';' : ':';
  const dirs = pathVar
    .split(sep)
    .map((d) => d.trim())
    .filter(Boolean);
  const exts =
    platform === 'win32'
      ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM')
          .split(';')
          .map((e) => e.trim())
          .filter(Boolean)
      : [''];
  return async (name: string): Promise<boolean> => {
    for (const dir of dirs) {
      for (const ext of exts) {
        if (await exists(path.join(dir, `${name}${ext}`))) return true;
      }
    }
    return false;
  };
}

/**
 * 判断单个目标工具是否已在本机安装:
 * - alwaysAvailable 的适配器(如 ~/.agents 约定)恒为 true;
 * - 未声明 detectInstall 的适配器视为不可检测,返回 false;
 * - 否则对其证据求 OR(path 存在 或 bin 在 PATH 中)。
 */
export async function isTargetInstalled(adapter: TargetAdapter, deps: InstalledDetectionDeps = {}): Promise<boolean> {
  if (adapter.alwaysAvailable) return true;
  if (!adapter.detectInstall) return false;

  const ctx = detectContext(deps);
  const exists = deps.exists ?? pathExists;
  const binOnPath = deps.binOnPath ?? makeBinOnPath(ctx.env, ctx.platform, exists);

  for (const evidence of adapter.detectInstall(ctx)) {
    if (evidence.kind === 'path') {
      if (await exists(evidence.path)) return true;
    } else if (await binOnPath(evidence.name)) {
      return true;
    }
  }
  return false;
}

/** 过滤出已安装(或始终可用)的目标工具,保持传入顺序;并行检测。 */
export async function filterInstalledAdapters(
  adapters: TargetAdapter[],
  deps: InstalledDetectionDeps = {},
): Promise<TargetAdapter[]> {
  const installedFlags = await Promise.all(adapters.map((adapter) => isTargetInstalled(adapter, deps)));
  return adapters.filter((_, index) => installedFlags[index]);
}

/**
 * 候选目标的来源:
 * - 'all-flag'       通过 --all-targets 显式要求列出全部
 * - 'installed'      已收窄为「已安装 / 始终可用」目标
 * - 'fallback-empty' 未检测到任何已安装目标,回退到全部
 */
export type CandidateSource = 'all-flag' | 'installed' | 'fallback-empty';

/**
 * 解析交互式选择应展示的候选目标:默认只保留已安装目标;
 * --all-targets 时返回全部;若一个都没检测到则回退为全部。
 * 供 selectTargetAdapters 与各 rm 交互式「Central + 目标」选择复用。
 */
export async function resolveCandidateAdapters(
  adapters: TargetAdapter[],
  opts: {
    allTargets: boolean;
    filterInstalled?: (adapters: TargetAdapter[]) => Promise<TargetAdapter[]>;
  },
): Promise<{ candidates: TargetAdapter[]; source: CandidateSource }> {
  if (opts.allTargets) return { candidates: adapters, source: 'all-flag' };
  const filter = opts.filterInstalled ?? filterInstalledAdapters;
  const installed = await filter(adapters);
  if (installed.length === 0) return { candidates: adapters, source: 'fallback-empty' };
  return { candidates: installed, source: 'installed' };
}
