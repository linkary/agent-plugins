# Agentskills (Vercel Labs)

Reviewed: 2026-04-16

Aliases: agents

Target notes:
- No stable official path documentation was captured during this implementation for the Agents target.

## skills

- Support: `supported`
- Repo support: `managed`
- Scopes: [local](#agents-skills-local), [global](#agents-skills-global), [shared](#agents-skills-shared)
- Format: package
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: [Agent Skills specification](https://agentskills.io/specification); Target adapters (`src/targets/adapters.ts`)

### Local path {#agents-skills-local}

- Scope: `local`
- Path: <project>/.agents/skills

### Global path {#agents-skills-global}

- Scope: `global`
- Path: ~/.agents/skills

### Shared path {#agents-skills-shared}

- Scope: `shared`
- Path: local owner: <project>/.agents/skills; global owner: ~/.agents/skills
- Note: Shared owner destination for Gemini-compatible skills across both local and global scopes.
- Path evidence status: `implementation-only`
- Path reliability: Low
- Path evidence summary: The repo promotes exact Gemini-compatible skill duplicates into the shared .agents/skills owner destination.
- Path sources: Shared-skill compatibility map (`src/util/organize-compat.ts`); Skills organize flow (`src/commands/skills/organize.ts`); Skills organize tests (`tests/skills-organize.test.ts`)

Restrictions:
- No stable official Agents target path documentation was captured during this audit.
- The package layout here follows the open Agent Skills standard and current repo behavior.

Notes:
- Treat the `.agents/skills` paths as implementation-derived until a concrete vendor target page is available.

## commands

- Support: `unsupported`
- Repo support: `unsupported`
- Scopes: Undocumented
- Format: —
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- Unsupported in the current target model.

Notes:
None.

## agents

- Support: `unsupported`
- Repo support: `unsupported`
- Scopes: Undocumented
- Format: —
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- Unsupported in the current target model.

Notes:
None.

## rules

- Support: `unsupported`
- Repo support: `unsupported`
- Scopes: Undocumented
- Format: —
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: Target adapters (`src/targets/adapters.ts`); Rule transform (`src/util/rule-transform.ts`); Rules sync special cases (`src/commands/rules/sync.ts`)

No scope-specific paths captured.

Restrictions:
None.

Notes:
None.

## mcp

- Support: `unsupported`
- Repo support: `unsupported`
- Scopes: Undocumented
- Format: —
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: Target adapters (`src/targets/adapters.ts`); MCP transform (`src/util/mcp-transform.ts`); MCP config IO (`src/util/mcp-config-io.ts`)

No scope-specific paths captured.

Restrictions:
None.

Notes:
None.

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

- Support: `undocumented`
- Repo support: `documented-only`
- Scopes: Undocumented
- Format: Undocumented
- Reliability: Low
- Evidence status: `implementation-only`
- Sources: Implementation fallback extractor (`src/docs/model/extract-implementation-fallbacks.ts`)

No scope-specific paths captured.

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
