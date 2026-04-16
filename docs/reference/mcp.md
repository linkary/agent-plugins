# Mcp Reference

Generated: 2026-04-15

This page is official-doc-first. Vendor docs are treated as authoritative. Current repo behavior is only used to fill gaps and is labeled in the evidence status.

| Target | Support | Repo Support | Scopes | Format | Reliability |
| --- | --- | --- | --- | --- | --- |
| [Cursor](./targets/cursor.md) | supported | documented-only | [local](#cursor-mcp-local), [global](#cursor-mcp-global) | json | High |
| [Gemini CLI](./targets/gemini.md) | supported | documented-only | [local](#gemini-mcp-local), [global](#gemini-mcp-global) | json | High |
| [Codex](./targets/codex.md) | supported | documented-only | [local](#codex-mcp-local), [global](#codex-mcp-global) | toml | High |
| [Claude Code](./targets/claude-code.md) | supported | documented-only | [local](#claude-code-mcp-local), [global](#claude-code-mcp-global) | json | High |
| [Google Antigravity](./targets/antigravity.md) | supported | partial | [global](#antigravity-mcp-global) | json | Medium |
| [Openskills](./targets/openskills.md) | unsupported | unsupported | Undocumented | — | Low |
| [Agentskills (Vercel Labs)](./targets/agents.md) | unsupported | unsupported | Undocumented | — | Low |
| [OpenCode](./targets/opencode.md) | supported | documented-only | [local](#opencode-mcp-local), [global](#opencode-mcp-global) | json | High |
| [Qoder](./targets/qoder.md) | supported | documented-only | [local](#qoder-mcp-local), [global](#qoder-mcp-global) | json | High |

## Cursor

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#cursor-mcp-local), [global](#cursor-mcp-global)
- Format: json
- Reliability: High
- Evidence status: `official+implementation`
- Evidence summary: Cursor docs directly cover `mcp.json`, project/home locations, and JSON server definitions. Repo support is documented here for maintenance context.
- Sources: [Cursor MCP](https://cursor.com/docs/mcp); [Google Developer Knowledge MCP setup for Cursor](https://developers.google.com/knowledge/mcp); Target adapters (`src/targets/adapters.ts`); MCP transform (`src/util/mcp-transform.ts`); MCP config IO (`src/util/mcp-config-io.ts`)

### Local path {#cursor-mcp-local}

- Scope: `local`
- Path: <project>/.cursor/mcp.json

### Global path {#cursor-mcp-global}

- Scope: `global`
- Path: ~/.cursor/mcp.json

Restrictions:
- Cursor documents JSON `mcp.json` files in both `.cursor/mcp.json` and `~/.cursor/mcp.json`.
- Cursor also supports one-click installs and extension-driven MCP registration outside direct file editing.

Notes:
- The repo’s current MCP adapter matches Cursor’s documented JSON file layout.

## Gemini CLI

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#gemini-mcp-local), [global](#gemini-mcp-global)
- Format: json
- Reliability: High
- Evidence status: `official`
- Sources: [Gemini CLI MCP server docs](https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html); [Gemini CLI configuration](https://google-gemini.github.io/gemini-cli/docs/get-started/configuration.html); [Google Developer Knowledge MCP setup for Gemini CLI](https://developers.google.com/knowledge/mcp)

### Local path {#gemini-mcp-local}

- Scope: `local`
- Path: <project>/.gemini/settings.json

### Global path {#gemini-mcp-global}

- Scope: `global`
- Path: ~/.gemini/settings.json

Restrictions:
- Gemini CLI documents MCP servers in `settings.json` under the `mcpServers` key.
- Official docs cover both project `.gemini/settings.json` and user `~/.gemini/settings.json`.

Notes:
None.

## Codex

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#codex-mcp-local), [global](#codex-mcp-global)
- Format: toml
- Reliability: High
- Evidence status: `official+implementation`
- Evidence summary: OpenAI docs directly cover both project and user `config.toml` locations and the `[mcp_servers.<name>]` table. The repo still only targets the global file today.
- Sources: [OpenAI Codex config reference](https://developers.openai.com/codex/config-reference); [OpenAI Codex MCP](https://developers.openai.com/codex/mcp); Target adapters (`src/targets/adapters.ts`); MCP transform (`src/util/mcp-transform.ts`); MCP config IO (`src/util/mcp-config-io.ts`)

### Local path {#codex-mcp-local}

- Scope: `local`
- Path: <project>/.codex/config.toml

### Global path {#codex-mcp-global}

- Scope: `global`
- Path: ~/.codex/config.toml

Restrictions:
- MCP configuration is documented as part of `config.toml` under `[mcp_servers.<server-name>]`.
- OpenAI documents both `~/.codex/config.toml` and project-scoped `.codex/config.toml` in trusted projects.
- Requirements may further constrain which MCP servers may be enabled.
- agent-plugins currently targets Codex MCP through the global config path only and may perform lossy conversion for unsupported fields.

Notes:
None.

## Claude Code

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#claude-code-mcp-local), [global](#claude-code-mcp-global)
- Format: json
- Reliability: High
- Evidence status: `official+implementation`
- Evidence summary: Claude Code docs directly cover JSON MCP config plus local, project, and user scopes. This page keeps the repo’s local/global abstraction explicit.
- Sources: [Claude Code MCP](https://code.claude.com/docs/en/mcp); Target adapters (`src/targets/adapters.ts`); MCP transform (`src/util/mcp-transform.ts`); MCP config IO (`src/util/mcp-config-io.ts`)

### Local path {#claude-code-mcp-local}

- Scope: `local`
- Path: Official project scope: <project>/.mcp.json; official local-private scope: current-project entry inside ~/.claude.json

### Global path {#claude-code-mcp-global}

- Scope: `global`
- Path: ~/.claude.json

Restrictions:
- Claude Code distinguishes three official MCP scopes: local-private, project-shared, and user-global.
- Both the project file and the user/local file use JSON with an `mcpServers` object.

Notes:
- This reference maps Claude’s project/private/global model into the repo’s local/global terminology.

## Google Antigravity

- Target support: `supported`
- Repo support: `partial`
- Scopes: [global](#antigravity-mcp-global)
- Format: json
- Reliability: Medium
- Evidence status: `official+implementation`
- Evidence summary: Google docs directly cover Antigravity MCP support and the raw `mcp_config.json` file, but not a stable home-directory path. The repo’s concrete path remains implementation-specific.
- Sources: [Google Developer Knowledge MCP setup for Antigravity](https://developers.google.com/knowledge/mcp); [Google Antigravity Stitch MCP codelab](https://codelabs.developers.google.com/design-to-code-with-antigravity-stitch); Target adapters (`src/targets/adapters.ts`); MCP transform (`src/util/mcp-transform.ts`); MCP config IO (`src/util/mcp-config-io.ts`)

### Global path {#antigravity-mcp-global}

- Scope: `global`
- Path: Official raw config file: `mcp_config.json` via the Antigravity MCP Servers manager; current repo target: ~/.gemini/antigravity/mcp_config.json

Restrictions:
- Google docs show MCP server management through the Antigravity UI and raw `mcp_config.json` editing.
- agent-plugins only targets Antigravity MCP globally.

Notes:
None.

## Openskills

- Target support: `unsupported`
- Repo support: `unsupported`
- Scopes: Undocumented
- Format: —
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Current repo adapters and MCP transforms define supported config files and lossy/incompatible cases.
- Sources: Target adapters (`src/targets/adapters.ts`); MCP transform (`src/util/mcp-transform.ts`); MCP config IO (`src/util/mcp-config-io.ts`)

No scope-specific paths captured.

Restrictions:
None.

Notes:
None.

## Agentskills (Vercel Labs)

- Target support: `unsupported`
- Repo support: `unsupported`
- Scopes: Undocumented
- Format: —
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Current repo adapters and MCP transforms define supported config files and lossy/incompatible cases.
- Sources: Target adapters (`src/targets/adapters.ts`); MCP transform (`src/util/mcp-transform.ts`); MCP config IO (`src/util/mcp-config-io.ts`)

No scope-specific paths captured.

Restrictions:
None.

Notes:
None.

## OpenCode

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#opencode-mcp-local), [global](#opencode-mcp-global)
- Format: json
- Reliability: High
- Evidence status: `official+implementation`
- Evidence summary: OpenCode docs directly cover JSON/JSONC config, the `mcp` config block, and both project/global config locations. The repo’s current `.opencode/mcp.json` adapter path is a documented mismatch.
- Sources: [OpenCode MCP servers](https://opencode.ai/docs/mcp-servers); [OpenCode config](https://opencode.ai/docs/config/); Target adapters (`src/targets/adapters.ts`); MCP transform (`src/util/mcp-transform.ts`); MCP config IO (`src/util/mcp-config-io.ts`)

### Local path {#opencode-mcp-local}

- Scope: `local`
- Path: Official path: <project>/opencode.json

### Global path {#opencode-mcp-global}

- Scope: `global`
- Path: Official path: ~/.config/opencode/opencode.json

Restrictions:
- OpenCode documents MCP servers under the `mcp` key in `opencode.json` or `opencode.jsonc`.
- The repo’s current `.opencode/mcp.json` adapter does not match the documented OpenCode config locations.

Notes:
- Treat OpenCode MCP path handling as a doc-vs-repo mismatch that should be validated before relying on sync behavior.

## Qoder

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#qoder-mcp-local), [global](#qoder-mcp-global)
- Format: json
- Reliability: High
- Evidence status: `official+implementation`
- Evidence summary: Qoder docs directly cover the committed project file and private user file for MCP servers. The repo’s current global adapter path is different and remains a maintenance caveat.
- Sources: [Qoder MCP](https://docs.qoder.com/user-guide/chat/model-context-protocol); [Qoder CLI usage](https://docs.qoder.com/cli/using-cli); Target adapters (`src/targets/adapters.ts`); MCP transform (`src/util/mcp-transform.ts`); MCP config IO (`src/util/mcp-config-io.ts`)

### Local path {#qoder-mcp-local}

- Scope: `local`
- Path: <project>/.mcp.json

### Global path {#qoder-mcp-global}

- Scope: `global`
- Path: ~/.qoder.json

Restrictions:
- Qoder documents the project MCP file as `<project>/.mcp.json`.
- Qoder documents the user-private MCP file as `~/.qoder.json`.
- The repo’s current global MCP adapter uses a different platform-specific cache file, so validate actual sync behavior before relying on it.

Notes:
None.
