import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { loadRegistry, saveRegistry, normalizeRepoUrl } from '../../core/registry.js';
import {
  getCentralCommandFile,
  getCentralCommandDir,
  detectCommandForm,
  findEntryMd,
} from '../../core/command-store.js';
import { getCentralCommandsDir } from '../../util/apg-paths.js';
import { ensureDir, pathExists, removeDir } from '../../util/fs-utils.js';
import { copyDir } from '../../util/copy-dir.js';
import { computeCommandHash, copyItem, removeItem } from '../../util/item-utils.js';
import { promptMultiSelect } from '../../util/prompt.js';
import { runGit } from '../../util/git-utils.js';
import { ANSI } from '../../util/ansi.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';
import { parseCommandMeta } from '../../util/command-meta.js';

// ─── 扫描源目录中的命令 ────────────────────────────────────────────────────

type ScannedCommand =
  | { name: string; form: 'directory'; srcDir: string }
  | { name: string; form: 'file'; mdPath: string; resourceDirPath?: string };

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

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dirPath = path.join(searchDir, entry.name);
    const entryMd = await findEntryMd(dirPath, entry.name);
    if (entryMd) {
      dirCommandNames.add(entry.name);
      result.push({ name: entry.name, form: 'directory', srcDir: dirPath });
    }
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const name = entry.name.slice(0, -3);
    if (!name) continue;
    if (dirCommandNames.has(name)) continue;

    const mdPath = path.join(searchDir, entry.name);
    const resourceDirPath = dirNames.has(name) ? path.join(searchDir, name) : undefined;
    result.push({ name, form: 'file', mdPath, resourceDirPath });
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

// ─── 比较命令状态（基于命令完整 hash）────────────────────────────────────────

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

  const centralRoot = getCentralCommandsDir();
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

export async function cmdCommandsUpdate(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const all = flags.all === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  const registry = await loadRegistry();

  if (positionals.length > 0) {
    return await updateSpecificCommands(positionals, registry, dryRun, force);
  }

  const repos = registry.commandRepos ?? {};
  const repoKeys = Object.keys(repos);

  if (repoKeys.length === 0) {
    process.stdout.write('(no command repos tracked - use "ap commands add <repo>" to add commands from GitHub)\n');
    return 0;
  }
  const activeRepoKeys = repoKeys.filter((repoKey) =>
    repos[repoKey]!.skills.some((commandName) => isCurrentCommandRepoSource(registry, commandName, repoKey)),
  );

  if (activeRepoKeys.length === 0) {
    process.stdout.write('All commands up-to-date.\n');
    return 0;
  }

  let totalUpdated = 0;
  const tempDirs: string[] = [];

  type PendingUpdate = {
    commandName: string;
    srcMdPath: string;
    srcForm: 'directory' | 'file';
    srcDir?: string;
    srcResourceDir?: string;
    repoKey: string;
    status: 'update' | 'identical' | 'missing';
    repoUrl: string;
  };

  const allUpdates: PendingUpdate[] = [];

  try {
    process.stdout.write(`Checking ${activeRepoKeys.length} repo(s)...\n`);

    for (const repoKey of activeRepoKeys) {
      const repo = repos[repoKey]!;
      const tmpDir = path.join(os.tmpdir(), `apd-cmd-update-${Math.random().toString(36).slice(2, 8)}`);
      tempDirs.push(tmpDir);
      await ensureDir(tmpDir);
      const cloneDest = path.join(tmpDir, 'repo');

      const code = await runGit(['clone', '--depth', '1', repo.url, cloneDest], { stdio: 'ignore' });
      if (code !== 0) {
        process.stderr.write(`${ANSI.red}Failed to clone ${repo.url}${ANSI.reset}\n`);
        continue;
      }

      if (repo.ref) {
        await runGit(['-C', cloneDest, 'fetch', '--depth', '1', 'origin', repo.ref], { stdio: 'ignore' });
        await runGit(['-C', cloneDest, 'checkout', repo.ref], { stdio: 'ignore' });
      }

      let searchDir = cloneDest;
      const commandsSubdir = path.join(cloneDest, 'commands');
      if (await pathExists(commandsSubdir)) {
        const stat = await fs.stat(commandsSubdir);
        if (stat.isDirectory()) searchDir = commandsSubdir;
      }

      const scanned = await scanCommandsInDir(searchDir);
      const scannedMap = new Map(scanned.map((c) => [c.name, c]));

      const commandNames = repo.skills.filter((commandName) => isCurrentCommandRepoSource(registry, commandName, repoKey));
      for (const commandName of commandNames) {
        const scannedCmd = scannedMap.get(commandName);
        if (!scannedCmd) {
          allUpdates.push({
            commandName,
            srcMdPath: '',
            srcForm: 'file',
            repoKey,
            status: 'missing',
            repoUrl: repo.url,
          });
          continue;
        }

        const centralForm = await detectCommandForm(commandName);
        const status = await compareCommandStatus(scannedCmd, searchDir, centralForm);
        const srcMdPath =
          scannedCmd.form === 'directory' ? (await findEntryMd(scannedCmd.srcDir, scannedCmd.name))! : scannedCmd.mdPath;

        allUpdates.push({
          commandName,
          srcMdPath,
          srcForm: scannedCmd.form,
          srcDir: scannedCmd.form === 'directory' ? scannedCmd.srcDir : undefined,
          srcResourceDir: scannedCmd.form === 'file' ? scannedCmd.resourceDirPath : undefined,
          repoKey,
          status: status === 'new' ? 'update' : status as 'update' | 'identical',
          repoUrl: repo.url,
        });
      }
    }

    const updatesAvailable = allUpdates.filter((u) => u.status === 'update');
    const identicalCount = allUpdates.filter((u) => u.status === 'identical').length;
    const missingCount = allUpdates.filter((u) => u.status === 'missing').length;

    process.stdout.write(
      `Found ${allUpdates.length} scanned: ${ANSI.yellow}${updatesAvailable.length} update${ANSI.reset}, ${ANSI.dim}${identicalCount} identical${ANSI.reset}` +
        (missingCount > 0 ? `, ${ANSI.red}${missingCount} missing${ANSI.reset}` : '') +
        '\n',
    );

    if (updatesAvailable.length === 0) {
      process.stdout.write('All commands up-to-date.\n');
      return 0;
    }

    let toUpdate: PendingUpdate[] = [];
    if (interactive && !all) {
      const selectedIndices = await promptMultiSelect({
        message: 'Select commands to update:',
        options: updatesAvailable.map((u, i) => ({
          label: `${u.commandName} (${ANSI.dim}${u.repoUrl}${ANSI.reset})`,
          value: String(i),
        })),
        defaultSelected: 'all',
      });
      if (selectedIndices.length === 0) {
        process.stdout.write('Skipped.\n');
        return 0;
      }
      toUpdate = selectedIndices.map((i) => updatesAvailable[Number(i)]!);
    } else {
      toUpdate = updatesAvailable;
    }

    const affectedRepos = new Set<string>();

    for (const update of toUpdate) {
      const { commandName, srcForm, srcDir, srcMdPath, srcResourceDir, repoKey } = update;

      if (dryRun) {
        process.stdout.write(`[dry-run] update ${commandName}\n`);
        totalUpdated++;
        continue;
      }

      if (srcForm === 'directory' && srcDir) {
        const destDir = getCentralCommandDir(commandName);
        await removeDir(destDir);
        await copyDir(srcDir, destDir, { ignoreNames: ['.git'] });
      } else {
        const destFilePath = getCentralCommandFile(commandName);
        const destResourcePath = getCentralCommandDir(commandName);
        await removeItem(destFilePath);
        if (await pathExists(destResourcePath)) await removeDir(destResourcePath);
        await copyItem(srcMdPath, destFilePath);
        if (srcResourceDir && (await pathExists(srcResourceDir))) {
          await copyDir(srcResourceDir, destResourcePath, { ignoreNames: ['.git'] });
        }
      }

      if (registry.commands?.[commandName]) {
        registry.commands[commandName]!.updatedAt = new Date().toISOString();
      }
      affectedRepos.add(repoKey);
      process.stdout.write(`${ANSI.green}Updated: ${commandName}${ANSI.reset}\n`);
      totalUpdated++;
    }

    for (const key of affectedRepos) {
      if (registry.commandRepos?.[key]) {
        registry.commandRepos[key]!.updatedAt = new Date().toISOString();
      }
    }
  } finally {
    for (const dir of tempDirs) {
      await removeDir(dir);
    }
  }

  if (!dryRun && totalUpdated > 0) await saveRegistry(registry);
  process.stdout.write(`\n${totalUpdated} command(s) updated.\n`);
  return 0;
}

function isCurrentCommandRepoSource(
  registry: Awaited<ReturnType<typeof loadRegistry>>,
  commandName: string,
  repoKey: string,
): boolean {
  const record = registry.commands?.[commandName];
  return Boolean(record?.source.type === 'git' && normalizeRepoUrl(record.source.url) === repoKey);
}

async function updateSpecificCommands(
  commandNames: string[],
  registry: Awaited<ReturnType<typeof loadRegistry>>,
  dryRun: boolean,
  force: boolean,
): Promise<number> {
  let updated = 0;

  for (const name of commandNames) {
    const record = registry.commands?.[name];
    const form = await detectCommandForm(name);

    if (!form) {
      process.stderr.write(`Missing command: ${name}\n`);
      continue;
    }

    if (!record) {
      process.stderr.write(`No registry entry for: ${name}\n`);
      continue;
    }

    if (record.source.type === 'local') {
      const srcPath = record.source.path;
      if (!(await pathExists(srcPath))) {
        process.stderr.write(`Local source missing: ${srcPath}\n`);
        continue;
      }
      if (!force) {
        process.stderr.write(`Use --force to overwrite local command: ${name}\n`);
        continue;
      }
      if (dryRun) {
        process.stdout.write(`[dry-run] update ${name}\n`);
        updated++;
        continue;
      }

      const destDir = getCentralCommandDir(name);
      const destFile = getCentralCommandFile(name);

      if (record.form === 'directory') {
        await removeDir(destDir);
        await copyDir(srcPath, destDir, { ignoreNames: ['.git'] });
      } else {
        await removeItem(destFile);
        if (await pathExists(destDir)) await removeDir(destDir);
        await copyItem(srcPath, destFile);
        const resourceDir = path.join(path.dirname(srcPath), path.basename(srcPath, '.md'));
        if (await pathExists(resourceDir)) {
          const stat = await fs.stat(resourceDir);
          if (stat.isDirectory()) {
            await copyDir(resourceDir, destDir, { ignoreNames: ['.git'] });
          }
        }
      }
      record.updatedAt = new Date().toISOString();
      updated++;
      process.stdout.write(`Updated: ${name}\n`);
      continue;
    }

    if (record.source.type === 'git') {
      const repoKey = normalizeRepoUrl(record.source.url);
      const repo = registry.commandRepos?.[repoKey];
      if (!repo) {
        process.stderr.write(`Repo not tracked: ${record.source.url} (re-add with "ap commands add ${record.source.url}")\n`);
        continue;
      }
      process.stdout.write(`Run "ap commands update" without args to update from repos.\n`);
      continue;
    }

    process.stderr.write(`Cannot update collected command: ${name}\n`);
  }

  if (!dryRun) await saveRegistry(registry);
  return updated > 0 ? 0 : 1;
}
