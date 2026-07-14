import path from 'node:path';
import type { DetectContext, InstallEvidence } from '../adapter-base.js';

/** Windows 下 %LOCALAPPDATA%\Programs\... 安装路径。 */
export function winProgramsPath(ctx: DetectContext, ...segments: string[]): string {
  const base = ctx.env.LOCALAPPDATA || path.join(ctx.homeDir, 'AppData', 'Local');
  return path.join(base, 'Programs', ...segments);
}

/** ~/Applications/<app>(macOS 用户级应用目录)。 */
export function homeApp(ctx: DetectContext, appName: string): string {
  return path.join(ctx.homeDir, 'Applications', appName);
}

type DetectFn = (ctx: DetectContext) => InstallEvidence[];

/**
 * CLI 工具:以 PATH 上可解析的可执行文件为准。
 * extraBinPaths 用于安装器放置的实际二进制(如 ~/.claude/bin/claude);
 * 不要传入数据/配置/auth 路径(卸载后残留)。
 */
export function cliBin(name: string, ...extraBinPaths: Array<(ctx: DetectContext) => string>): DetectFn {
  return (ctx) => [
    { kind: 'bin', name },
    ...extraBinPaths.map((resolve) => ({ kind: 'path' as const, path: resolve(ctx) })),
  ];
}

/**
 * GUI IDE:仅以应用本体为准(应用包 / 安装目录)。数据目录、dotfiles、CLI shim 卸载后会残留,不作为依据。
 * - darwin: /Applications 与 ~/Applications 下列出的 .app
 * - win32:  %LOCALAPPDATA%\Programs 下的可执行文件
 * - 其他:   回退到 PATH 上的可执行文件名(linuxBin)
 * cliBin:若该产品另有独立 CLI(如 Antigravity 的 `agy`),各平台都一并检测。
 */
export function guiApp(opts: {
  macApps?: string[];
  winExe?: string[];
  linuxBin?: string;
  cliBin?: string;
}): DetectFn {
  return (ctx) => {
    const ev: InstallEvidence[] = [];
    if (opts.cliBin) ev.push({ kind: 'bin', name: opts.cliBin });
    switch (ctx.platform) {
      case 'darwin':
        for (const app of opts.macApps ?? []) {
          ev.push({ kind: 'path', path: `/Applications/${app}` });
          ev.push({ kind: 'path', path: homeApp(ctx, app) });
        }
        break;
      case 'win32':
        if (opts.winExe) ev.push({ kind: 'path', path: winProgramsPath(ctx, ...opts.winExe) });
        break;
      default:
        if (opts.linuxBin) ev.push({ kind: 'bin', name: opts.linuxBin });
    }
    return ev;
  };
}
