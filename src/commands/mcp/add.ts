/**
 * ap mcp add — 添加 MCP 服务器定义到中央存储。
 * 支持交互式填写或通过 CLI flags 直接指定。
 */
import { ensureCentralMcpStore, readCentralMcpServer, writeCentralMcpServer } from '../../core/mcp-store.js';
import { loadRegistry, saveRegistry } from '../../core/registry.js';
import { ANSI } from '../../util/ansi.js';
import { promptConfirm, promptSelect } from '../../util/prompt.js';
import type { McpServerDef, McpTransport } from '../../core/mcp-types.js';
import type { ParsedFlags } from '../../util/options.js';
import type { CliRunContext } from '../../runner/cli.js';

// ─── readline-based prompt (用于字符串输入) ─────────────────────────────

async function promptInput(message: string, defaultValue?: string): Promise<string> {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  return new Promise<string>((resolve) => {
    rl.question(`${message}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

// ─── Entry point ────────────────────────────────────────────────────────

export async function cmdMcpAdd(positionals: string[], flags: ParsedFlags, _ctx: CliRunContext) {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const force = flags.force === true || flags.overwrite === true;
  const dryRun = flags['dry-run'] === true;

  await ensureCentralMcpStore();

  // 从 flags 收集参数
  let name = typeof flags.name === 'string' ? flags.name : positionals[0] || undefined;
  const typeFlag = typeof flags.type === 'string' ? flags.type : undefined;
  const commandFlag = typeof flags.command === 'string' ? flags.command : undefined;
  const argsFlag = typeof flags.args === 'string' ? flags.args : undefined;
  const urlFlag = typeof flags.url === 'string' ? flags.url : undefined;

  // 如果参数不全且不是交互模式，显示用法
  if (!interactive && !name) {
    process.stderr.write(
      'Usage: ap mcp add <name> [--type stdio|sse|http] [--command <cmd>] [--args <args>] [--url <url>]\n',
    );
    process.stderr.write('       ap mcp add  (interactive mode in TTY)\n');
    return 1;
  }

  let def: McpServerDef;

  if (commandFlag || urlFlag) {
    // 从 flags 构建定义（非交互快速路径）
    if (!name) {
      process.stderr.write('--name is required when using --command or --url flags.\n');
      return 1;
    }
    def = buildDefFromFlags({ type: typeFlag, command: commandFlag, args: argsFlag, url: urlFlag });
  } else if (interactive) {
    // 交互式构建
    if (!name) {
      name = await promptInput('Server name');
      if (!name) {
        process.stderr.write('Name is required.\n');
        return 1;
      }
    }
    def = await interactiveBuildDef();
  } else {
    process.stderr.write('Not enough flags for non-interactive mode. Provide --command or --url.\n');
    return 1;
  }

  // 检查是否已存在
  const existing = await readCentralMcpServer(name);
  if (existing && !force) {
    if (interactive) {
      const overwrite = await promptConfirm(`MCP server "${name}" already exists. Overwrite?`);
      if (!overwrite) {
        process.stdout.write('Cancelled.\n');
        return 0;
      }
    } else {
      process.stderr.write(`MCP server "${name}" already exists. Use --force to overwrite.\n`);
      return 1;
    }
  }

  if (dryRun) {
    process.stdout.write(`[dry-run] Would add MCP server: ${name}\n`);
    process.stdout.write(JSON.stringify(def, null, 2) + '\n');
    return 0;
  }

  // 写入中央存储
  await writeCentralMcpServer(name, def);

  // 更新 registry
  const registry = await loadRegistry();
  if (!registry.mcp) registry.mcp = {};
  const now = new Date().toISOString();
  registry.mcp[name] = {
    name,
    addedAt: existing ? registry.mcp[name]?.addedAt ?? now : now,
    updatedAt: now,
    source: { type: 'manual' },
  };
  await saveRegistry(registry);

  process.stdout.write(`${ANSI.green}Added MCP server: ${name}${ANSI.reset}\n`);
  return 0;
}

// ─── Helper: 从 flags 构建定义 ──────────────────────────────────────────

function buildDefFromFlags(params: {
  type?: string;
  command?: string;
  args?: string;
  url?: string;
}): McpServerDef {
  const def: McpServerDef = {};

  if (params.url) {
    def.type = (params.type as McpTransport) || 'sse';
    def.url = params.url;
  } else if (params.command) {
    def.type = 'stdio';
    def.command = params.command;
    if (params.args) {
      def.args = params.args.split(/\s+/).filter(Boolean);
    }
  }

  return def;
}

// ─── Helper: 交互式构建定义 ─────────────────────────────────────────────

async function interactiveBuildDef(): Promise<McpServerDef> {
  const transportType = (await promptSelect({
    message: 'Transport type:',
    options: [
      { label: 'stdio (command + args)', value: 'stdio' },
      { label: 'SSE (URL)', value: 'sse' },
      { label: 'Streamable HTTP (URL)', value: 'streamable-http' },
      { label: 'HTTP (URL)', value: 'http' },
    ],
  })) as McpTransport;

  const def: McpServerDef = { type: transportType };

  if (transportType === 'stdio') {
    def.command = await promptInput('Command (e.g., npx)');
    const argsStr = await promptInput('Args (space-separated, e.g., -y tavily-mcp)');
    if (argsStr) def.args = argsStr.split(/\s+/).filter(Boolean);

    const envStr = await promptInput('Env vars (KEY=VALUE, comma-separated, or empty)');
    if (envStr) {
      def.env = {};
      for (const pair of envStr.split(',')) {
        const [key, ...rest] = pair.split('=');
        if (key?.trim() && rest.length > 0) {
          def.env[key.trim()] = rest.join('=').trim();
        }
      }
    }
  } else {
    def.url = await promptInput('URL');
  }

  return def;
}
