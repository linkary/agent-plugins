# Qoder

Reviewed: 2026-04-16

Aliases: qoder

Target notes:
- Qoder docs clearly cover rules, commands, subagents, and MCP.

## skills

- Support: `supported`
- Repo support: `managed`
- Scopes: [local](#qoder-skills-local), [global](#qoder-skills-global)
- Format: package
- Reliability: High
- Evidence status: `official+implementation`
- Sources: [Qoder skills](https://docs.qoder.com/cli/Skills); Target adapters (`src/targets/adapters.ts`)

### Local path {#qoder-skills-local}

- Scope: `local`
- Path: <project>/.qoder/skills

### Global path {#qoder-skills-global}

- Scope: `global`
- Path: ~/.qoder/skills

Restrictions:
- Qoder documents package-style skills with `SKILL.md` plus optional supporting files in `.qoder/skills/{skill-name}/SKILL.md` and `~/.qoder/skills/{skill-name}/SKILL.md`.

Notes:
- The official docs follow the Agent Skills package standard.

## commands

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#qoder-commands-local), [global](#qoder-commands-global)
- Format: markdown
- Reliability: Medium
- Evidence status: `official+implementation`
- Sources: [Qoder commands](https://docs.qoder.com/user-guide/commands); Target adapters (`src/targets/adapters.ts`); Command transform (`src/util/command-transform.ts`)

### Local path {#qoder-commands-local}

- Scope: `local`
- Path: <project>/.qoder/commands

### Global path {#qoder-commands-global}

- Scope: `global`
- Path: macOS / Linux: ~/.qoder/commands; Windows: %USERPROFILE%\\.qoder\\commands

Restrictions:
- Qoder documents project and user command scopes separately.
- User-level commands do not sync across devices automatically.

Notes:
- The path coverage is official; the Markdown file-format note here follows the current repo command model rather than an explicit vendor storage-format statement.

## agents

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#qoder-agents-local), [global](#qoder-agents-global)
- Format: markdown
- Reliability: High
- Evidence status: `official+implementation`
- Sources: [Qoder subagents](https://docs.qoder.com/en/cli/user-guide/subagent); Target adapters (`src/targets/adapters.ts`); Agent transform (`src/util/agent-transform.ts`)

### Local path {#qoder-agents-local}

- Scope: `local`
- Path: <project>/.qoder/agents

### Global path {#qoder-agents-global}

- Scope: `global`
- Path: ~/.qoder/agents

Restrictions:
- Qoder documents project-level and user-level Markdown subagent files in `.qoder/agents/<agentName>.md` and `~/.qoder/agents/<agentName>.md`.
- Project-level subagents take precedence over user-level subagents with the same name.
- Manual subagent files use frontmatter-style metadata plus Markdown prompt content.

Notes:
- Qoder’s documented project/user subagent layout matches the repo’s current agent path model.

## rules

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#qoder-rules-local)
- Format: markdown
- Reliability: High
- Evidence status: `official+implementation`
- Sources: [Qoder rules](https://docs.qoder.com/user-guide/rules); [Qoder @ Mention](https://docs.qoder.com/user-guide/chat/context); Target adapters (`src/targets/adapters.ts`); Rule transform (`src/util/rule-transform.ts`); Rules sync special cases (`src/commands/rules/sync.ts`)

### Local path {#qoder-rules-local}

- Scope: `local`
- Path: <project>/.qoder/rules

Restrictions:
- Qoder documents project rules under `.qoder/rules`, and the official `@ Mention` docs explicitly say `.md` files in that directory can be referenced as rules.
- Qoder docs emphasize project rules rather than a user-global rules surface.
- agent-plugins currently limits Qoder rules sync to the local project scope.

Notes:
None.

## mcp

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#qoder-mcp-local), [global](#qoder-mcp-global)
- Format: json
- Reliability: High
- Evidence status: `official+implementation`
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

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#qoder-settings-local), [global](#qoder-settings-global)
- Format: JSON settings / cache files
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

### Local path {#qoder-settings-local}

- Scope: `local`
- Path: <project>/.mcp.json

### Global path {#qoder-settings-global}

- Scope: `global`
- Path: platform-specific Qoder app-data files

Restrictions:
- This page documents target settings that matter to agent-plugins but are not themselves repo-managed families.

Notes:
None.

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
