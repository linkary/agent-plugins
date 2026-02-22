/**
 * 命令同步：从中央存储 (directory/file-form) 同步到目标 (flat-form)。
 */
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { listCentralCommands, getCentralCommandDir } from '../../core/command-store.js';
import { getCentralCommandsDir } from '../../util/apg-paths.js';
import { ANSI } from '../../util/ansi.js';
import { ensureDir, pathExists, removeDir } from '../../util/fs-utils.js';
import { computeCommandHash } from '../../util/item-utils.js';
import { promptChoice, promptMultiSelect } from '../../util/prompt.js';
import {
  filterCommandAdapters,
  getAdapters,
  getColoredLabel,
  type Scope,
  type TargetAdapter,
} from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { resolveTargetContext } from '../../util/scope.js';
import { loadSyncState, makeContextId, saveSyncState } from '../../core/sync-state.js';
import { loadConfig } from '../../core/config.js';
import { syncDirectoryCommand, syncFileCommand } from '../../util/command-transform.js';
import { parseCommandMeta } from '../../util/command-meta.js';
import { timestampId } from '../../util/sync-utils.js';
import { copyDir } from '../../util/copy-dir.js';
import {
  countByStatus,
  formatCountSummary,
  formatScopeTitle,
  formatStatusLabel,
  groupEntriesByName,
  type StatusStyle,
} from '../../util/sync-preview.js';

type SyncEntry = {
  name: string;
  form: 'directory' | 'file';
  mdPath: string;
  adapter: TargetAdapter;
  scope: Scope;
  projectRoot: string;
  destCommandsDir: string;
};

type EntryStatus = 'new' | 'replace' | 'same';
const ENTRY_STATUS_ORDER = ['new', 'replace', 'same'] as const;
const ENTRY_STATUS_STYLES: StatusStyle<EntryStatus> = {
  new: { color: 'green' },
  replace: { color: 'yellow' },
  same: { color: 'dim' },
};

export async function cmdCommandsSync(
  positionals: string[],
  flags: ParsedFlags,
  ctx: CliRunContext,
): Promise<number> {
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
    promptMessage: 'Select sync target(s):',
  });
  if (selectedAdapters.length === 0) return 1;

  const config = await loadConfig();

  const availableCommands = await listCentralCommands();
  if (availableCommands.length === 0) {
    process.stdout.write('(no commands in central store)\n');
    process.stdout.write(`${ANSI.dim}Tip: use "ap commands collect" to import commands from targets, or "ap commands add" to add from a path/repo.${ANSI.reset}\n`);
    return 0;
  }

  const availableCommandNames = availableCommands.map((c) => c.name);

  // Phase 1: 收集所有同步条目（命令 + 目标组合）
  const allEntries: SyncEntry[] = [];
  for (const adapter of selectedAdapters) {
    const targetConfig = config.targets[adapter.id];
    const { scope, projectRoot, homeDir } = await resolveTargetContext({
      scopeFlag,
      cwdFlag,
      defaultScope: targetConfig?.defaultScope,
      currentCwd: ctx.cwd,
    });
    const destCommandsDir = adapter.resolveCommandsDir({ scope, projectRoot, homeDir });

    const defaultCommands =
      targetConfig?.includeCommands && !targetConfig.includeCommands.includes('*')
        ? targetConfig.includeCommands.filter((c) => availableCommandNames.includes(c))
        : availableCommandNames;

    for (const cmd of availableCommands) {
      if (!defaultCommands.includes(cmd.name)) continue;
      if (cmd.name.startsWith('.') && !positionals.includes(cmd.name)) continue;
      if (positionals.length > 0 && !positionals.includes(cmd.name)) continue;

      allEntries.push({
        name: cmd.name,
        form: cmd.form,
        mdPath: cmd.mdPath,
        adapter,
        scope,
        projectRoot,
        destCommandsDir,
      });
    }
  }

  if (allEntries.length === 0) {
    process.stdout.write('No commands available to sync.\n');
    return 0;
  }
  const scopeTitle = formatScopeTitle(allEntries.map((entry) => entry.scope));

  // Phase 2: 检查目标状态并显示预览
  const targetMdPath = (e: SyncEntry) => path.join(e.destCommandsDir, `${e.name}.md`);
  const srcBaseDir = getCentralCommandsDir();
  type EntryWithStatus = SyncEntry & { status: EntryStatus };
  const entriesWithStatus: EntryWithStatus[] = await Promise.all(
    allEntries.map(async (s) => {
      const targetMd = targetMdPath(s);
      if (!(await pathExists(targetMd))) {
        return { ...s, status: 'new' as const };
      }

      const targetResourceDir = path.join(s.destCommandsDir, s.name);
      const sharedResources = s.form === 'file' ? (await parseCommandMeta(s.mdPath)).resources : undefined;
      const srcHash = await computeCommandHash({
        commandName: s.name,
        commandsDir: srcBaseDir,
        form: s.form,
        sharedResources,
      });
      const destSharedResources = (await pathExists(targetResourceDir)) ? [s.name] : undefined;
      const destHash = await computeCommandHash({
        commandName: s.name,
        commandsDir: s.destCommandsDir,
        form: 'file',
        sharedResources: destSharedResources,
      });

      return { ...s, status: destHash === srcHash ? ('same' as const) : ('replace' as const) };
    }),
  );

  let finalEntries: EntryWithStatus[];

  if (positionals.length > 0) {
    finalEntries = entriesWithStatus;
  } else if (interactive && !force) {
    const previewCounts = countByStatus(entriesWithStatus, ENTRY_STATUS_ORDER);
    process.stdout.write(`\nPreview: ${formatCountSummary(previewCounts, ENTRY_STATUS_ORDER, ENTRY_STATUS_STYLES)}\n`);

    const grouped = groupEntriesByName(entriesWithStatus);
    const groupedItems = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
    const defaultSelected = groupedItems
      .filter(([, entries]) => entries.some((entry) => entry.status === 'new'))
      .map(([name]) => name);

    const selectedNames = await promptMultiSelect({
      message: `Confirm commands to sync (${scopeTitle}, source: ${srcBaseDir}):`,
      options: groupedItems.map(([name, entries]) => {
        const status = formatCountSummary(
          countByStatus(entries, ENTRY_STATUS_ORDER),
          ENTRY_STATUS_ORDER,
          ENTRY_STATUS_STYLES,
        );
        return {
          label: `${name} -> ${entries
            .map((entry) => `${getColoredLabel(entry.adapter)} (${formatStatusLabel(entry.status, ENTRY_STATUS_STYLES)})`)
            .join(', ')} [${status}]`,
          value: name,
        };
      }),
      defaultSelected,
      searchable: true,
    });

    if (selectedNames.length === 0) {
      process.stdout.write('Cancelled.\n');
      return 0;
    }
    const selectedNameSet = new Set(selectedNames);
    finalEntries = entriesWithStatus.filter((entry) => selectedNameSet.has(entry.name));
  } else {
    process.stdout.write(`\nSync ${entriesWithStatus.length} command(s) from ${srcBaseDir} (${scopeTitle}):\n`);
    for (const s of entriesWithStatus) {
      const status = formatStatusLabel(s.status, ENTRY_STATUS_STYLES);
      process.stdout.write(`  ${s.name} -> ${getColoredLabel(s.adapter)} [${status}]\n`);
    }
    finalEntries = entriesWithStatus;
  }

  // Phase 4: 执行同步
  const syncState = await loadSyncState();
  let conflictMode: 'ask' | 'overwrite' | 'backup' | 'skip' = force ? 'overwrite' : 'ask';

  if (!dryRun) {
    for (const dir of new Set(finalEntries.map((e) => e.destCommandsDir))) {
      await ensureDir(dir);
    }
  }

  const centralRoot = getCentralCommandsDir();

  for (const entry of finalEntries) {
    const { name, form, mdPath, adapter, scope, projectRoot, destCommandsDir } = entry;

    const targetMd = path.join(destCommandsDir, `${name}.md`);
    const targetResourceDir = path.join(destCommandsDir, name);

    if (!(await pathExists(mdPath))) {
      process.stderr.write(`Missing central command: ${name}\n`);
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

    const sharedResources = form === 'file' ? (await parseCommandMeta(mdPath)).resources : undefined;
    const srcHash = await computeCommandHash({
      commandName: name,
      commandsDir: centralRoot,
      form,
      sharedResources,
    });
    const destExists = await pathExists(targetMd);

    if (!destExists) {
      if (dryRun) {
        process.stdout.write(`[dry-run] sync ${name} -> ${destCommandsDir}\n`);
        continue;
      }
      if (form === 'directory') {
        await syncDirectoryCommand({
          srcDir: getCentralCommandDir(name),
          targetDir: destCommandsDir,
          commandName: name,
        });
      } else {
        await syncFileCommand({
          mdFilePath: mdPath,
          sharedResources: sharedResources ?? [],
          centralRoot,
          targetDir: destCommandsDir,
          commandName: name,
        });
      }
      context.commands[name] = { hash: srcHash, syncedAt: new Date().toISOString() };
      process.stdout.write(`Synced: ${name} -> ${getColoredLabel(adapter)}\n`);
      continue;
    }

    const destSharedResources = (await pathExists(targetResourceDir)) ? [name] : undefined;
    const destHash = await computeCommandHash({
      commandName: name,
      commandsDir: destCommandsDir,
      form: 'file',
      sharedResources: destSharedResources,
    });

    if (destHash === srcHash) {
      context.commands[name] = {
        hash: srcHash,
        syncedAt: context.commands[name]?.syncedAt ?? new Date().toISOString(),
      };
      process.stdout.write(`Up-to-date: ${name} (${getColoredLabel(adapter)})\n`);
      continue;
    }

    const last = context.commands[name];
    const isManagedClean = last?.hash === destHash;
    let mode = conflictMode;
    if (mode === 'ask' && isManagedClean) {
      mode = 'overwrite';
    }

    if (mode === 'ask') {
      if (!interactive) {
        process.stderr.write(
          `Conflict detected for ${name}. Re-run with --force or in an interactive terminal.\n`,
        );
        return 1;
      }
      const choice = await promptChoice({
        message: `Conflict for ${name} in ${getColoredLabel(adapter)}.`,
        options: [
          { key: 'o', label: 'Overwrite' },
          { key: 'b', label: 'Backup & overwrite' },
          { key: 's', label: 'Skip' },
          { key: 'O', label: 'Overwrite all' },
          { key: 'B', label: 'Backup all' },
          { key: 'S', label: 'Skip all' },
          { key: 'q', label: 'Quit' },
        ],
      });
      if (choice === 'q') return 1;
      if (choice === 'O') conflictMode = 'overwrite';
      if (choice === 'B') conflictMode = 'backup';
      if (choice === 'S') conflictMode = 'skip';
      mode = choice === 'o' || choice === 'O' ? 'overwrite' : choice === 'b' || choice === 'B' ? 'backup' : 'skip';
    }

    if (mode === 'skip') {
      process.stdout.write(`Skipped: ${name}\n`);
      continue;
    }

    if (dryRun) {
      process.stdout.write(`[dry-run] ${mode} ${name} -> ${destCommandsDir}\n`);
      continue;
    }

    const ts = timestampId();
    if (mode === 'backup') {
      const backupDir = path.join(destCommandsDir, `${name}.bak-${ts}`);
      await ensureDir(backupDir);
      await fs.copyFile(targetMd, path.join(backupDir, `${name}.md`));
      if (await pathExists(targetResourceDir)) {
        await copyDir(targetResourceDir, path.join(backupDir, name), { ignoreNames: ['.git'] });
      }
    }
    if (await pathExists(targetMd)) await fs.rm(targetMd, { force: true });
    if (await pathExists(targetResourceDir)) await removeDir(targetResourceDir);

    if (form === 'directory') {
      await syncDirectoryCommand({
        srcDir: getCentralCommandDir(name),
        targetDir: destCommandsDir,
        commandName: name,
      });
    } else {
      await syncFileCommand({
        mdFilePath: mdPath,
        sharedResources: sharedResources ?? [],
        centralRoot,
        targetDir: destCommandsDir,
        commandName: name,
      });
    }
    context.commands[name] = { hash: srcHash, syncedAt: new Date().toISOString() };
    process.stdout.write(`Synced: ${name} -> ${getColoredLabel(adapter)}\n`);
  }

  if (!dryRun) await saveSyncState(syncState);

  return 0;
}
