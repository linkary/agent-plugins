/**
 * 命令收集：从目标 (flat-form) 收集到中央存储 (directory/file-form)。
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { loadConfig } from '../../core/config.js';
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import {
  ensureCentralCommandStore,
  getCentralCommandDir,
  getCentralCommandFile,
  detectCommandForm,
} from '../../core/command-store.js';
import { getCentralCommandsDir } from '../../util/apg-paths.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import {
  type Scope,
  filterCommandAdapters,
  getAdapters,
  getColoredLabel,
  type TargetAdapter,
} from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { ANSI } from '../../util/ansi.js';
import { resolveTargetContext } from '../../util/scope.js';
import { ensureDir, pathExists, removeDirContents } from '../../util/fs-utils.js';
import { computeCommandHash } from '../../util/item-utils.js';
import { detectTargetCommands, collectToDirectory, collectToFile } from '../../util/command-transform.js';
import { copyDir } from '../../util/copy-dir.js';
import type { ParsedFlags } from '../../util/options.js';
import { promptChoice, promptConfirm, promptMultiSelect } from '../../util/prompt.js';
import type { CliRunContext } from '../../runner/cli.js';
import { parseCommandMeta } from '../../util/command-meta.js';

const IGNORED_DIR_NAMES = ['.git'];

type CommandEntry = {
  name: string;
  sourceCommandsDir: string;
  mdPath: string;
  resourceDirPath?: string;
  destDir: string;
  destMdPath: string;
  adapter: TargetAdapter;
  scope: Scope;
  projectRoot: string;
};

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

export async function cmdCommandsCollect(
  _positionals: string[],
  _flags: ParsedFlags,
  _ctx: CliRunContext,
): Promise<number> {
  const positionals = _positionals;
  const flags = _flags;
  const ctx = _ctx;

  const dryRun = flags['dry-run'] === true;
  const force = flags.force === true || flags.overwrite === true;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const scopeFlag = typeof flags.scope === 'string' ? flags.scope : undefined;
  const cwdFlag = typeof flags.cwd === 'string' ? flags.cwd : undefined;

  const adapters = filterCommandAdapters(getAdapters());
  const selectedAdapters = await selectTargetAdapters({
    adapters,
    flags,
    interactive,
    mode: 'multi',
    promptMessage: 'Select collect source(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const config = await loadConfig();
  const centralRoot = getCentralCommandsDir();

  // Phase 1: 从所有选中的目标收集可用命令
  const allCommands: CommandEntry[] = [];
  for (const adapter of selectedAdapters) {
    const targetConfig = config.targets[adapter.id];
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag,
      cwdFlag,
      defaultScope: targetConfig?.defaultScope,
      currentCwd: ctx.cwd,
    });
    const sourceDir = adapter.resolveCommandsDir({ scope, projectRoot, homeDir });

    const targets = await detectTargetCommands(sourceDir);
    if (targets.length === 0) {
      process.stderr.write(`${ANSI.dim}(no commands found in ${getColoredLabel(adapter)} ${scope})${ANSI.reset}\n`);
      continue;
    }

    for (const t of targets) {
      if (t.name.startsWith('.') && !positionals.includes(t.name)) continue;
      if (positionals.length > 0 && !positionals.includes(t.name)) continue;

      const form = t.resourceDirPath ? 'directory' : 'file';
      const destDir = form === 'directory' ? getCentralCommandDir(t.name) : centralRoot;
      const destMdPath = form === 'directory' ? path.join(destDir, `${t.name}.md`) : getCentralCommandFile(t.name);

      allCommands.push({
        name: t.name,
        sourceCommandsDir: sourceDir,
        mdPath: t.mdPath,
        resourceDirPath: t.resourceDirPath,
        destDir,
        destMdPath,
        adapter,
        scope,
        projectRoot,
      });
    }
  }

  if (allCommands.length === 0) {
    process.stderr.write(`${ANSI.dim}No commands available to collect.${ANSI.reset}\n`);
    return 0;
  }

  // Phase 2: 检测每个命令的状态 (skip selection — go directly to status analysis)
  type CollectStatus = 'new' | 'identical' | 'conflict' | 'overwrite';
  type CommandWithStatus = CommandEntry & {
    status: CollectStatus;
    isDuplicate: boolean;
    srcHash: string;
    destHash?: string;
    form: 'directory' | 'file';
  };

  const seenNames = new Set<string>();
  const commandsWithStatus: CommandWithStatus[] = [];
  const selectedCommands = allCommands;

  process.stderr.write(`${ANSI.dim}Analyzing commands...${ANSI.reset}\n`);

  for (const c of selectedCommands) {
    const lowerName = c.name.toLowerCase();
    const isDuplicate = seenNames.has(lowerName);
    seenNames.add(lowerName);

    const srcMeta = await parseCommandMeta(c.mdPath);
    const srcSharedResources = mergeResourceRefs(srcMeta.resources, c.resourceDirPath ? [c.name] : undefined);
    const srcHash = await computeCommandHash({
      commandName: c.name,
      commandsDir: c.sourceCommandsDir,
      form: 'file',
      sharedResources: srcSharedResources,
    });
    let destHash: string | undefined;
    let status: CollectStatus = 'new';
    const form = c.resourceDirPath ? 'directory' : 'file';

    const existingForm = await detectCommandForm(c.name);
    if (existingForm === 'directory') {
      destHash = await computeCommandHash({
        commandName: c.name,
        commandsDir: centralRoot,
        form: 'directory',
      });
      status = destHash === srcHash ? 'identical' : 'conflict';
    } else if (existingForm === 'file') {
      const centralMdPath = getCentralCommandFile(c.name);
      const centralMeta = await parseCommandMeta(centralMdPath);
      const centralSharedResources = mergeResourceRefs(
        centralMeta.resources,
        (await pathExists(path.join(centralRoot, c.name))) ? [c.name] : undefined,
      );
      destHash = await computeCommandHash({
        commandName: c.name,
        commandsDir: centralRoot,
        form: 'file',
        sharedResources: centralSharedResources,
      });
      status = destHash === srcHash ? 'identical' : 'conflict';
    }

    commandsWithStatus.push({ ...c, status, isDuplicate, srcHash, destHash, form });
  }

  const destBaseDir = centralRoot;
  let finalCommands: CommandWithStatus[];

  const newCount = commandsWithStatus.filter((c) => c.status === 'new' && !c.isDuplicate).length;
  const conflictCount = commandsWithStatus.filter((c) => c.status === 'conflict').length;
  const identicalCount = commandsWithStatus.filter((c) => c.status === 'identical').length;
  const dedupCount = commandsWithStatus.filter((c) => c.isDuplicate).length;

  if (interactive && !force) {
    process.stderr.write(
      `Preview: ${ANSI.green}${newCount} new${ANSI.reset}, ${ANSI.red}${conflictCount} conflict${ANSI.reset}, ` +
        `${ANSI.gray}${identicalCount} identical${ANSI.reset}` +
        (dedupCount > 0 ? `, ${ANSI.dim}${dedupCount} duplicates${ANSI.reset}` : '') +
        '\n',
    );

    const defaultSelected = commandsWithStatus
      .map((c, i) => (!c.isDuplicate && (c.status === 'new' || c.status === 'conflict') ? String(i) : null))
      .filter((v): v is string => v !== null);

    const selectedKeys = await promptMultiSelect({
      message: `Confirm commands to collect (target: ${destBaseDir}):`,
      options: commandsWithStatus.map((c, i) => {
        const labels: string[] = [];
        if (c.isDuplicate) labels.push(`${ANSI.dim}dup${ANSI.reset}`);
        else if (c.status === 'new') labels.push(`${ANSI.green}new${ANSI.reset}`);
        else if (c.status === 'identical') labels.push(`${ANSI.gray}identical${ANSI.reset}`);
        else if (c.status === 'conflict') labels.push(`${ANSI.red}conflict${ANSI.reset}`);
        return {
          label: `${c.name} (${getColoredLabel(c.adapter)}) [${labels.join(', ')}]`,
          value: String(i),
        };
      }),
      defaultSelected,
      sortDefaultSelectedToTop: true,
    });

    if (selectedKeys.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
    finalCommands = selectedKeys.map((i) => commandsWithStatus[Number(i)]!);
  } else {
    const toCollect = commandsWithStatus.filter((c) => !c.isDuplicate && c.status !== 'identical');
    process.stdout.write(`\nCollect ${toCollect.length} command(s) to ${destBaseDir}:\n`);
    for (const c of toCollect) {
      const statusLabel = c.status === 'conflict' ? `${ANSI.red}conflict${ANSI.reset}` : `${ANSI.green}new${ANSI.reset}`;
      process.stdout.write(`  ${c.name} (${getColoredLabel(c.adapter)}) [${statusLabel}]\n`);
    }
    const skipped = commandsWithStatus.length - toCollect.length;
    if (skipped > 0) {
      process.stdout.write(`  ${ANSI.dim}(${skipped} skipped: identical or duplicates)${ANSI.reset}\n`);
    }
    finalCommands = toCollect;
  }

  const commandsToExecute = finalCommands;

  // Phase 4:  conflict 解决策略
  if (!dryRun) await ensureCentralCommandStore();

  const registry = await loadRegistry();
  registry.commands ??= {};
  const syncState = await loadSyncState();

  const conflicts = commandsToExecute.filter((c) => c.status === 'conflict');
  const resolutions = new Map<string, 'overwrite' | 'backup' | 'keep' | 'skip'>();

  for (const c of commandsToExecute) {
    if (c.status !== 'conflict') {
      resolutions.set(c.name, 'overwrite');
    }
  }

  if (conflicts.length > 0 && interactive && !force) {
    process.stdout.write(`\n${ANSI.red}Conflicts detected for ${conflicts.length} command(s).${ANSI.reset}\n`);

    const batchAction = await promptChoice({
      message: 'How would you like to resolve these conflicts?',
      options: [
        { key: 'o', label: 'Overwrite local (use source version)' },
        { key: 's', label: 'Skip all conflicts (keep local)' },
        { key: 'b', label: 'Backup local & overwrite' },
        { key: 'i', label: 'Inspect/Select individually' },
        { key: 'c', label: 'Cancel operation' },
      ],
    });

    if (batchAction === 'c') {
      process.stdout.write('Operation cancelled.\n');
      return 0;
    }

    if (batchAction === 'o') {
      conflicts.forEach((c) => resolutions.set(c.name, 'overwrite'));
    } else if (batchAction === 's') {
      conflicts.forEach((c) => resolutions.set(c.name, 'skip'));
    } else if (batchAction === 'b') {
      conflicts.forEach((c) => resolutions.set(c.name, 'backup'));
    } else if (batchAction === 'i') {
      for (const c of conflicts) {
        const action = await promptChoice({
          message: `Resolve conflict for ${c.name}:`,
          options: [
            { key: 'o', label: 'Overwrite' },
            { key: 'b', label: 'Backup & overwrite' },
            { key: 'k', label: 'Keep both (rename incoming)' },
            { key: 's', label: 'Skip' },
          ],
        });
        const keyToAction: Record<string, 'overwrite' | 'backup' | 'keep' | 'skip'> = {
          o: 'overwrite',
          b: 'backup',
          k: 'keep',
          s: 'skip',
        };
        resolutions.set(c.name, keyToAction[action] ?? 'skip');
      }
    }
  } else if (force) {
    conflicts.forEach((c) => resolutions.set(c.name, 'overwrite'));
  } else if (conflicts.length > 0) {
    process.stderr.write(
      `${conflicts.length} conflict(s) detected. Re-run with --force or in an interactive terminal.\n`,
    );
    return 1;
  }

  // Phase 5: 执行收集
  for (const cmd of commandsToExecute) {
    const { name, mdPath, resourceDirPath, destDir, destMdPath, adapter, scope, projectRoot, srcHash, form } = cmd;

    if (!(await pathExists(mdPath))) {
      process.stderr.write(`Missing source command: ${name}\n`);
      continue;
    }

    const contextId = makeContextId({
      target: adapter.id,
      scope,
      projectRoot: scope === 'local' ? projectRoot : undefined,
    });
    const context = syncState.contexts[contextId] ?? ({} as { skills?: Record<string, unknown>; commands?: Record<string, { hash: string; syncedAt: string }> });
    syncState.contexts[contextId] = context;
    context.commands ??= {};

    const action = resolutions.get(name) ?? 'skip';

    if (action === 'skip') {
      process.stdout.write(`Skipped: ${name}\n`);
      continue;
    }

    let targetDest = destDir;
    let targetMd = destMdPath;
    let targetName = name;

    if (action === 'keep') {
      let counter = 1;
      while (await pathExists(targetMd)) {
        targetName = `${name}_new${counter}`;
        targetDest = form === 'directory' ? getCentralCommandDir(targetName) : centralRoot;
        targetMd = form === 'directory' ? path.join(targetDest, `${targetName}.md`) : getCentralCommandFile(targetName);
        counter++;
      }
      process.stdout.write(`Renaming incoming to ${targetName}\n`);
    }

    if (dryRun) {
      const actionLabel = action === 'keep' ? `keep-both as ${targetName}` : action;
      process.stdout.write(`[dry-run] ${actionLabel} ${name} -> ${targetDest}\n`);
      continue;
    }

    if (action === 'backup') {
      if (form === 'directory' && (await pathExists(targetDest))) {
        const backupDir = `${targetDest}.bak-${Date.now()}`;
        await ensureDir(path.dirname(backupDir));
        await copyDir(targetDest, backupDir, { ignoreNames: IGNORED_DIR_NAMES });
        await removeDirContents(targetDest, IGNORED_DIR_NAMES);
      } else if (form === 'file' && (await pathExists(targetMd))) {
        const backupPath = `${targetMd}.bak-${Date.now()}`;
        await fs.copyFile(targetMd, backupPath);
      }
    } else if (action === 'overwrite') {
      if (form === 'directory' && (await pathExists(targetDest))) {
        await removeDirContents(targetDest, IGNORED_DIR_NAMES);
      } else if (form === 'file' && (await pathExists(targetMd))) {
        await fs.rm(targetMd, { force: true });
      }
    }

    if (form === 'directory') {
      await collectToDirectory({
        mdFilePath: mdPath,
        resourceDirPath,
        destDir: targetDest,
        commandName: targetName,
      });
    } else {
      await collectToFile({
        mdFilePath: mdPath,
        destMdPath: targetMd,
      });
    }

    const now = new Date().toISOString();
    registry.commands[targetName] = registry.commands[targetName] ?? {
      name: targetName,
      form,
      addedAt: now,
      updatedAt: now,
      source: { type: 'collected', from: { target: adapter.id, scope, path: mdPath } },
    };
    registry.commands[targetName]!.updatedAt = now;
    registry.commands[targetName]!.form = form;
    context.commands[targetName] = { hash: srcHash, syncedAt: now };

    process.stdout.write(`Collected: ${targetName}\n`);
  }

  if (!dryRun) {
    await saveRegistry(registry);
    await saveSyncState(syncState);
  }

  return 0;
}
