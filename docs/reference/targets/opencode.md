# OpenCode

Reviewed: 2026-04-16

Aliases: opencode, open-code

Target notes:
- OpenCode docs clearly cover agents, commands, config, plugins, and MCP.

## skills

- Support: `supported`
- Repo support: `managed`
- Scopes: [local](#opencode-skills-local), [global](#opencode-skills-global), [shared](#opencode-skills-shared)
- Format: package
- Reliability: Medium
- Evidence status: `official+implementation`
- Sources: [OpenCode skills](https://opencode.ai/docs/skills); Target adapters (`src/targets/adapters.ts`)

### Local path {#opencode-skills-local}

- Scope: `local`
- Path: <project>/.opencode/skills

### Global path {#opencode-skills-global}

- Scope: `global`
- Path: ~/.config/opencode/skills

### Shared path {#opencode-skills-shared}

- Scope: `shared`
- Path: <project>/.agents/skills; ~/.agents/skills
- Note: OpenCode also discovers Claude-compatible skill packages under <project>/.claude/skills.

Restrictions:
- OpenCode documents package-style skills in `.opencode/skills/` and `~/.config/opencode/skills/`.
- OpenCode also supports compatibility discovery under `.claude/skills` and `.agents/skills`.

Notes:
- This page tracks the official on-disk skill layout plus the compatibility roots that OpenCode also recognizes.

## commands

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#opencode-commands-local), [global](#opencode-commands-global)
- Format: markdown
- Reliability: High
- Evidence status: `official+implementation`
- Sources: [OpenCode commands](https://opencode.ai/docs/commands/); Target adapters (`src/targets/adapters.ts`); Command transform (`src/util/command-transform.ts`)

### Local path {#opencode-commands-local}

- Scope: `local`
- Path: <project>/.opencode/commands

### Global path {#opencode-commands-global}

- Scope: `global`
- Path: ~/.config/opencode/commands

Restrictions:
- OpenCode documents Markdown command files in `.opencode/commands/` and `~/.config/opencode/commands/`.
- OpenCode also supports defining commands in config JSON.

Notes:
- This page tracks the on-disk command-directory layout rather than the JSON config alternative.

## agents

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#opencode-agents-local), [global](#opencode-agents-global)
- Format: markdown
- Reliability: Medium
- Evidence status: `disputed`
- Sources: [OpenCode agents](https://opencode.ai/docs/agents/); Target adapters (`src/targets/adapters.ts`); Agent transform (`src/util/agent-transform.ts`)

### Local path {#opencode-agents-local}

- Scope: `local`
- Path: <project>/.opencode/agents

### Global path {#opencode-agents-global}

- Scope: `global`
- Path: Official docs: ~/.config/opencode/agents; current repo adapter: ~/.opencode/agents

Restrictions:
- OpenCode officially supports Markdown agent files in `.opencode/agents/` and `~/.config/opencode/agents/`.
- OpenCode also supports defining agents in `opencode.json`.
- The repo’s current global agent adapter path does not yet match the documented OpenCode global agents directory.

Notes:
- Treat the OpenCode global agent path as a doc-vs-repo mismatch that should be validated before relying on sync behavior.

## rules

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#opencode-rules-local), [global](#opencode-rules-global)
- Format: markdown
- Reliability: Medium
- Evidence status: `disputed`
- Sources: [OpenCode rules](https://opencode.ai/docs/rules); Target adapters (`src/targets/adapters.ts`); Rule transform (`src/util/rule-transform.ts`); Rules sync special cases (`src/commands/rules/sync.ts`)

### Local path {#opencode-rules-local}

- Scope: `local`
- Path: Official equivalent: `<project>/AGENTS.md`; current repo adapter: `<project>/.opencode/rules`

### Global path {#opencode-rules-global}

- Scope: `global`
- Path: Official equivalent: `~/.config/opencode/AGENTS.md`; current repo adapter: `~/.opencode/rules`

Restrictions:
- OpenCode documents rule-like instructions through Markdown `AGENTS.md` files, not a `.opencode/rules` directory.
- The repo currently exposes rules through a synthetic local/global rules directory, so path compatibility should be validated before relying on sync behavior.

Notes:
None.

## mcp

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#opencode-mcp-local), [global](#opencode-mcp-global)
- Format: json
- Reliability: High
- Evidence status: `official+implementation`
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

## plugins

- Support: `supported`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: OpenCode plugins
- Reliability: Low
- Evidence status: `disputed`
- Sources: [OpenCode plugins](https://opencode.ai/docs/plugins/); Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

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
- Scopes: [local](#opencode-settings-local), [global](#opencode-settings-global)
- Format: OpenCode config
- Reliability: Low
- Evidence status: `disputed`
- Sources: [OpenCode config](https://opencode.ai/docs/config/); Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

### Local path {#opencode-settings-local}

- Scope: `local`
- Path: <project>/.opencode

### Global path {#opencode-settings-global}

- Scope: `global`
- Path: ~/.opencode

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
