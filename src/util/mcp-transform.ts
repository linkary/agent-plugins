import type { McpServerDef, McpTransport } from '../core/mcp-types.js';
import type { TargetId } from '../targets/adapters.js';

export type CanonicalMcpDef = {
  type: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  enabled?: boolean;
  tool_timeout_sec?: number;
};

type McpCapability = {
  includeType: boolean;
  supportedTransports: McpTransport[];
  supportEnv: boolean;
  supportHeaders: boolean;
  supportEnabled: boolean;
  supportToolTimeout: boolean;
};

const DEFAULT_CAPABILITY: McpCapability = {
  includeType: true,
  supportedTransports: ['stdio', 'sse', 'http', 'ws'],
  supportEnv: true,
  supportHeaders: true,
  supportEnabled: true,
  supportToolTimeout: true,
};

function getMcpCapability(target: TargetId): McpCapability {
  switch (target) {
    case 'codex':
      return {
        includeType: false,
        supportedTransports: ['stdio', 'sse', 'http'],
        supportEnv: true,
        supportHeaders: true,
        supportEnabled: false,
        supportToolTimeout: false,
      };
    case 'antigravity':
      return {
        includeType: true,
        supportedTransports: ['stdio', 'sse', 'http'],
        supportEnv: true,
        supportHeaders: true,
        supportEnabled: false,
        supportToolTimeout: false,
      };
    default:
      return DEFAULT_CAPABILITY;
  }
}

function cleanStringMap(input: unknown): Record<string, string> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function inferTransport(def: McpServerDef): McpTransport | null {
  if (def.type) return def.type;
  if (typeof def.command === 'string' && def.command.trim()) return 'stdio';
  if (typeof def.url === 'string' && def.url.trim()) return 'sse';
  return null;
}

export function parseMcpToCanonical(def: McpServerDef): { canonical: CanonicalMcpDef | null; error?: string } {
  const inferred = inferTransport(def);
  if (!inferred) return { canonical: null, error: 'Cannot infer MCP transport from definition.' };

  const canonical: CanonicalMcpDef = { type: inferred };
  if (inferred === 'stdio') {
    if (!def.command || !def.command.trim()) {
      return { canonical: null, error: 'stdio transport requires non-empty command.' };
    }
    canonical.command = def.command;
    if (Array.isArray(def.args)) canonical.args = def.args.map((item) => String(item));
  } else {
    if (!def.url || !def.url.trim()) {
      return { canonical: null, error: `${inferred} transport requires non-empty url.` };
    }
    canonical.url = def.url;
  }

  const env = cleanStringMap(def.env);
  if (env) canonical.env = env;
  const headers = cleanStringMap(def.headers);
  if (headers) canonical.headers = headers;
  if (typeof def.enabled === 'boolean') canonical.enabled = def.enabled;
  if (typeof def.tool_timeout_sec === 'number' && Number.isFinite(def.tool_timeout_sec)) {
    canonical.tool_timeout_sec = def.tool_timeout_sec;
  }
  return { canonical };
}

export function serializeCanonicalMcpForTarget(
  canonical: CanonicalMcpDef,
  target: TargetId,
): { def: McpServerDef | null; incompatibleReason?: string; lossy: boolean; lossyReasons: string[] } {
  const capability = getMcpCapability(target);
  const lossyReasons: string[] = [];

  if (!capability.supportedTransports.includes(canonical.type)) {
    return {
      def: null,
      incompatibleReason: `${target} does not support "${canonical.type}" transport`,
      lossy: false,
      lossyReasons,
    };
  }

  const out: McpServerDef = {};
  if (capability.includeType) out.type = canonical.type;

  if (canonical.type === 'stdio') {
    if (!canonical.command || !canonical.command.trim()) {
      return {
        def: null,
        incompatibleReason: 'stdio transport requires non-empty command',
        lossy: false,
        lossyReasons,
      };
    }
    out.command = canonical.command;
    if (canonical.args?.length) out.args = [...canonical.args];
  } else {
    if (!canonical.url || !canonical.url.trim()) {
      return {
        def: null,
        incompatibleReason: `${canonical.type} transport requires non-empty url`,
        lossy: false,
        lossyReasons,
      };
    }
    out.url = canonical.url;
  }

  if (canonical.env) {
    if (capability.supportEnv) out.env = { ...canonical.env };
    else lossyReasons.push('env');
  }

  if (canonical.headers) {
    if (capability.supportHeaders) out.headers = { ...canonical.headers };
    else lossyReasons.push('headers');
  }

  if (typeof canonical.enabled === 'boolean') {
    if (capability.supportEnabled) out.enabled = canonical.enabled;
    else lossyReasons.push('enabled');
  }

  if (typeof canonical.tool_timeout_sec === 'number') {
    if (capability.supportToolTimeout) out.tool_timeout_sec = canonical.tool_timeout_sec;
    else lossyReasons.push('tool_timeout_sec');
  }

  return { def: out, lossy: lossyReasons.length > 0, lossyReasons };
}

export function normalizeCentralMcpDef(def: McpServerDef): { def: McpServerDef | null; error?: string } {
  const parsed = parseMcpToCanonical(def);
  if (!parsed.canonical) return { def: null, error: parsed.error ?? 'Invalid MCP definition' };
  const normalized = serializeCanonicalMcpForTarget(parsed.canonical, 'cursor');
  if (!normalized.def) return { def: null, error: normalized.incompatibleReason ?? 'Invalid MCP definition' };
  return { def: normalized.def };
}
