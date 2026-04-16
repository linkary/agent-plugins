# Google Antigravity

Reviewed: 2026-04-16

Aliases: antigravity, anti-gravity

Target notes:
- No stable official source was captured during this implementation for Antigravity-specific sync folders.

## skills

- Support: `supported`
- Repo support: `managed`
- Scopes: [local](#antigravity-skills-local), [global](#antigravity-skills-global)
- Format: package
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: [Agent Skills specification](https://agentskills.io/specification); Target adapters (`src/targets/adapters.ts`)

### Local path {#antigravity-skills-local}

- Scope: `local`
- Path: <project>/.agent/skills

### Global path {#antigravity-skills-global}

- Scope: `global`
- Path: ~/.gemini/antigravity/skills

Restrictions:
- No stable official Antigravity skills-directory page was captured during this audit.
- The package layout here follows the open Agent Skills standard and current repo behavior.

Notes:
- Treat these paths as implementation-derived until Google publishes a dedicated skills page.

## commands

- Support: `supported`
- Repo support: `partial`
- Scopes: [local](#antigravity-commands-local), [global](#antigravity-commands-global)
- Format: markdown
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: Target adapters (`src/targets/adapters.ts`); Command transform (`src/util/command-transform.ts`)

### Local path {#antigravity-commands-local}

- Scope: `local`
- Path: <project>/.agent/workflows

### Global path {#antigravity-commands-global}

- Scope: `global`
- Path: ~/.gemini/antigravity/global_workflows

Restrictions:
- agent-plugins maps commands to Antigravity workflows.

Notes:
None.

## agents

- Support: `unsupported`
- Repo support: `unsupported`
- Scopes: Undocumented
- Format: —
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- Unsupported in the current target model.

Notes:
None.

## rules

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#antigravity-rules-local)
- Format: markdown
- Reliability: Low
- Evidence status: `official+implementation`
- Sources: [Google Antigravity getting started codelab](https://codelabs.developers.google.com/getting-started-google-antigravity); Target adapters (`src/targets/adapters.ts`); Rule transform (`src/util/rule-transform.ts`); Rules sync special cases (`src/commands/rules/sync.ts`)

### Local path {#antigravity-rules-local}

- Scope: `local`
- Path: <project>/.agent/rules

Restrictions:
- Google’s Antigravity codelab documents global and workspace rules, including the global `~/.gemini/GEMINI.md` rule file and a workspace rules directory.
- The repo currently maps workspace rules to `<project>/.agent/rules`, but exact workspace file naming and compatibility still need manual validation.

Notes:
None.

## mcp

- Support: `supported`
- Repo support: `partial`
- Scopes: [global](#antigravity-mcp-global)
- Format: json
- Reliability: Medium
- Evidence status: `official+implementation`
- Sources: [Google Developer Knowledge MCP setup for Antigravity](https://developers.google.com/knowledge/mcp); [Google Antigravity Stitch MCP codelab](https://codelabs.developers.google.com/design-to-code-with-antigravity-stitch); Target adapters (`src/targets/adapters.ts`); MCP transform (`src/util/mcp-transform.ts`); MCP config IO (`src/util/mcp-config-io.ts`)

### Global path {#antigravity-mcp-global}

- Scope: `global`
- Path: Official raw config file: `mcp_config.json` via the Antigravity MCP Servers manager; current repo target: ~/.gemini/antigravity/mcp_config.json

Restrictions:
- Google docs show MCP server management through the Antigravity UI and raw `mcp_config.json` editing.
- agent-plugins only targets Antigravity MCP globally.

Notes:
None.

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

- Support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

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
None.

## memory

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [global](#antigravity-memory-global)
- Format: Markdown global instructions
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

### Global path {#antigravity-memory-global}

- Scope: `global`
- Path: ~/.gemini/GEMINI.md

Restrictions:
- This page documents target instruction and memory surfaces that influence behavior but are not repo-managed families.

Notes:
None.

## workflows

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#antigravity-workflows-local), [global](#antigravity-workflows-global)
- Format: Workflow-like markdown files
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: Target adapters (`src/targets/adapters.ts`)

### Local path {#antigravity-workflows-local}

- Scope: `local`
- Path: <project>/.agent/workflows

### Global path {#antigravity-workflows-global}

- Scope: `global`
- Path: ~/.gemini/antigravity/global_workflows

Restrictions:
- agent-plugins currently exposes this surface through the commands adapter.

Notes:
None.
