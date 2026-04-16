# Gemini CLI

Reviewed: 2026-04-16

Aliases: gemini, gemini-cli

Target notes:
- Gemini CLI docs cover configuration, command surfaces, extensions, and MCP more clearly than fixed local/global sync folders.

## skills

- Support: `supported`
- Repo support: `managed`
- Scopes: [local](#gemini-skills-local), [global](#gemini-skills-global), [shared](#gemini-skills-shared)
- Format: package
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: [Agent Skills specification](https://agentskills.io/specification); Target adapters (`src/targets/adapters.ts`)

### Local path {#gemini-skills-local}

- Scope: `local`
- Path: <project>/.gemini/skills

### Global path {#gemini-skills-global}

- Scope: `global`
- Path: ~/.gemini/skills

### Shared path {#gemini-skills-shared}

- Scope: `shared`
- Path: local owner: <project>/.agents/skills; global owner: ~/.agents/skills
- Note: Organize can promote exact duplicate Gemini skills into the shared .agents/skills destination.
- Path evidence status: `implementation-only`
- Path reliability: Low
- Path evidence summary: The repo can consolidate exact duplicate Gemini skills into the shared .agents/skills destination.
- Path sources: Shared-skill compatibility map (`src/util/organize-compat.ts`); Skills organize flow (`src/commands/skills/organize.ts`); Skills organize tests (`tests/skills-organize.test.ts`)

Restrictions:
- Gemini CLI has no current official skills-directory page in the live docs set I checked.
- The `.gemini/skills` paths and the `.agents/skills` shared note are repo behavior, not vendor-documented Gemini storage.

Notes:
- Keep the shared `.agents/skills` note as implementation-only unless Gemini publishes a dedicated skills page.

## commands

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#gemini-commands-local), [global](#gemini-commands-global)
- Format: toml
- Reliability: High
- Evidence status: `official`
- Sources: [Gemini CLI custom commands](https://google-gemini.github.io/gemini-cli/docs/cli/custom-commands.html)

### Local path {#gemini-commands-local}

- Scope: `local`
- Path: <project>/.gemini/commands

### Global path {#gemini-commands-global}

- Scope: `global`
- Path: ~/.gemini/commands

Restrictions:
- Gemini CLI requires `.toml` command files in `.gemini/commands`.
- Gemini CLI uses TOML v1 for command definitions.
- Project commands override global commands with the same name.
- Subdirectories create namespaced commands such as `/git:commit`.

Notes:
None.

## agents

- Support: `undocumented`
- Repo support: `managed`
- Scopes: [local](#gemini-agents-local), [global](#gemini-agents-global)
- Format: markdown
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: Target adapters (`src/targets/adapters.ts`); Agent transform (`src/util/agent-transform.ts`)

### Local path {#gemini-agents-local}

- Scope: `local`
- Path: <project>/.gemini/agents

### Global path {#gemini-agents-global}

- Scope: `global`
- Path: ~/.gemini/agents

Restrictions:
- No official Gemini CLI page was found during this audit that documents a dedicated agent or subagent directory with an on-disk file format.

Notes:
- The `.gemini/agents` markdown layout is a current repo convention rather than a vendor-documented Gemini CLI storage model.

## rules

- Support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#gemini-rules-local), [global](#gemini-rules-global)
- Format: markdown
- Reliability: Medium
- Evidence status: `disputed`
- Sources: [Gemini CLI GEMINI.md docs](https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html); Target adapters (`src/targets/adapters.ts`); Rule transform (`src/util/rule-transform.ts`); Rules sync special cases (`src/commands/rules/sync.ts`)

### Local path {#gemini-rules-local}

- Scope: `local`
- Path: Official equivalent: `GEMINI.md` files discovered from the current directory up to the repository root; current repo adapter: `<project>/.gemini/rules`

### Global path {#gemini-rules-global}

- Scope: `global`
- Path: Official equivalent: `~/.gemini/GEMINI.md`; current repo adapter: `~/.gemini/rules`

Restrictions:
- Gemini CLI documents hierarchical `GEMINI.md` context files rather than a `.gemini/rules` directory.
- The documented instruction format is Markdown, but the repo currently syncs this surface through a synthetic rules directory.
- Validate path compatibility before relying on Gemini rules sync behavior.

Notes:
None.

## mcp

- Support: `supported`
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

## plugins

- Support: `supported`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Extensions / extension packages
- Reliability: Low
- Evidence status: `disputed`
- Sources: [Gemini CLI extensions](https://google-gemini.github.io/gemini-cli/docs/extensions/); Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

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
- Scopes: [local](#gemini-settings-local), [global](#gemini-settings-global)
- Format: settings.json
- Reliability: Medium
- Evidence status: `official+implementation`
- Sources: [Gemini CLI configuration](https://google-gemini.github.io/gemini-cli/docs/get-started/configuration.html); Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

### Local path {#gemini-settings-local}

- Scope: `local`
- Path: <project>/.gemini/settings.json

### Global path {#gemini-settings-global}

- Scope: `global`
- Path: ~/.gemini/settings.json

Restrictions:
- This page documents target settings that matter to agent-plugins but are not themselves repo-managed families.

Notes:
None.

## memory

- Support: `supported`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: GEMINI.md context files / repository guidance files
- Reliability: Low
- Evidence status: `disputed`
- Sources: [Gemini CLI GEMINI.md docs](https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html); Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

No scope-specific paths captured.

Restrictions:
- Exact memory-file naming is not fully captured in this manifest unless explicitly documented by the target docs.
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
