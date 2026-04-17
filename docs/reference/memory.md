# Memory Reference

Reviewed: 2026-04-17

This page is official-doc-first. Vendor docs are treated as authoritative. Current repo behavior is only used to fill gaps and is labeled in the evidence status.

| Target | Support | Repo Support | Scopes | Format | Reliability |
| --- | --- | --- | --- | --- | --- |
| Cursor | undocumented | documented-only | Undocumented | — | Low |
| [Gemini CLI](https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html) | supported | documented-only | Undocumented | markdown | Low |
| [Codex](https://developers.openai.com/codex/guides/agents-md) | supported | documented-only | [local](#codex-memory-local), [global](#codex-memory-global) | markdown | Low |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code/memory) | supported | documented-only | [local](#claude-code-memory-local), [global](#claude-code-memory-global) | markdown | Low |
| Google Antigravity | supported | documented-only | [global](#antigravity-memory-global) | markdown | Low |
| Openskills | undocumented | documented-only | Undocumented | — | Low |
| Agentskills (Vercel Labs) | undocumented | documented-only | Undocumented | — | Low |
| OpenCode | undocumented | documented-only | Undocumented | — | Low |
| Qoder | undocumented | documented-only | Undocumented | — | Low |

## Cursor

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Memory surfaces are documented from target docs and current global-rules behavior rather than a dedicated repo-managed family.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- This page documents target instruction and memory surfaces that influence behavior but are not repo-managed families.

Notes:
None.

## Gemini CLI

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: GEMINI.md context files / repository guidance files
- Reliability: Low
- Evidence status: `disputed`
- Evidence summary: Official docs and current implementation differ on: support.
- Sources: [Gemini CLI GEMINI.md docs](https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html); Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- Exact memory-file naming is not fully captured in this manifest unless explicitly documented by the target docs.
- This page documents target instruction and memory surfaces that influence behavior but are not repo-managed families.

Notes:
None.

## Codex

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#codex-memory-local), [global](#codex-memory-global)
- Format: Markdown instruction files
- Reliability: Low
- Evidence status: `disputed`
- Evidence summary: Official docs and current implementation differ on: local path, global path.
- Sources: [OpenAI Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md); Target adapters (`src/targets/adapters.ts`)

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

## Claude Code

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#claude-code-memory-local), [global](#claude-code-memory-global)
- Format: CLAUDE.md memory / instruction files
- Reliability: Low
- Evidence status: `disputed`
- Evidence summary: Official docs and current implementation differ on: format.
- Sources: [Anthropic Claude Code memory](https://docs.anthropic.com/en/docs/claude-code/memory); Target adapters (`src/targets/adapters.ts`)

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

## Google Antigravity

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [global](#antigravity-memory-global)
- Format: Markdown global instructions
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Memory surfaces are documented from target docs and current global-rules behavior rather than a dedicated repo-managed family.
- Sources: Target adapters (`src/targets/adapters.ts`)

### Global path {#antigravity-memory-global}

- Scope: `global`
- Path: ~/.gemini/GEMINI.md

Restrictions:
- This page documents target instruction and memory surfaces that influence behavior but are not repo-managed families.

Notes:
None.

## Openskills

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Memory surfaces are documented from target docs and current global-rules behavior rather than a dedicated repo-managed family.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- This page documents target instruction and memory surfaces that influence behavior but are not repo-managed families.

Notes:
None.

## Agentskills (Vercel Labs)

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Memory surfaces are documented from target docs and current global-rules behavior rather than a dedicated repo-managed family.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- This page documents target instruction and memory surfaces that influence behavior but are not repo-managed families.

Notes:
None.

## OpenCode

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Memory surfaces are documented from target docs and current global-rules behavior rather than a dedicated repo-managed family.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- This page documents target instruction and memory surfaces that influence behavior but are not repo-managed families.

Notes:
None.

## Qoder

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Memory surfaces are documented from target docs and current global-rules behavior rather than a dedicated repo-managed family.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- This page documents target instruction and memory surfaces that influence behavior but are not repo-managed families.

Notes:
None.
