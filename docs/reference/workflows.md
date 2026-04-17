# Workflows Reference

Reviewed: 2026-04-17

This page is official-doc-first. Vendor docs are treated as authoritative. Current repo behavior is only used to fill gaps and is labeled in the evidence status.

| Target | Support | Repo Support | Scopes | Format | Reliability |
| --- | --- | --- | --- | --- | --- |
| Cursor | undocumented | documented-only | Undocumented | — | Low |
| Gemini CLI | undocumented | documented-only | Undocumented | — | Low |
| Codex | undocumented | documented-only | Undocumented | — | Low |
| Claude Code | undocumented | documented-only | Undocumented | — | Low |
| Google Antigravity | supported | documented-only | [local](#antigravity-workflows-local), [global](#antigravity-workflows-global) | markdown | Low |
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
- Evidence summary: No stable repo-managed workflow surface exists for this target.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
None.

Notes:
None.

## Gemini CLI

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed workflow surface exists for this target.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
None.

Notes:
None.

## Codex

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed workflow surface exists for this target.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
None.

Notes:
None.

## Claude Code

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed workflow surface exists for this target.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
None.

Notes:
None.

## Google Antigravity

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#antigravity-workflows-local), [global](#antigravity-workflows-global)
- Format: Workflow-like markdown files
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Current repo adapters map Antigravity commands onto workflow directories.
- Sources: Target adapters (`src/targets/adapters.ts`)

### Local path {#antigravity-workflows-local}

- Scope: `local`
- Path: <project>/.agent/workflows

### Global path {#antigravity-workflows-global}

- Scope: `global`
- Path: ~/.gemini/antigravity/global_workflows

Restrictions:
- agent-plugins currently exposes this surface through the commands adapter.

Notes:
None.

## Openskills

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed workflow surface exists for this target.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
None.

Notes:
None.

## Agentskills (Vercel Labs)

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed workflow surface exists for this target.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
None.

Notes:
None.

## OpenCode

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed workflow surface exists for this target.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
None.

Notes:
None.

## Qoder

- Target support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No stable repo-managed workflow surface exists for this target.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
None.

Notes:
None.
