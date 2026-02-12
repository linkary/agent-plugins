import path from 'node:path';
import React, { useState, useCallback } from 'react';
import { render } from 'ink';
import { loadConfig } from '../../core/config.js';
import { loadRegistry } from '../../core/registry.js';
import { listCentralCommands } from '../../core/command-store.js';
import { getAdapters } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { gatherTargetCommands, findSyncedCommandCopies } from './manage-utils.js';
import { SkillBrowser, type SkillEntry } from '../../ui/SkillBrowser.js';
import { FileBrowser } from '../../ui/FileBrowser.js';
import { FileViewer } from '../../ui/FileViewer.js';
import { readCommandDescription } from '../../util/command-meta.js';
import { findEntryMd } from '../../core/command-store.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';
import type { CommandRecord } from '../../core/registry.js';

// ─── Entry point ────────────────────────────────────────────────────────

export async function cmdCommandsShow(_positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('show requires an interactive terminal (TTY).\n');
    return 1;
  }

  const hasTargetFlag = Boolean(flags.target);

  let commandEntries: SkillEntry[];

  if (hasTargetFlag) {
    const adapters = getAdapters();
    const config = await loadConfig();
    const selectedAdapters = await selectTargetAdapters({
      adapters,
      flags,
      interactive: true,
      mode: 'single',
      promptMessage: 'Select target to browse:',
    });
    if (selectedAdapters.length === 0) return 1;

    const targetCommands = await gatherTargetCommands({
      adapters: selectedAdapters,
      config,
      scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
      cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
      currentCwd: ctx.cwd,
    });

    commandEntries = targetCommands.map((c) => ({
      name: c.name,
      // 显示实际 .md 文件路径
      path: c.mdPath,
      record: undefined,
    }));
  } else {
    const commands = await listCentralCommands();
    const registry = await loadRegistry();

    commandEntries = commands.map((cmd) => ({
      name: cmd.name,
      // 对于 file-form，显示实际 .md 文件路径；对于 directory-form，显示目录路径
      path: cmd.form === 'directory' ? cmd.path : cmd.mdPath,
      record: registry.commands?.[cmd.name] as CommandRecord | undefined,
    }));
  }

  if (commandEntries.length === 0) {
    process.stdout.write('(no commands found)\n');
    return 0;
  }

  return new Promise<number>((resolve) => {
    const instance = render(
      <ShowApp
        commands={commandEntries}
        currentCwd={ctx.cwd}
        onExit={() => {
          instance.unmount();
          resolve(0);
        }}
      />,
    );
  });
}

// ─── 顶层 App：管理 browser ↔ file browser 切换 ─────────────────────────────

type ShowAppProps = {
  commands: SkillEntry[];
  currentCwd: string;
  onExit: () => void;
};

async function readCommandDescForEntry(entryPath: string, name: string): Promise<string | undefined> {
  if (entryPath.endsWith('.md')) {
    return readCommandDescription(entryPath);
  }
  const entryMd = await findEntryMd(entryPath, name);
  if (entryMd) return readCommandDescription(entryMd);
  return undefined;
}

function ShowApp(props: ShowAppProps) {
  const { commands, currentCwd, onExit } = props;
  const [view, setView] = useState<'browser' | 'files' | 'viewer'>('browser');
  const [selectedCommand, setSelectedCommand] = useState<SkillEntry | null>(null);

  const handleSelect = useCallback((cmd: SkillEntry) => {
    setSelectedCommand(cmd);
    // file-form 命令（.md 文件）→ 直接用 FileViewer 查看
    // directory-form 命令 → 用 FileBrowser 浏览目录
    setView(cmd.path.endsWith('.md') ? 'viewer' : 'files');
  }, []);

  const handleBack = useCallback(() => {
    setView('browser');
  }, []);

  if (view === 'viewer' && selectedCommand) {
    // file-form 命令：直接查看 .md 文件内容
    return (
      <FileViewer
        filePath={selectedCommand.path}
        title={selectedCommand.name}
        onBack={handleBack}
      />
    );
  }

  if (view === 'files' && selectedCommand) {
    // directory-form 命令：浏览目录结构
    return (
      <FileBrowser
        rootPath={selectedCommand.path}
        skillName={selectedCommand.name}
        onBack={handleBack}
      />
    );
  }

  return (
    <SkillBrowser
      skills={commands}
      currentCwd={currentCwd}
      initialSkillName={selectedCommand?.name}
      onSelect={handleSelect}
      onExit={onExit}
      listLabel="Commands"
      readDescription={readCommandDescForEntry}
      findSynced={async ({ skillNames, config, currentCwd }) => {
        const copies = await findSyncedCommandCopies({ commandNames: skillNames, config, currentCwd });
        return copies.map((c) => ({ adapterId: c.adapterId, adapterLabel: c.adapterLabel, scope: c.scope }));
      }}
    />
  );
}
