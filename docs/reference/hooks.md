# Hooks Reference

Reviewed: 2026-04-17

This page is official-doc-first. Vendor docs are treated as authoritative. Current repo behavior is only used to fill gaps and is labeled in the evidence status.

| Target | Support | Repo Support | Scopes | Format | Reliability |
| --- | --- | --- | --- | --- | --- |
| [Cursor](https://docs.cursor.com/background-agent/api/webhooks) | supported | documented-only | Undocumented | webhook | Low |
| Gemini CLI | undocumented | documented-only | Undocumented | — | Low |
| [Codex](https://developers.openai.com/codex/hooks) | supported | documented-only | [local](#codex-hooks-local), [global](#codex-hooks-global) | json | Low |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code/hooks) | supported | documented-only | Undocumented | json | Low |
| Google Antigravity | undocumented | documented-only | Undocumented | — | Low |
| Openskills | undocumented | documented-only | Undocumented | — | Low |
| Agentskills (Vercel Labs) | undocumented | documented-only | Undocumented | — | Low |
| OpenCode | undocumented | documented-only | Undocumented | — | Low |
| Qoder | undocumented | documented-only | Undocumented | — | Low |

## Cursor

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Background-agent webhooks / automation
- Reliability: Low
- Evidence status: `disputed`
- Evidence summary: Official docs and current implementation differ on: support.
- Sources: [Cursor background-agent webhooks](https://docs.cursor.com/background-agent/api/webhooks); Target adapters (`src/targets/adapters.ts`)

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
- Sources: Target adapters (`src/targets/adapters.ts`)

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
- Sources: [OpenAI Codex hooks](https://developers.openai.com/codex/hooks); Target adapters (`src/targets/adapters.ts`)

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
- Sources: [Anthropic Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks); Target adapters (`src/targets/adapters.ts`)

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
- Sources: Target adapters (`src/targets/adapters.ts`)

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
- Sources: Target adapters (`src/targets/adapters.ts`)

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
- Sources: Target adapters (`src/targets/adapters.ts`)

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
- Sources: Target adapters (`src/targets/adapters.ts`)

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
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- agent-plugins does not currently manage hooks as a first-class family.

Notes:
None.
