import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {
  ensureCentralCommandStore,
  getCentralCommandFile,
  getCentralCommandDir,
  detectCommandForm,
  findEntryMd,
} from '../../core/command-store.js';
import { loadRegistry, saveRegistry, normalizeRepoUrl } from '../../core/registry.js';
import { pathExists, removeDir, ensureDir, listDirNames } from '../../util/fs-utils.js';
import { copyDir } from '../../util/copy-dir.js';
import { computeCommandHash, copyItem } from '../../util/item-utils.js';
import { promptChoice, promptMultiSelect } from '../../util/prompt.js';
import {
  isProbablyGitUrl,
  isGitHubShorthand,
  expandGitHubShorthand,
  guessNameFromGitUrl,
  runGit,
} from '../../util/git-utils.js';
import { getApgHomeDir } from '../../util/apg-paths.js';
import {
  classifySourceConflict,
  removeGitSourceTracking,
  sourceLabel,
  suggestAliasName,
  uniqueAliasName,
} from '../../util/source-conflict.js';
import { parseCommandMeta } from '../../util/command-meta.js';
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
    const destFileExists = await pathExists(destFilePath);
    if ((destExists || destFileExists) && !force) {
      process.stderr.write(`Command already exists: ${cmd.name} (use --force to overwrite)\n`);
      return false;
    }
    if (dryRun) {
      process.stdout.write(`[dry-run] add ${cmd.name} (dir) -> ${destDirPath}\n`);
      return true;
    }
    if (destExists) await removeDir(destDirPath);
    if (destFileExists) await fs.rm(destFilePath, { force: true });
    await copyDir(cmd.srcDir, destDirPath, { ignoreNames: ['.git'] });
    return true;
  }

  // file-form
  const mdExists = await pathExists(destFilePath);
  const resourceDestPath = path.join(destRoot, cmd.name);
  const resourceExists = await pathExists(resourceDestPath);

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

function renameCommand(cmd: ScannedCommand, name: string): ScannedCommand {
  return cmd.form === 'directory'
    ? { ...cmd, name }
    : { ...cmd, name };
}

type CompareStatus = 'identical' | 'new' | 'update' | 'missing';

function mergeResourceRefs(...lists: (string[] | undefined)[]): string[] | undefined {
  const merged = new Set<string>();
  for (const list of lists) {
    if (!list) continue;
    for (const item of list) {
      if (item.trim()) merged.add(item.trim());
    }
  }
  return merged.size > 0 ? [...merged] : undefined;
}

async function computeFileCommandStateHash(params: {
  commandName: string;
  commandsDir: string;
  mdPath: string;
  includeImplicitResourceDir: boolean;
}): Promise<string> {
  const { commandName, commandsDir, mdPath, includeImplicitResourceDir } = params;
  const meta = await parseCommandMeta(mdPath);
  const sharedResources = mergeResourceRefs(meta.resources, includeImplicitResourceDir ? [commandName] : undefined);

  return await computeCommandHash({
    commandName,
    commandsDir,
    form: 'file',
    sharedResources,
  });
}

async function compareCommandStatus(
  scanned: ScannedCommand,
  commandsDir: string,
  centralForm: 'directory' | 'file' | null,
): Promise<CompareStatus> {
  const name = scanned.name;
  if (!centralForm) return 'new';

  const srcHash =
    scanned.form === 'directory'
      ? await computeCommandHash({ commandName: name, commandsDir, form: 'directory' })
      : await computeFileCommandStateHash({
          commandName: name,
          commandsDir,
          mdPath: scanned.mdPath,
          includeImplicitResourceDir: Boolean(scanned.resourceDirPath),
        });

  const centralRoot = path.join(getApgHomeDir(), 'commands');
  const destHash =
    centralForm === 'directory'
      ? await computeCommandHash({ commandName: name, commandsDir: centralRoot, form: 'directory' })
      : await computeFileCommandStateHash({
          commandName: name,
          commandsDir: centralRoot,
          mdPath: getCentralCommandFile(name),
          includeImplicitResourceDir: await pathExists(path.join(centralRoot, name)),
        });

  if (srcHash === destHash) return 'identical';
  return 'update';
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
      const incomingSource = { type: 'git' as const, url: source, ref: refFlag };

      for (const cmd of toCopy) {
        let targetCmd = cmd;
        const existingRecord = registry.commands?.[targetCmd.name];
        const centralForm = await detectCommandForm(targetCmd.name);
        const rawContentStatus = await compareCommandStatus(cmd, searchDir, centralForm);
        const contentStatus = rawContentStatus === 'missing' ? 'update' : rawContentStatus;
        const conflictStatus = classifySourceConflict({
          existingSource: existingRecord?.source,
          incomingSource,
          contentStatus,
        });

        if (conflictStatus === 'identical') {
          process.stdout.write(`Up-to-date: ${targetCmd.name}\n`);
          continue;
        }

        if (conflictStatus === 'different-source conflict' && !force) {
          if (interactive) {
            const action = await promptChoice({
              message: `Command "${targetCmd.name}" already exists from ${sourceLabel(existingRecord?.source)}. Incoming source: ${sourceLabel(incomingSource)}.`,
              options: [
                { key: 's', label: 'Skip' },
                { key: 'r', label: 'Replace existing' },
                { key: 'a', label: `Install as alias (${suggestAliasName(targetCmd.name, incomingSource)})` },
              ],
            });
            if (action === 's') {
              process.stdout.write(`Skipped: ${targetCmd.name}\n`);
              continue;
            }
            if (action === 'a') {
              const alias = await uniqueAliasName(suggestAliasName(targetCmd.name, incomingSource), async (candidate) =>
                (await detectCommandForm(candidate)) !== null,
              );
              targetCmd = renameCommand(targetCmd, alias);
            }
          } else {
            process.stderr.write(
              `Command already exists from a different source: ${targetCmd.name} (${sourceLabel(existingRecord?.source)}). Use --force to replace or --name <alias> for a single-command source.\n`,
            );
            continue;
          }
        }

        if (targetCmd.name === cmd.name && (conflictStatus === 'same-source update' || force || interactive)) {
          removeGitSourceTracking({ registry, kind: 'commands', name: targetCmd.name, source: existingRecord?.source });
        }

        const ok = await copyCommandToCentral(targetCmd, centralDir, dryRun, true);
        if (!ok) continue;

        if (dryRun) continue;

        const form = targetCmd.form;
        registry.commands[targetCmd.name] = {
          name: targetCmd.name,
          form,
          addedAt: registry.commands[targetCmd.name]?.addedAt ?? now,
          updatedAt: now,
          source: incomingSource,
        };
        addedCommandNames.push(targetCmd.name);
        process.stdout.write(`Added: ${targetCmd.name}\n`);
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
    let targetName = resolvedName;
    const resourceDirPath = path.join(path.dirname(srcPath), baseName);
    const hasResourceDir = (await pathExists(resourceDirPath)) && (await fs.stat(resourceDirPath)).isDirectory();

    const centralDir = getApgHomeDir();
    const destRoot = path.join(centralDir, 'commands');
    let destFilePath = path.join(destRoot, `${targetName}.md`);
    let destExists = await pathExists(destFilePath);
    const registry = await loadRegistry();
    if (!registry.commands) registry.commands = {};
    const incomingSource = { type: 'local' as const, path: srcPath };
    const existingRecord = registry.commands[targetName];
    let centralForm = await detectCommandForm(targetName);
    const scannedCommand: ScannedCommand = {
      name: targetName,
      form: 'file',
      mdPath: srcPath,
      resourceDirPath: hasResourceDir ? resourceDirPath : undefined,
    };

    if (centralForm) {
      const rawContentStatus = await compareCommandStatus(scannedCommand, path.dirname(srcPath), centralForm);
      const contentStatus = rawContentStatus === 'missing' ? 'update' : rawContentStatus;
      const conflictStatus = classifySourceConflict({
        existingSource: existingRecord?.source,
        incomingSource,
        contentStatus,
      });
      if (conflictStatus === 'identical') {
        process.stdout.write(`Up-to-date: ${targetName}\n`);
        return 0;
      }
      if (conflictStatus === 'different-source conflict' && !force) {
        if (interactive) {
          const action = await promptChoice({
            message: `Command "${targetName}" already exists from ${sourceLabel(existingRecord?.source)}. Incoming source: ${sourceLabel(incomingSource)}.`,
            options: [
              { key: 's', label: 'Skip' },
              { key: 'r', label: 'Replace existing' },
              { key: 'a', label: `Install as alias (${suggestAliasName(targetName, incomingSource)})` },
            ],
          });
          if (action === 's') {
            process.stdout.write(`Skipped: ${targetName}\n`);
            return 0;
          }
          if (action === 'a') {
            targetName = await uniqueAliasName(suggestAliasName(targetName, incomingSource), async (candidate) =>
              (await detectCommandForm(candidate)) !== null,
            );
            destFilePath = path.join(destRoot, `${targetName}.md`);
            destExists = false;
            centralForm = null;
          }
        } else {
          process.stderr.write(
            `Command already exists from a different source: ${targetName} (${sourceLabel(existingRecord?.source)}). Use --force to replace or --name <alias>.\n`,
          );
          return 1;
        }
      } else if (!force && conflictStatus !== 'same-source update') {
        process.stderr.write(`Command already exists: ${targetName}\nUse --force to overwrite.\n`);
        return 1;
      }
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] add ${targetName} (file) -> ${destFilePath}\n`);
      return 0;
    }

    await ensureDir(destRoot);
    if (destExists || centralForm) {
      removeGitSourceTracking({ registry, kind: 'commands', name: targetName, source: existingRecord?.source });
      if (centralForm === 'directory') {
        await removeDir(getCentralCommandDir(targetName));
      } else {
        await fs.rm(destFilePath, { force: true });
      }
    }
    await copyItem(srcPath, destFilePath);

    if (hasResourceDir) {
      const resourceDestPath = path.join(destRoot, targetName);
      if (await pathExists(resourceDestPath)) await removeDir(resourceDestPath);
      await copyDir(resourceDirPath, resourceDestPath, { ignoreNames: ['.git'] });
    }

    const now = new Date().toISOString();
    registry.commands[targetName] = {
      name: targetName,
      form: 'file',
      addedAt: registry.commands[targetName]?.addedAt ?? now,
      updatedAt: now,
      source: incomingSource,
    };
    await saveRegistry(registry);
    process.stdout.write(`Added local command: ${targetName}\n`);
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
    let targetCmd = cmd;
    const incomingSource = { type: 'local' as const, path: srcPath };
    const existingRecord = registry.commands[targetCmd.name];
    const centralForm = await detectCommandForm(targetCmd.name);
    const rawContentStatus = await compareCommandStatus(targetCmd, srcPath, centralForm);
    const contentStatus = rawContentStatus === 'missing' ? 'update' : rawContentStatus;
    const conflictStatus = classifySourceConflict({
      existingSource: existingRecord?.source,
      incomingSource,
      contentStatus,
    });

    if (conflictStatus === 'identical') {
      process.stdout.write(`Up-to-date: ${targetCmd.name}\n`);
      continue;
    }

    if (conflictStatus === 'different-source conflict' && !force) {
      if (interactive) {
        const action = await promptChoice({
          message: `Command "${targetCmd.name}" already exists from ${sourceLabel(existingRecord?.source)}. Incoming source: ${sourceLabel(incomingSource)}.`,
          options: [
            { key: 's', label: 'Skip' },
            { key: 'r', label: 'Replace existing' },
            { key: 'a', label: `Install as alias (${suggestAliasName(targetCmd.name, incomingSource)})` },
          ],
        });
        if (action === 's') {
          process.stdout.write(`Skipped: ${targetCmd.name}\n`);
          continue;
        }
        if (action === 'a') {
          const alias = await uniqueAliasName(suggestAliasName(targetCmd.name, incomingSource), async (candidate) =>
            (await detectCommandForm(candidate)) !== null,
          );
          targetCmd = renameCommand(targetCmd, alias);
        }
      } else {
        process.stderr.write(
          `Command already exists from a different source: ${targetCmd.name} (${sourceLabel(existingRecord?.source)}). Use --force to replace or --name <alias>.\n`,
        );
        continue;
      }
    }

    if (targetCmd.name === cmd.name && (conflictStatus === 'same-source update' || force || interactive)) {
      removeGitSourceTracking({ registry, kind: 'commands', name: targetCmd.name, source: existingRecord?.source });
    }

    const ok = await copyCommandToCentral(targetCmd, destRoot, dryRun, true);
    if (!ok) continue;

    if (dryRun) continue;

    registry.commands[targetCmd.name] = {
      name: targetCmd.name,
      form: targetCmd.form,
      addedAt: registry.commands[targetCmd.name]?.addedAt ?? now,
      updatedAt: now,
      source: incomingSource,
    };
    process.stdout.write(`Added local command: ${targetCmd.name}\n`);
  }

  await saveRegistry(registry);
  return 0;
}
