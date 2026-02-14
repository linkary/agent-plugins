import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {
  ensureCentralCommandStore,
  getCentralCommandFile,
  getCentralCommandDir,
  findEntryMd,
} from '../../core/command-store.js';
import { loadRegistry, saveRegistry, normalizeRepoUrl } from '../../core/registry.js';
import { pathExists, removeDir, ensureDir, listDirNames } from '../../util/fs-utils.js';
import { copyDir } from '../../util/copy-dir.js';
import { copyItem } from '../../util/item-utils.js';
import { promptMultiSelect } from '../../util/prompt.js';
import {
  isProbablyGitUrl,
  isGitHubShorthand,
  expandGitHubShorthand,
  guessNameFromGitUrl,
  runGit,
} from '../../util/git-utils.js';
import { getApgHomeDir } from '../../util/apg-paths.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

// ─── 扫描源目录中的命令 ────────────────────────────────────────────────────

type ScannedCommand =
  | { name: string; form: 'directory'; srcDir: string }
  | { name: string; form: 'file'; mdPath: string; resourceDirPath?: string };

/**
 * 扫描目录中的命令。
 * - directory-form: 包含入口 .md 的子目录
 * - file-form: 顶级 .md 文件（及可选的同名资源目录）
 */
async function scanCommandsInDir(searchDir: string): Promise<ScannedCommand[]> {
  const result: ScannedCommand[] = [];
  const dirCommandNames = new Set<string>();

  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(searchDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const dirNames = new Set(entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name));

  // 先收集 directory-form
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dirPath = path.join(searchDir, entry.name);
    const entryMd = await findEntryMd(dirPath, entry.name);
    if (entryMd) {
      dirCommandNames.add(entry.name);
      result.push({ name: entry.name, form: 'directory', srcDir: dirPath });
    }
  }

  // 再收集 file-form（顶级 .md，排除已有 directory-form 同名的）
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const name = entry.name.slice(0, -3);
    if (!name) continue;
    if (dirCommandNames.has(name)) continue;

    const mdPath = path.join(searchDir, entry.name);
    const resourceDirPath = dirNames.has(name) ? path.join(searchDir, name) : undefined;
    // 同名目录若为 directory-form 已计入，此处必为资源目录
    result.push({ name, form: 'file', mdPath, resourceDirPath });
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

// ─── 复制命令到中央存储 ────────────────────────────────────────────────────

async function copyCommandToCentral(
  cmd: ScannedCommand,
  destRoot: string,
  dryRun: boolean,
  force: boolean,
): Promise<boolean> {
  const destDirPath = path.join(destRoot, cmd.name);
  const destFilePath = path.join(destRoot, `${cmd.name}.md`);

  if (cmd.form === 'directory') {
    const destExists = await pathExists(destDirPath);
    if (destExists && !force) {
      process.stderr.write(`Command already exists: ${cmd.name} (use --force to overwrite)\n`);
      return false;
    }
    if (dryRun) {
      process.stdout.write(`[dry-run] add ${cmd.name} (dir) -> ${destDirPath}\n`);
      return true;
    }
    if (destExists) await removeDir(destDirPath);
    await copyDir(cmd.srcDir, destDirPath, { ignoreNames: ['.git'] });
    return true;
  }

  // file-form
  const mdExists = await pathExists(destFilePath);
  const resourceDestPath = path.join(destRoot, cmd.name);
  const resourceExists = cmd.resourceDirPath && (await pathExists(resourceDestPath));

  if ((mdExists || resourceExists) && !force) {
    process.stderr.write(`Command already exists: ${cmd.name} (use --force to overwrite)\n`);
    return false;
  }
  if (dryRun) {
    process.stdout.write(`[dry-run] add ${cmd.name} (file) -> ${destFilePath}\n`);
    return true;
  }
  if (mdExists) await fs.rm(destFilePath, { force: true });
  if (resourceExists) await removeDir(resourceDestPath);

  await ensureDir(path.dirname(destFilePath));
  await copyItem(cmd.mdPath, destFilePath);
  if (cmd.resourceDirPath && (await pathExists(cmd.resourceDirPath))) {
    await copyDir(cmd.resourceDirPath, resourceDestPath, { ignoreNames: ['.git'] });
  }
  return true;
}

// ─── Entry point ───────────────────────────────────────────────────────────

export async function cmdCommandsAdd(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  let source = positionals[0];
  if (!source) {
    process.stderr.write('Usage: ap commands add <git-url|owner/repo|local-path> [--name <cmd>] [--ref <ref>] [--force]\n');
    return 1;
  }

  await ensureCentralCommandStore();

  const nameFlag = typeof flags.name === 'string' ? flags.name : undefined;
  const refFlag = typeof flags.ref === 'string' ? flags.ref : undefined;
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  // 展开 GitHub shorthand
  if (isGitHubShorthand(source)) {
    source = expandGitHubShorthand(source);
    process.stdout.write(`Expanded to: ${source}\n`);
  }

  // ── Git URL 处理 ──
  if (isProbablyGitUrl(source)) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apd-cmd-add-'));
    const cloneDest = path.join(tmpDir, 'repo');

    try {
      process.stdout.write(`Cloning ${source}...\n`);
      const code = await runGit(['clone', '--depth', '1', source, cloneDest], { cwd: undefined });
      if (code !== 0) {
        process.stderr.write('Git clone failed.\n');
        return code;
      }

      if (refFlag) {
        const fetchCode = await runGit(['-C', cloneDest, 'fetch', '--depth', '1', 'origin', refFlag], {
          cwd: undefined,
        });
        if (fetchCode === 0) {
          await runGit(['-C', cloneDest, 'checkout', refFlag], { cwd: undefined });
        }
      }

      // 查找 commands/ 子目录
      let searchDir = cloneDest;
      const commandsSubdir = path.join(cloneDest, 'commands');
      if (await pathExists(commandsSubdir)) {
        const stat = await fs.stat(commandsSubdir);
        if (stat.isDirectory()) {
          searchDir = commandsSubdir;
          process.stdout.write('Found commands/ directory, searching inside...\n');
        }
      }

      const commands = await scanCommandsInDir(searchDir);
      if (commands.length === 0) {
        process.stderr.write('No commands found in repository (no .md files in commands/ or root).\n');
        return 1;
      }

      let toCopy: ScannedCommand[];
      if (commands.length === 1 && !interactive) {
        toCopy = commands;
      } else if (interactive) {
        const selected = await promptMultiSelect({
          message: 'Select commands to add:',
          options: commands.map((c) => ({ label: c.name, value: c.name })),
          defaultSelected: 'all',
        });
        if (selected.length === 0) {
          process.stdout.write('Cancelled.\n');
          return 0;
        }
        toCopy = commands.filter((c) => selected.includes(c.name));
      } else {
        toCopy = commands;
      }

      const centralDir = path.join(getApgHomeDir(), 'commands');

      const registry = await loadRegistry();
      if (!registry.commands) registry.commands = {};
      if (!registry.commandRepos) registry.commandRepos = {};
      const now = new Date().toISOString();
      const addedCommandNames: string[] = [];

      for (const cmd of toCopy) {
        const ok = await copyCommandToCentral(cmd, centralDir, dryRun, force);
        if (!ok) continue;

        if (dryRun) continue;

        const form = cmd.form;
        registry.commands[cmd.name] = {
          name: cmd.name,
          form,
          addedAt: registry.commands[cmd.name]?.addedAt ?? now,
          updatedAt: now,
          source: { type: 'git', url: source, ref: refFlag },
        };
        addedCommandNames.push(cmd.name);
        process.stdout.write(`Added: ${cmd.name}\n`);
      }

      if (!dryRun && addedCommandNames.length > 0) {
        const repoKey = normalizeRepoUrl(source);
        const existingRepo = registry.commandRepos?.[repoKey];

        if (existingRepo) {
          const merged = new Set([...existingRepo.skills, ...addedCommandNames]);
          existingRepo.skills = [...merged];
          existingRepo.updatedAt = now;
          if (refFlag) existingRepo.ref = refFlag;
        } else {
          registry.commandRepos![repoKey] = {
            url: source,
            ref: refFlag,
            skills: addedCommandNames,
            addedAt: now,
            updatedAt: now,
          };
        }
        await saveRegistry(registry);
      }

      return 0;
    } finally {
      await removeDir(tmpDir);
    }
  }

  // ── 本地路径处理 ──
  const srcPath = path.resolve(source);
  if (!(await pathExists(srcPath))) {
    process.stderr.write(`Source path not found: ${srcPath}\n`);
    return 1;
  }

  const stat = await fs.stat(srcPath);

  // 单个 .md 文件
  if (stat.isFile()) {
    if (!srcPath.endsWith('.md')) {
      process.stderr.write(`Source must be a .md file: ${srcPath}\n`);
      return 1;
    }
    const baseName = path.basename(srcPath, '.md');
    const resolvedName = nameFlag ?? baseName;
    const resourceDirPath = path.join(path.dirname(srcPath), baseName);
    const hasResourceDir = (await pathExists(resourceDirPath)) && (await fs.stat(resourceDirPath)).isDirectory();

    const centralDir = getApgHomeDir();
    const destRoot = path.join(centralDir, 'commands');
    const destFilePath = path.join(destRoot, `${resolvedName}.md`);
    const destExists = await pathExists(destFilePath);

    if (destExists && !force) {
      process.stderr.write(`Command already exists: ${resolvedName}\nUse --force to overwrite.\n`);
      return 1;
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] add ${resolvedName} (file) -> ${destFilePath}\n`);
      return 0;
    }

    await ensureDir(destRoot);
    if (destExists) await fs.rm(destFilePath, { force: true });
    await copyItem(srcPath, destFilePath);

    if (hasResourceDir) {
      const resourceDestPath = path.join(destRoot, resolvedName);
      if (await pathExists(resourceDestPath)) await removeDir(resourceDestPath);
      await copyDir(resourceDirPath, resourceDestPath, { ignoreNames: ['.git'] });
    }

    const registry = await loadRegistry();
    if (!registry.commands) registry.commands = {};
    const now = new Date().toISOString();
    registry.commands[resolvedName] = {
      name: resolvedName,
      form: 'file',
      addedAt: registry.commands[resolvedName]?.addedAt ?? now,
      updatedAt: now,
      source: { type: 'local', path: srcPath },
    };
    await saveRegistry(registry);
    process.stdout.write(`Added local command: ${resolvedName}\n`);
    return 0;
  }

  // 本地目录
  const commands = await scanCommandsInDir(srcPath);
  if (commands.length === 0) {
    process.stderr.write('No commands found in directory (no .md files).\n');
    return 1;
  }

  const destRoot = path.join(getApgHomeDir(), 'commands');
  const registry = await loadRegistry();
  if (!registry.commands) registry.commands = {};
  const now = new Date().toISOString();

  let toCopy: ScannedCommand[];
  if (commands.length === 1 && !interactive) {
    toCopy = commands;
  } else if (interactive) {
    const selected = await promptMultiSelect({
      message: 'Select commands to add:',
      options: commands.map((c) => ({ label: c.name, value: c.name })),
      defaultSelected: 'all',
    });
    if (selected.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
    toCopy = commands.filter((c) => selected.includes(c.name));
  } else {
    toCopy = commands;
  }

  for (const cmd of toCopy) {
    const ok = await copyCommandToCentral(cmd, destRoot, dryRun, force);
    if (!ok) continue;

    if (dryRun) continue;

    registry.commands[cmd.name] = {
      name: cmd.name,
      form: cmd.form,
      addedAt: registry.commands[cmd.name]?.addedAt ?? now,
      updatedAt: now,
      source: { type: 'local', path: srcPath },
    };
    process.stdout.write(`Added local command: ${cmd.name}\n`);
  }

  await saveRegistry(registry);
  return 0;
}
