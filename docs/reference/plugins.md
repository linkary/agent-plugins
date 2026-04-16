# Plugins Reference

Generated: 2026-04-15

This page is official-doc-first. Vendor docs are treated as authoritative. Current repo behavior is only used to fill gaps and is labeled in the evidence status.

| Target | Support | Repo Support | Scopes | Format | Reliability |
| --- | --- | --- | --- | --- | --- |
| [Cursor](./targets/cursor.md) | undocumented | documented-only | Undocumented | — | Low |
| [Gemini CLI](./targets/gemini.md) | supported | documented-only | Undocumented | package | Low |
| [Codex](./targets/codex.md) | supported | documented-only | Undocumented | package | Low |
| [Claude Code](./targets/claude-code.md) | undocumented | documented-only | Undocumented | — | Low |
| [Google Antigravity](./targets/antigravity.md) | undocumented | documented-only | Undocumented | — | Low |
| [Openskills](./targets/openskills.md) | undocumented | documented-only | Undocumented | — | Low |
| [Agentskills (Vercel Labs)](./targets/agents.md) | undocumented | documented-only | Undocumented | — | Low |
| [OpenCode](./targets/opencode.md) | supported | documented-only | Undocumented | package | Low |
| [Qoder](./targets/qoder.md) | undocumented | documented-only | Undocumented | — | Low |

## Cursor

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed plugin surface exists; only documentation can be generated here.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage plugins as a first-class family.

Notes:
None.

## Gemini CLI

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Extensions / extension packages
- Reliability: Low
- Evidence status: `disputed`
- Evidence summary: Official docs and current implementation differ on: support.
- Sources: [Gemini CLI extensions](https://google-gemini.github.io/gemini-cli/docs/extensions/); Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage plugins as a first-class family.

Notes:
None.

## Codex

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Plugin package; plugins are the installable distribution unit for skills and apps
- Reliability: Low
- Evidence status: `disputed`
- Evidence summary: Official docs and current implementation differ on: support.
- Sources: [OpenAI Codex skills](https://developers.openai.com/codex/skills); Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- Plugins are distinct from skill authoring folders.
- agent-plugins does not currently manage plugins as a first-class family.

Notes:
None.

## Claude Code

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed plugin surface exists; only documentation can be generated here.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage plugins as a first-class family.

Notes:
None.

## Google Antigravity

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed plugin surface exists; only documentation can be generated here.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage plugins as a first-class family.

Notes:
None.

## Openskills

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed plugin surface exists; only documentation can be generated here.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage plugins as a first-class family.

Notes:
None.

## Agentskills (Vercel Labs)

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed plugin surface exists; only documentation can be generated here.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage plugins as a first-class family.

Notes:
None.

## OpenCode

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: OpenCode plugins
- Reliability: Low
- Evidence status: `disputed`
- Evidence summary: Official docs and current implementation differ on: support.
- Sources: [OpenCode plugins](https://opencode.ai/docs/plugins/); Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage plugins as a first-class family.

Notes:
None.

## Qoder

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed plugin surface exists; only documentation can be generated here.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage plugins as a first-class family.

Notes:
None.
