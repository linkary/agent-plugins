# Agents Reference

Reviewed: 2026-04-26

This page is official-doc-first. Vendor docs are treated as authoritative. Current repo behavior is only used to fill gaps and is labeled in the evidence status.

| Target | Support | Repo Support | Scopes | Shared .agents | Format | Reliability |
| --- | --- | --- | --- | --- | --- | --- |
| [Cursor](https://docs.cursor.com/agent/modes) | supported | documented-only | [local](#cursor-agents-local), [global](#cursor-agents-global) | unsupported | markdown | Medium |
| [Gemini CLI](https://geminicli.com/docs/agents) | supported | managed | [local](#gemini-agents-local), [global](#gemini-agents-global) | not documented | markdown | Medium |
| [Codex](https://developers.openai.com/codex/subagents) | supported | managed | [local](#codex-agents-local), [global](#codex-agents-global) | unsupported | toml | High |
| [Claude Code](https://code.claude.com/docs/en/sub-agents) | supported | documented-only | [local](#claude-code-agents-local), [global](#claude-code-agents-global) | unsupported | markdown | High |
| Google Antigravity | unsupported | unsupported | Undocumented | unsupported | — | Low |
| Agentskills | unsupported | unsupported | Undocumented | unsupported | — | Low |
| [OpenCode](https://opencode.ai/docs/agents/) | supported | documented-only | [local](#opencode-agents-local), [global](#opencode-agents-global) | unsupported | markdown | Medium |
| [Qoder](https://docs.qoder.com/en/cli/user-guide/subagent) | supported | documented-only | [local](#qoder-agents-local), [global](#qoder-agents-global) | unsupported | markdown | High |

## Cursor

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#cursor-agents-local), [global](#cursor-agents-global)
- Shared .agents support: `unsupported`
- Format: markdown
- Reliability: Medium
- Evidence status: `official+implementation`
- Evidence summary: Cursor now officially documents subagent discovery at `.cursor/agents/` and `~/.cursor/agents/`. The repo's markdown agent layout matches the vendor-documented model.
- Sources: [Cursor agents](https://docs.cursor.com/agent/modes); Target adapters (`src/targets/adapters.ts`); Agent transform (`src/util/agent-transform.ts`)

### Local path {#cursor-agents-local}

- Scope: `local`
- Path: <project>/.cursor/agents

### Global path {#cursor-agents-global}

- Scope: `global`
- Path: ~/.cursor/agents

Restrictions:
- Cursor documents subagents as specialized, independent AI instances in `.cursor/agents/` (project) and `~/.cursor/agents/` (global).
- Subagents operate with isolated context and are delegated to by the parent agent.

Notes:
- The repo's file-based agent model matches Cursor's documented subagent directory layout.

## Gemini CLI

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#gemini-agents-local), [global](#gemini-agents-global)
- Shared .agents support: `not documented`
- Format: markdown
- Reliability: Medium
- Evidence status: `official+implementation`
- Evidence summary: Gemini CLI officially documents subagents ("specialists") as Markdown files with YAML frontmatter in `.gemini/agents/` and `~/.gemini/agents/`. The repo's adapter matches this layout.
- Sources: [Gemini CLI agents](https://geminicli.com/docs/agents); Target adapters (`src/targets/adapters.ts`); Agent transform (`src/util/agent-transform.ts`)

### Local path {#gemini-agents-local}

- Scope: `local`
- Path: <project>/.gemini/agents

### Global path {#gemini-agents-global}

- Scope: `global`
- Path: ~/.gemini/agents

Restrictions:
- Gemini CLI documents subagents as Markdown files with YAML frontmatter defining `name`, `description`, `model`, `tools`, and `mcpServers`.
- Subagents operate with isolated context to prevent context rot.
- Management via `/agents list`, `/agents reload`, and `/agents config` commands within the CLI.

Notes:
- Gemini also supports `.agents/` as a compatibility alias for agents discovery alongside `.gemini/`, though this is less prominently documented than the skills compatibility path.

## Codex

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#codex-agents-local), [global](#codex-agents-global)
- Shared .agents support: `unsupported`
- Format: toml
- Reliability: High
- Evidence status: `official+implementation`
- Evidence summary: OpenAI directly documents standalone TOML custom agent files in `.codex/agents/` and `~/.codex/agents/`. The repo’s agent handling matches the documented TOML file format.
- Sources: [OpenAI Codex subagents](https://developers.openai.com/codex/subagents); Target adapters (`src/targets/adapters.ts`); Agent transform (`src/util/agent-transform.ts`)

### Local path {#codex-agents-local}

- Scope: `local`
- Path: <project>/.codex/agents

### Global path {#codex-agents-global}

- Scope: `global`
- Path: ~/.codex/agents

Restrictions:
- OpenAI documents one standalone TOML file per custom agent in `.codex/agents/` and `~/.codex/agents/`.
- Each file must define `name`, `description`, and `developer_instructions`.
- Optional settings such as model, sandbox mode, MCP servers, and skills inherit from the parent session when omitted.

Notes:
- The official default user path is `~/.codex/agents`.
- The repo may still abstract Codex home resolution internally, but that abstraction is separate from the vendor-documented default path.

## Claude Code

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#claude-code-agents-local), [global](#claude-code-agents-global)
- Shared .agents support: `unsupported`
- Format: markdown
- Reliability: High
- Evidence status: `official+implementation`
- Evidence summary: Anthropic directly documents Markdown subagent files with YAML frontmatter in `.claude/agents/` and `~/.claude/agents/`, and the repo follows that layout.
- Sources: [Claude Code subagents](https://code.claude.com/docs/en/sub-agents); Target adapters (`src/targets/adapters.ts`); Agent transform (`src/util/agent-transform.ts`)

### Local path {#claude-code-agents-local}

- Scope: `local`
- Path: <project>/.claude/agents

### Global path {#claude-code-agents-global}

- Scope: `global`
- Path: ~/.claude/agents

Restrictions:
- Claude Code documents Markdown subagent files with YAML frontmatter in `.claude/agents/` and `~/.claude/agents/`.
- Subagents can also be defined by CLI flag or installed plugins, but file-based project and user agents use the documented Markdown layout.
- Plugin subagents do not support the `hooks`, `mcpServers`, or `permissionMode` frontmatter fields.

Notes:
- The repo’s file-based agent model matches Claude Code’s documented subagent file layout.

## Google Antigravity

- Target support: `unsupported`
- Repo support: `unsupported`
- Scopes: Undocumented
- Shared .agents support: `unsupported`
- Format: —
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: The current repo target model marks Antigravity as not supporting agent sync.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- Unsupported in the current target model.

Notes:
None.

## Agentskills

- Target support: `unsupported`
- Repo support: `unsupported`
- Scopes: Undocumented
- Shared .agents support: `unsupported`
- Format: —
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: The current repo target model marks the Agents target as not supporting agent sync.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- Unsupported in the current target model.

Notes:
None.

## OpenCode

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#opencode-agents-local), [global](#opencode-agents-global)
- Shared .agents support: `unsupported`
- Format: markdown
- Reliability: Medium
- Evidence status: `disputed`
- Evidence summary: OpenCode officially documents Markdown agent files and both scopes, but the repo’s global path still differs from the vendor docs.
- Sources: [OpenCode agents](https://opencode.ai/docs/agents/); Target adapters (`src/targets/adapters.ts`); Agent transform (`src/util/agent-transform.ts`)

### Local path {#opencode-agents-local}

- Scope: `local`
- Path: <project>/.opencode/agents

### Global path {#opencode-agents-global}

- Scope: `global`
- Path: Official docs: ~/.config/opencode/agents; current repo adapter: ~/.opencode/agents

Restrictions:
- OpenCode officially supports both JSON-defined agents in `opencode.json` and Markdown agent files in `.opencode/agents/` and `~/.config/opencode/agents/`.
- The repo’s current global adapter path does not yet match the documented OpenCode global agents directory.

Notes:
- Treat the OpenCode global agents path as a known doc-vs-repo mismatch to fix or validate before relying on sync behavior.

## Qoder

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#qoder-agents-local), [global](#qoder-agents-global)
- Shared .agents support: `unsupported`
- Format: markdown
- Reliability: High
- Evidence status: `official+implementation`
- Evidence summary: Qoder directly documents Markdown subagent files in both `.qoder/agents/` and `~/.qoder/agents/`, and the repo follows that layout.
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
