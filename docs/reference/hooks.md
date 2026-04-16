# Hooks Reference

Generated: 2026-04-15

This page is official-doc-first. Vendor docs are treated as authoritative. Current repo behavior is only used to fill gaps and is labeled in the evidence status.

| Target | Support | Repo Support | Scopes | Format | Reliability |
| --- | --- | --- | --- | --- | --- |
| [Cursor](./targets/cursor.md#hooks) | supported | documented-only | Undocumented | webhook | Low |
| [Gemini CLI](./targets/gemini.md#hooks) | undocumented | documented-only | Undocumented | — | Low |
| [Codex](./targets/codex.md#hooks) | supported | documented-only | [local](#codex-hooks-local), [global](#codex-hooks-global) | json | Low |
| [Claude Code](./targets/claude-code.md#hooks) | supported | documented-only | Undocumented | json | Low |
| [Google Antigravity](./targets/antigravity.md#hooks) | undocumented | documented-only | Undocumented | — | Low |
| [Openskills](./targets/openskills.md#hooks) | undocumented | documented-only | Undocumented | — | Low |
| [Agentskills (Vercel Labs)](./targets/agents.md#hooks) | undocumented | documented-only | Undocumented | — | Low |
| [OpenCode](./targets/opencode.md#hooks) | undocumented | documented-only | Undocumented | — | Low |
| [Qoder](./targets/qoder.md#hooks) | undocumented | documented-only | Undocumented | — | Low |

## Cursor

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Background-agent webhooks / automation
- Reliability: Low
- Evidence status: `disputed`
- Evidence summary: Official docs and current implementation differ on: support.
- Sources: [Cursor background-agent webhooks](https://docs.cursor.com/background-agent/api/webhooks); Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage hooks as a first-class family.

Notes:
None.

## Gemini CLI

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed hook surface exists; only documentation can be generated here.
- Sources: Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage hooks as a first-class family.

Notes:
None.

## Codex

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#codex-hooks-local), [global](#codex-hooks-global)
- Format: hooks.json
- Reliability: Low
- Evidence status: `disputed`
- Evidence summary: Official docs and current implementation differ on: support.
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

## Claude Code

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Claude Code hooks configuration
- Reliability: Low
- Evidence status: `disputed`
- Evidence summary: Official docs and current implementation differ on: support.
- Sources: [Anthropic Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks); Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

No scope-specific paths captured.

Restrictions:
- Hook events and config semantics are defined by Claude Code docs.
- agent-plugins does not currently manage hooks as a first-class family.

Notes:
None.

## Google Antigravity

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed hook surface exists; only documentation can be generated here.
- Sources: Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage hooks as a first-class family.

Notes:
None.

## Openskills

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed hook surface exists; only documentation can be generated here.
- Sources: Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage hooks as a first-class family.

Notes:
None.

## Agentskills (Vercel Labs)

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed hook surface exists; only documentation can be generated here.
- Sources: Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage hooks as a first-class family.

Notes:
None.

## OpenCode

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed hook surface exists; only documentation can be generated here.
- Sources: Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage hooks as a first-class family.

Notes:
None.

## Qoder

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed hook surface exists; only documentation can be generated here.
- Sources: Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage hooks as a first-class family.

Notes:
None.
