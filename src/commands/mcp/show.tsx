/**
 * ap mcp show — 交互式浏览 MCP 服务器定义。
 * 左侧面板：服务器列表。
 * 右侧面板：当前高亮服务器的元数据与定义摘要。
 * 按 Enter 打开完整 JSON 定义查看。
 */
import React, { useState, useCallback } from 'react';
import { render } from 'ink';
import { loadConfig } from '../../core/config.js';
import { loadRegistry } from '../../core/registry.js';
import { listCentralMcpServers, getCentralMcpPath, readCentralMcpServer } from '../../core/mcp-store.js';
import { getAdapters } from '../../targets/adapters.js';
import { selectTargetAdapters } from '../../targets/select-targets.js';
import { gatherTargetMcpServers, findSyncedMcpCopies, filterMcpAdapters } from './manage-utils.js';
import { SkillBrowser, type SkillEntry } from '../../ui/skill-browser.js';
import { FileViewer } from '../../ui/file-viewer.js';
import type { McpServerDef } from '../../core/mcp-types.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

// ─── MCP 定义摘要（用于侧面板描述） ────────────────────────────────────

function formatMcpDescription(def: McpServerDef): string {
  const parts: string[] = [];
  const transport = def.type ?? 'stdio';
  parts.push(`[${transport}]`);

  if (def.command) {
    const cmdLine = [def.command, ...(def.args ?? [])].join(' ');
    parts.push(cmdLine);
  }
  if (def.url) {
    parts.push(def.url);
  }
  if (def.env && Object.keys(def.env).length > 0) {
    parts.push(`env: ${Object.keys(def.env).join(', ')}`);
  }
  return parts.join('  ');
}

/** 读取 MCP 服务器定义并返回格式化描述 */
async function readMcpDescription(_filePath: string, name: string): Promise<string | undefined> {
  const def = await readCentralMcpServer(name);
  if (!def) return undefined;
  return formatMcpDescription(def);
}

// ─── Entry point ────────────────────────────────────────────────────────

export async function cmdMcpShow(_positionals: string[], flags: ParsedFlags, ctx: CliRunContext) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('show requires an interactive terminal (TTY).\n');
    return 1;
  }

  const hasTargetFlag = Boolean(flags.target);

  let mcpEntries: SkillEntry[];

  if (hasTargetFlag) {
    // 目标模式：浏览指定目标的 MCP 服务器
    const allAdapters = getAdapters();
    const mcpAdapters = filterMcpAdapters(allAdapters);
    if (mcpAdapters.length === 0) {
      process.stderr.write('No target tools with MCP support found.\n');
      return 1;
    }

    const config = await loadConfig();
    const selectedAdapters = await selectTargetAdapters({
      adapters: mcpAdapters,
      flags,
      interactive: true,
      mode: 'single',
      promptMessage: 'Select target to browse:',
    });
    if (selectedAdapters.length === 0) return 1;

    const targetServers = await gatherTargetMcpServers({
      adapters: selectedAdapters,
      config,
      scopeFlag: typeof flags.scope === 'string' ? flags.scope : undefined,
      cwdFlag: typeof flags.cwd === 'string' ? flags.cwd : undefined,
      currentCwd: ctx.cwd,
    });

    mcpEntries = targetServers.map((s) => ({
      name: s.name,
      // 目标模式没有中央存储的 .json 文件，用 adapterId 作为占位
      path: `[${s.adapterLabel}] ${s.name}`,
    }));
  } else {
    // 中央模式：浏览中央仓库
    const servers = await listCentralMcpServers();
    const registry = await loadRegistry();

    mcpEntries = servers.map((name) => ({
      name,
      path: getCentralMcpPath(name),
      record: registry.mcp?.[name],
    }));
  }

  if (mcpEntries.length === 0) {
    process.stdout.write('(no MCP servers found)\n');
    return 0;
  }

  return new Promise<number>((resolve) => {
    const instance = render(
      <ShowApp
        servers={mcpEntries}
        currentCwd={ctx.cwd}
        onExit={() => {
          instance.unmount();
          resolve(0);
        }}
      />,
    );
  });
}

// ─── 顶层 App：管理 browser ↔ viewer 切换 ──────────────────────────────

type ShowAppProps = {
  servers: SkillEntry[];
  currentCwd: string;
  onExit: () => void;
};

function ShowApp(props: ShowAppProps) {
  const { servers, currentCwd, onExit } = props;
  const [view, setView] = useState<'browser' | 'viewer'>('browser');
  const [selectedServer, setSelectedServer] = useState<SkillEntry | null>(null);

  const handleSelect = useCallback((entry: SkillEntry) => {
    // 只有中央存储的 .json 文件可以用 FileViewer 打开
    if (entry.path.endsWith('.json')) {
      setSelectedServer(entry);
      setView('viewer');
    }
  }, []);

  const handleBack = useCallback(() => {
    setView('browser');
  }, []);

  if (view === 'viewer' && selectedServer) {
    return (
      <FileViewer
        filePath={selectedServer.path}
        title={selectedServer.name}
        onBack={handleBack}
      />
    );
  }

  return (
    <SkillBrowser
      skills={servers}
      currentCwd={currentCwd}
      initialSkillName={selectedServer?.name}
      onSelect={handleSelect}
      onExit={onExit}
      listLabel="MCP Servers"
      readDescription={readMcpDescription}
      findSynced={async ({ skillNames, config, currentCwd: cwd }) => {
        const copies = await findSyncedMcpCopies({ serverNames: skillNames, config, currentCwd: cwd });
        return copies.map((c) => ({ adapterId: c.adapterId, adapterLabel: c.adapterLabel, scope: c.scope }));
      }}
    />
  );
}
