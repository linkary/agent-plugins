# Claude Code

Reviewed: 2026-04-16

Aliases: claude, claude-code, claudecode

Target notes:
- Anthropic docs cover Claude Code memory, hooks, settings, subagents, slash commands, and MCP directly.

## skills

- Support: `supported`
- Repo support: `partial`
- Scopes: [local](#claude-code-skills-local), [global](#claude-code-skills-global)
- Format: package
- Reliability: High
- Evidence status: `official+implementation`
- Sources: [Claude Code skills](https://code.claude.com/docs/en/skills); Target adapters (`src/targets/adapters.ts`)

### Local path {#claude-code-skills-local}

- Scope: `local`
- Path: <project>/.claude/skills

### Global path {#claude-code-skills-global}

- Scope: `global`
- Path: ~/.claude/skills

Restrictions:
- Claude Code documents package-style skills with `SKILL.md` plus optional supporting files in `.claude/skills/` and `~/.claude/skills/`.

Notes:
- The official docs follow the Agent Skills package standard.

## commands

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#claude-code-commands-local), [global](#claude-code-commands-global)
- Format: markdown
- Reliability: High
- Evidence status: `official`
- Sources: [Claude Code slash commands](https://code.claude.com/docs/en/slash-commands); [Claude Code SDK slash commands](https://code.claude.com/docs/en/agent-sdk/slash-commands)

### Local path {#claude-code-commands-local}

- Scope: `local`
- Path: <project>/.claude/commands

### Global path {#claude-code-commands-global}

- Scope: `global`
- Path: ~/.claude/commands

Restrictions:
- Claude Code documents `.md` command files in `.claude/commands/` and `~/.claude/commands/`.
- Claude Code notes that custom commands have merged into skills, but existing command files still work.
- Command files can use frontmatter plus Markdown body content.

Notes:
- Skills are the recommended long-term surface for richer reusable workflows, but command files remain officially supported.

## agents

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#claude-code-agents-local), [global](#claude-code-agents-global)
- Format: markdown
- Reliability: High
- Evidence status: `official+implementation`
- Sources: [Claude Code subagents](https://code.claude.com/docs/en/sub-agents); Target adapters (`src/targets/adapters.ts`); Agent transform (`src/util/agent-transform.ts`)

### Local path {#claude-code-agents-local}

- Scope: `local`
- Path: <project>/.claude/agents

### Global path {#claude-code-agents-global}

- Scope: `global`
- Path: ~/.claude/agents

Restrictions:
- Claude Code documents Markdown subagent files with YAML frontmatter in `.claude/agents/` and `~/.claude/agents/`.
- The same docs page also covers CLI-defined and plugin-provided subagents as additional sources.
- Plugin subagents do not support the `hooks`, `mcpServers`, or `permissionMode` frontmatter fields.

Notes:
- The repo’s file-based agent model matches Claude Code’s documented subagent file layout.

## rules

- Support: `supported`
- Repo support: `partial`
- Scopes: [local](#claude-code-rules-local), [global](#claude-code-rules-global)
- Format: markdown
- Reliability: High
- Evidence status: `official+implementation`
- Sources: [Claude Code memory](https://code.claude.com/docs/en/memory); Target adapters (`src/targets/adapters.ts`); Global rules store (`src/util/global-rules-store.ts`)

### Local path {#claude-code-rules-local}

- Scope: `local`
- Path: <project>/.claude/rules

### Global path {#claude-code-rules-global}

- Scope: `global`
- Path: Official path: `~/.claude/rules`; current repo behavior: `~/.claude/CLAUDE.md` via the global-rules store

Restrictions:
- Claude Code documents Markdown rule files in `.claude/rules/` and `~/.claude/rules/`.
- `CLAUDE.md` remains a broader memory surface and is separate from the dedicated rules directories.
- agent-plugins does not currently sync Claude Code global rules to the documented `~/.claude/rules` directory.
- In the current repo, Claude global rules flow through `~/.claude/CLAUDE.md`, and `resolveRulesDir` does not provide a global rules directory.

Notes:
None.

## mcp

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#claude-code-mcp-local), [global](#claude-code-mcp-global)
- Format: json
- Reliability: High
- Evidence status: `official+implementation`
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
- Format: Claude Code hooks configuration
- Reliability: Low
- Evidence status: `disputed`
- Sources: [Anthropic Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks); Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

No scope-specific paths captured.

Restrictions:
- Hook events and config semantics are defined by Claude Code docs.
- agent-plugins does not currently manage hooks as a first-class family.

Notes:
None.

## settings

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#claude-code-settings-local), [global](#claude-code-settings-global)
- Format: Claude Code settings files
- Reliability: Low
- Evidence status: `disputed`
- Sources: [Anthropic Claude Code settings](https://docs.anthropic.com/en/docs/claude-code/settings); Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

### Local path {#claude-code-settings-local}

- Scope: `local`
- Path: <project>/.mcp.json

### Global path {#claude-code-settings-global}

- Scope: `global`
- Path: ~/.claude.json

Restrictions:
- This page documents target settings that matter to agent-plugins but are not themselves repo-managed families.

Notes:
None.

## memory

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#claude-code-memory-local), [global](#claude-code-memory-global)
- Format: CLAUDE.md memory / instruction files
- Reliability: Low
- Evidence status: `disputed`
- Sources: [Anthropic Claude Code memory](https://docs.anthropic.com/en/docs/claude-code/memory); Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

### Local path {#claude-code-memory-local}

- Scope: `local`
- Path: <project>/CLAUDE.md and nested CLAUDE.md files

### Global path {#claude-code-memory-global}

- Scope: `global`
- Path: ~/.claude/CLAUDE.md

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
