# Settings Reference

Reviewed: 2026-04-17

This page is official-doc-first. Vendor docs are treated as authoritative. Current repo behavior is only used to fill gaps and is labeled in the evidence status.

| Target | Support | Repo Support | Scopes | Format | Reliability |
| --- | --- | --- | --- | --- | --- |
| Cursor | undocumented | documented-only | Undocumented | — | Low |
| [Gemini CLI](https://google-gemini.github.io/gemini-cli/docs/get-started/configuration.html) | supported | documented-only | [local](#gemini-settings-local), [global](#gemini-settings-global) | json | Medium |
| [Codex](https://developers.openai.com/codex/config-reference) | supported | documented-only | [local](#codex-settings-local), [global](#codex-settings-global) | toml | Low |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code/settings) | supported | documented-only | [local](#claude-code-settings-local), [global](#claude-code-settings-global) | json | Low |
| Google Antigravity | undocumented | documented-only | Undocumented | — | Low |
| Agentskills | undocumented | documented-only | Undocumented | — | Low |
| [OpenCode](https://opencode.ai/docs/config/) | supported | documented-only | [local](#opencode-settings-local), [global](#opencode-settings-global) | json | Low |
| Qoder | supported | documented-only | [local](#qoder-settings-local), [global](#qoder-settings-global) | json | Low |

## Cursor

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Settings are documented from target docs and current adapter behavior rather than a dedicated repo-managed family.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- This page documents target settings that matter to agent-plugins but are not themselves repo-managed families.

Notes:
- The repo currently documents MCP and rules paths more clearly than a broader Cursor settings file layout.

## Gemini CLI

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#gemini-settings-local), [global](#gemini-settings-global)
- Format: settings.json
- Reliability: Medium
- Evidence status: `official+implementation`
- Evidence summary: Official docs cover this surface, with current implementation filling gaps for: local path, global path.
- Sources: [Gemini CLI configuration](https://google-gemini.github.io/gemini-cli/docs/get-started/configuration.html); Target adapters (`src/targets/adapters.ts`)

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

## Codex

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#codex-settings-local), [global](#codex-settings-global)
- Format: config.toml
- Reliability: Low
- Evidence status: `disputed`
- Evidence summary: Official docs and current implementation differ on: global path.
- Sources: [OpenAI Codex config reference](https://developers.openai.com/codex/config-reference); Target adapters (`src/targets/adapters.ts`)

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

## Claude Code

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#claude-code-settings-local), [global](#claude-code-settings-global)
- Format: Claude Code settings files
- Reliability: Low
- Evidence status: `disputed`
- Evidence summary: Official docs and current implementation differ on: format.
- Sources: [Anthropic Claude Code settings](https://docs.anthropic.com/en/docs/claude-code/settings); Target adapters (`src/targets/adapters.ts`)

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

## Google Antigravity

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Settings are documented from target docs and current adapter behavior rather than a dedicated repo-managed family.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- This page documents target settings that matter to agent-plugins but are not themselves repo-managed families.

Notes:
None.

## Agentskills

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Settings are documented from target docs and current adapter behavior rather than a dedicated repo-managed family.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- This page documents target settings that matter to agent-plugins but are not themselves repo-managed families.

Notes:
None.

## OpenCode

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#opencode-settings-local), [global](#opencode-settings-global)
- Format: OpenCode config
- Reliability: Low
- Evidence status: `disputed`
- Evidence summary: Official docs and current implementation differ on: format.
- Sources: [OpenCode config](https://opencode.ai/docs/config/); Target adapters (`src/targets/adapters.ts`)

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

## Qoder

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#qoder-settings-local), [global](#qoder-settings-global)
- Format: JSON settings / cache files
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Settings are documented from target docs and current adapter behavior rather than a dedicated repo-managed family.
- Sources: Target adapters (`src/targets/adapters.ts`)

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
