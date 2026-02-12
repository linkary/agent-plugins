/**
 * MCP (Model Context Protocol) 服务器定义的标准化类型。
 * 用于中央存储和跨工具同步。
 */

/** MCP 传输协议类型 */
export type McpTransport = 'stdio' | 'sse' | 'http' | 'ws';

/**
 * 标准化的 MCP 服务器定义。
 * 存储在 ~/.agent-plugins/mcp/<name>.json 中。
 */
export type McpServerDef = {
  /** 传输协议类型，默认 'stdio' */
  type?: McpTransport;
  /** stdio 模式的可执行命令 */
  command?: string;
  /** stdio 模式的命令参数 */
  args?: string[];
  /** HTTP/SSE/WS 模式的 URL */
  url?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** HTTP 请求头 (HTTP/SSE 模式) */
  headers?: Record<string, string>;
  /** 是否启用，默认 true */
  enabled?: boolean;
  /** 工具超时时间（秒），仅部分工具支持 */
  tool_timeout_sec?: number;
};

/**
 * 目标工具 MCP 配置文件的描述规格。
 * 由 TargetAdapter.resolveMcpConfig() 返回。
 */
export type McpConfigSpec = {
  /** 配置文件的绝对路径 */
  configPath: string;
  /** 文件格式 */
  format: 'json' | 'toml';
  /** 存放 MCP 服务器的键名 (如 'mcpServers' 或 'mcp_servers') */
  serversKey: string;
};
