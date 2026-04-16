# Cursor

Reviewed: 2026-04-16

Aliases: cursor

Target notes:
- Cursor docs clearly cover rules, MCP, and background-agent webhook surfaces, but some exact path conventions remain implementation-derived.

## skills

- Support: `supported`
- Repo support: `managed`
- Scopes: [local](#cursor-skills-local), [global](#cursor-skills-global)
- Format: package
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: [Agent Skills specification](https://agentskills.io/specification); Target adapters (`src/targets/adapters.ts`)

### Local path {#cursor-skills-local}

- Scope: `local`
- Path: <project>/.cursor/skills

### Global path {#cursor-skills-global}

- Scope: `global`
- Path: ~/.cursor/skills

Restrictions:
- Cursor does not currently have an official skills-directory page in the live docs set I checked.
- The package layout here is repo behavior mapped to the open Agent Skills standard.

Notes:
- Treat these paths as implementation-derived until Cursor publishes a dedicated skills page.

## commands

- Support: `supported`
- Repo support: `managed`
- Scopes: [local](#cursor-commands-local), [global](#cursor-commands-global)
- Format: markdown
- Reliability: High
- Evidence status: `official+implementation`
- Sources: [Cursor commands](https://docs.cursor.com/en/agent/chat/commands); Target adapters (`src/targets/adapters.ts`); Command transform (`src/util/command-transform.ts`)

### Local path {#cursor-commands-local}

- Scope: `local`
- Path: <project>/.cursor/commands

### Global path {#cursor-commands-global}

- Scope: `global`
- Path: ~/.cursor/commands

Restrictions:
- Cursor documents plain Markdown command files in `.cursor/commands` and `~/.cursor/commands`.
- Cursor loads commands from both directories when you type `/`.
- Commands are currently in beta.

Notes:
- agent-plugins uses the same documented Markdown directory layout for Cursor commands.

## agents

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#cursor-agents-local), [global](#cursor-agents-global)
- Format: markdown
- Reliability: Low
- Evidence status: `disputed`
- Sources: [Cursor modes](https://docs.cursor.com/agent/modes); Target adapters (`src/targets/adapters.ts`); Agent transform (`src/util/agent-transform.ts`)

### Local path {#cursor-agents-local}

- Scope: `local`
- Path: <project>/.cursor/agents

### Global path {#cursor-agents-global}

- Scope: `global`
- Path: ~/.cursor/agents

Restrictions:
- Cursor officially documents custom modes as a settings-managed feature with configurable tools and instructions.
- Cursor does not currently document a `.cursor/agents` folder or a Markdown-on-disk custom-mode format on the linked page.
- The repo currently maps this surface to markdown files under `.cursor/agents` and `~/.cursor/agents`.

Notes:
- Treat the paths and markdown format here as repo behavior layered on top of Cursor’s documented custom-mode feature.

## rules

- Support: `supported`
- Repo support: `managed`
- Scopes: [local](#cursor-rules-local), [global](#cursor-rules-global)
- Format: mdc + text
- Reliability: Medium
- Evidence status: `official+implementation`
- Sources: [Cursor rules](https://docs.cursor.com/en/context); Target adapters (`src/targets/adapters.ts`); Rule transform (`src/util/rule-transform.ts`); Rules sync special cases (`src/commands/rules/sync.ts`); Cursor user-rules storage (`src/util/cursor-user-rules.ts`)

### Local path {#cursor-rules-local}

- Scope: `local`
- Path: <project>/.cursor/rules

### Global path {#cursor-rules-global}

- Scope: `global`
- Path: Cursor user rules via Knowledge Base API; legacy macOS fallback: ~/Library/Application Support/Cursor/User/globalStorage/state.vscdb#aicontext.personalContext; override: $AP_CURSOR_USER_RULES_FILE

Restrictions:
- Cursor documents project rules as `.mdc` files in `.cursor/rules`.
- Cursor also documents user rules, but it does not fully specify the storage backend that agent-plugins reads and writes.
- The exact global storage backend used by agent-plugins is implementation-defined rather than fully vendor-specified.
- Global rules use Cursor user-rules storage rather than the `.cursor/rules` directory.
- agent-plugins currently supports Cursor global rules through the Knowledge Base API, SQLite fallback, or AP_CURSOR_USER_RULES_FILE override.

Notes:
None.

## mcp

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#cursor-mcp-local), [global](#cursor-mcp-global)
- Format: json
- Reliability: High
- Evidence status: `official+implementation`
- Sources: [Cursor MCP](https://cursor.com/docs/mcp); [Google Developer Knowledge MCP setup for Cursor](https://developers.google.com/knowledge/mcp); Target adapters (`src/targets/adapters.ts`); MCP transform (`src/util/mcp-transform.ts`); MCP config IO (`src/util/mcp-config-io.ts`)

### Local path {#cursor-mcp-local}

- Scope: `local`
- Path: <project>/.cursor/mcp.json

### Global path {#cursor-mcp-global}

- Scope: `global`
- Path: ~/.cursor/mcp.json

Restrictions:
- Cursor documents JSON `mcp.json` files in `.cursor/mcp.json` and `~/.cursor/mcp.json`.
- Cursor also supports one-click installs and extension-driven MCP registration outside manual file editing.

Notes:
- The repo’s current MCP adapter matches Cursor’s documented JSON file layout.

## plugins

- Support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage plugins as a first-class family.

Notes:
None.

## hooks

- Support: `supported`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Background-agent webhooks / automation
- Reliability: Low
- Evidence status: `disputed`
- Sources: [Cursor background-agent webhooks](https://docs.cursor.com/background-agent/api/webhooks); Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage hooks as a first-class family.

Notes:
None.

## settings

- Support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

No scope-specific paths captured.

Restrictions:
- This page documents target settings that matter to agent-plugins but are not themselves repo-managed families.

Notes:
- The repo currently documents MCP and rules paths more clearly than a broader Cursor settings file layout.

## memory

- Support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

No scope-specific paths captured.

Restrictions:
- This page documents target instruction and memory surfaces that influence behavior but are not repo-managed families.

Notes:
None.

## workflows

- Support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
None.

Notes:
None.
