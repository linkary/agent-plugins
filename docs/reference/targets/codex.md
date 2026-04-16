# Codex

Reviewed: 2026-04-16

Aliases: codex

Target notes:
- OpenAI docs are the strongest source in this manifest because they document multiple Codex surfaces directly.

## skills

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#codex-skills-local), [global](#codex-skills-global)
- Format: package
- Reliability: High
- Evidence status: `official+implementation`
- Sources: [OpenAI Codex skills](https://developers.openai.com/codex/skills); Target adapters (`src/targets/adapters.ts`)

### Local path {#codex-skills-local}

- Scope: `local`
- Path: <project>/.agents/skills

### Global path {#codex-skills-global}

- Scope: `global`
- Path: $HOME/.agents/skills

Restrictions:
- Codex documents repository, user, admin, and system skill locations under `.agents/skills`.
- Admin/system skill locations also exist outside the user and repo scopes.
- The repo still resolves the current project/repository root as the local scope for sync operations.

Notes:
- Official docs describe Codex skill discovery under `.agents/skills` rather than `.codex/skills`.

## commands

- Support: `supported`
- Repo support: `managed`
- Scopes: [local](#codex-commands-local), [global](#codex-commands-global)
- Format: markdown
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: [OpenAI Codex app commands](https://developers.openai.com/codex/app/commands); Target adapters (`src/targets/adapters.ts`); Command transform (`src/util/command-transform.ts`)

### Local path {#codex-commands-local}

- Scope: `local`
- Path: <project>/.codex/commands

### Global path {#codex-commands-global}

- Scope: `global`
- Path: $CODEX_HOME/commands

Restrictions:
- Central commands are normalized from directory-form or file-form into a flat target layout.
- OpenAI’s current Codex docs document built-in slash commands, not a custom on-disk commands directory.

Notes:
- The `.codex/commands` and `$CODEX_HOME/commands` paths are current repo conventions rather than vendor-documented command folders.

## agents

- Support: `supported`
- Repo support: `managed`
- Scopes: [local](#codex-agents-local), [global](#codex-agents-global)
- Format: toml
- Reliability: High
- Evidence status: `official+implementation`
- Sources: [OpenAI Codex subagents](https://developers.openai.com/codex/subagents); Target adapters (`src/targets/adapters.ts`); Agent transform (`src/util/agent-transform.ts`)

### Local path {#codex-agents-local}

- Scope: `local`
- Path: <project>/.codex/agents

### Global path {#codex-agents-global}

- Scope: `global`
- Path: ~/.codex/agents

Restrictions:
- OpenAI documents standalone TOML custom agent files in `.codex/agents/` and `~/.codex/agents/`.
- Each custom agent file must define `name`, `description`, and `developer_instructions`.
- Optional fields such as model, sandbox mode, MCP servers, and skills can also be included in the TOML file.

Notes:
- OpenAI’s documented default user path is `~/.codex/agents`.
- The repo may still resolve Codex home internally, but that implementation detail is not the same thing as the official documented path.

## rules

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#codex-rules-local), [global](#codex-rules-global)
- Format: .rules
- Reliability: Low
- Evidence status: `disputed`
- Sources: [OpenAI Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md); Target adapters (`src/targets/adapters.ts`); Rule transform (`src/util/rule-transform.ts`); Rules sync special cases (`src/commands/rules/sync.ts`)

### Local path {#codex-rules-local}

- Scope: `local`
- Path: <project>/.codex/rules

### Global path {#codex-rules-global}

- Scope: `global`
- Path: $CODEX_HOME/rules

Restrictions:
- OpenAI’s official instruction surface is `AGENTS.md`, not a `.codex/rules` directory.
- Codex rules are execution-policy rules, not prompt rules.
- The `.codex/rules` and `$CODEX_HOME/rules` paths remain repo-specific conventions.

Notes:
None.

## mcp

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#codex-mcp-local), [global](#codex-mcp-global)
- Format: toml
- Reliability: High
- Evidence status: `official+implementation`
- Sources: [OpenAI Codex config reference](https://developers.openai.com/codex/config-reference); [OpenAI Codex MCP](https://developers.openai.com/codex/mcp); Target adapters (`src/targets/adapters.ts`); MCP transform (`src/util/mcp-transform.ts`); MCP config IO (`src/util/mcp-config-io.ts`)

### Local path {#codex-mcp-local}

- Scope: `local`
- Path: <project>/.codex/config.toml

### Global path {#codex-mcp-global}

- Scope: `global`
- Path: ~/.codex/config.toml

Restrictions:
- OpenAI documents MCP configuration in `config.toml` under `[mcp_servers.<server-name>]`.
- OpenAI documents both `~/.codex/config.toml` and project-scoped `.codex/config.toml` in trusted projects.
- Requirements may further constrain which MCP servers may be enabled.
- agent-plugins currently targets Codex MCP through the global config path only and may perform lossy conversion for unsupported fields.

Notes:
None.

## plugins

- Support: `supported`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Plugin package; plugins are the installable distribution unit for skills and apps
- Reliability: Low
- Evidence status: `disputed`
- Sources: [OpenAI Codex skills](https://developers.openai.com/codex/skills); Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

No scope-specific paths captured.

Restrictions:
- Plugins are distinct from skill authoring folders.
- agent-plugins does not currently manage plugins as a first-class family.

Notes:
None.

## hooks

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#codex-hooks-local), [global](#codex-hooks-global)
- Format: hooks.json
- Reliability: Low
- Evidence status: `disputed`
- Sources: [OpenAI Codex hooks](https://developers.openai.com/codex/hooks); Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

### Local path {#codex-hooks-local}

- Scope: `local`
- Path: <project>/.codex/hooks.json

### Global path {#codex-hooks-global}

- Scope: `global`
- Path: ~/.codex/hooks.json

Restrictions:
- Hooks are experimental.
- Hooks are currently disabled on Windows.
- PreToolUse and PostToolUse currently focus on Bash events.
- agent-plugins does not currently manage hooks as a first-class family.

Notes:
None.

## settings

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#codex-settings-local), [global](#codex-settings-global)
- Format: config.toml
- Reliability: Low
- Evidence status: `disputed`
- Sources: [OpenAI Codex config reference](https://developers.openai.com/codex/config-reference); Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

### Local path {#codex-settings-local}

- Scope: `local`
- Path: <project>/.codex/config.toml

### Global path {#codex-settings-global}

- Scope: `global`
- Path: ~/.codex/config.toml

Restrictions:
- Project-scoped config loads only for trusted projects.
- This page documents target settings that matter to agent-plugins but are not themselves repo-managed families.

Notes:
None.

## memory

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#codex-memory-local), [global](#codex-memory-global)
- Format: Markdown instruction files
- Reliability: Low
- Evidence status: `disputed`
- Sources: [OpenAI Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md); Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

### Local path {#codex-memory-local}

- Scope: `local`
- Path: AGENTS.md files from repo root down to the current directory

### Global path {#codex-memory-global}

- Scope: `global`
- Path: ~/.codex/AGENTS.md or ~/.codex/AGENTS.override.md

Restrictions:
- Codex reads at most one instruction file per directory.
- Combined size is capped by project_doc_max_bytes.
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
