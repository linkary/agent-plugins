# Skills Reference

Generated: 2026-04-15

This page is official-doc-first. Vendor docs are treated as authoritative. Current repo behavior is only used to fill gaps and is labeled in the evidence status.

| Target | Support | Repo Support | Scopes | Shared .agents | Format | Reliability |
| --- | --- | --- | --- | --- | --- | --- |
| [Cursor](https://agentskills.io/specification) | supported | managed | [local](#cursor-skills-local), [global](#cursor-skills-global) | not documented | package | Low |
| [Gemini CLI](https://agentskills.io/specification) | supported | managed | [local](#gemini-skills-local), [global](#gemini-skills-global), [shared](#gemini-skills-shared) | repo-only | package | Low |
| [Codex](https://developers.openai.com/codex/skills) | supported | documented-only | [local](#codex-skills-local), [global](#codex-skills-global) | native | package | High |
| [Claude Code](https://agentskills.io/specification) | supported | managed | [local](#claude-code-skills-local), [global](#claude-code-skills-global) | not documented | package | High |
| [Google Antigravity](https://agentskills.io/specification) | supported | managed | [local](#antigravity-skills-local), [global](#antigravity-skills-global) | not documented | package | Low |
| [Openskills](https://agentskills.io/specification) | supported | managed | [local](#openskills-skills-local), [global](#openskills-skills-global) | unsupported | package | Low |
| Agentskills (Vercel Labs) | supported | managed | [local](#agents-skills-local), [global](#agents-skills-global), [shared](#agents-skills-shared) | repo-only | package | Low |
| [OpenCode](https://opencode.ai/docs/skills) | supported | managed | [local](#opencode-skills-local), [global](#opencode-skills-global), [shared](#opencode-skills-shared) | compatibility | package | High |
| [Qoder](https://docs.qoder.com/cli/Skills) | supported | managed | [local](#qoder-skills-local), [global](#qoder-skills-global) | not documented | package | High |

## Cursor

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#cursor-skills-local), [global](#cursor-skills-global)
- Shared .agents support: `not documented`
- Format: package
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Current repo adapters define skill sync directories for this target.
- Sources: [Agent Skills specification](https://agentskills.io/specification); Target adapters (`src/targets/adapters.ts`)

### Local path {#cursor-skills-local}

- Scope: `local`
- Path: <project>/.cursor/skills

### Global path {#cursor-skills-global}

- Scope: `global`
- Path: ~/.cursor/skills

Restrictions:
None.

Notes:
None.

## Gemini CLI

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#gemini-skills-local), [global](#gemini-skills-global), [shared](#gemini-skills-shared)
- Shared .agents support: `repo-only`
- Format: package
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Current repo adapters define skill sync directories for this target.
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
- Gemini CLI does not currently document `.agents/skills` or `~/.agents/skills` as native or compatibility skill paths.

Notes:
- The shared `.agents/skills` destination here is repo compatibility behavior from skills organize, not a vendor-documented Gemini storage location.

## Codex

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#codex-skills-local), [global](#codex-skills-global)
- Shared .agents support: `native`
- Format: package
- Reliability: High
- Evidence status: `official+implementation`
- Evidence summary: Official docs directly cover repo/user/admin/system skill directories under `.agents/skills`, and the repo maps that layout into its own local/global view.
- Sources: [OpenAI Codex skills](https://developers.openai.com/codex/skills); Target adapters (`src/targets/adapters.ts`)

### Local path {#codex-skills-local}

- Scope: `local`
- Path: <project>/.agents/skills

### Global path {#codex-skills-global}

- Scope: `global`
- Path: $HOME/.agents/skills

Restrictions:
- Codex documents repository, user, admin, and system skill locations under `.agents/skills`.
- Admin/system skill locations also exist outside the user and repo scopes.
- The repo still resolves the current project/repository root as the local scope for sync operations.

Notes:
- Official docs describe Codex skill discovery under `.agents/skills` rather than `.codex/skills`.
- This is native Codex storage, not a compatibility shim.

## Claude Code

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#claude-code-skills-local), [global](#claude-code-skills-global)
- Shared .agents support: `not documented`
- Format: package
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Current repo adapters define skill sync directories for this target.
- Sources: [Agent Skills specification](https://agentskills.io/specification); Target adapters (`src/targets/adapters.ts`)

### Local path {#claude-code-skills-local}

- Scope: `local`
- Path: <project>/.claude/skills

### Global path {#claude-code-skills-global}

- Scope: `global`
- Path: ~/.claude/skills

Restrictions:
None.

Notes:
None.

## Google Antigravity

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#antigravity-skills-local), [global](#antigravity-skills-global)
- Shared .agents support: `not documented`
- Format: package
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Current repo adapters define skill sync directories for this target.
- Sources: [Agent Skills specification](https://agentskills.io/specification); Target adapters (`src/targets/adapters.ts`)

### Local path {#antigravity-skills-local}

- Scope: `local`
- Path: <project>/.agent/skills

### Global path {#antigravity-skills-global}

- Scope: `global`
- Path: ~/.gemini/antigravity/skills

Restrictions:
None.

Notes:
None.

## Openskills

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#openskills-skills-local), [global](#openskills-skills-global)
- Shared .agents support: `unsupported`
- Format: package
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Current repo adapters define skill sync directories for this target.
- Sources: [Agent Skills specification](https://agentskills.io/specification); Target adapters (`src/targets/adapters.ts`)

### Local path {#openskills-skills-local}

- Scope: `local`
- Path: <project>/.agent/skills

### Global path {#openskills-skills-global}

- Scope: `global`
- Path: ~/.agent/skills

Restrictions:
None.

Notes:
None.

## Agentskills (Vercel Labs)

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#agents-skills-local), [global](#agents-skills-global), [shared](#agents-skills-shared)
- Shared .agents support: `repo-only`
- Format: package
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Current repo adapters define the Agents target path as `.agents/skills`, and current organize logic uses it as the shared owner destination for Gemini-compatible skills.
- Sources: Target adapters (`src/targets/adapters.ts`); Shared-skill compatibility map (`src/util/organize-compat.ts`); Skills organize flow (`src/commands/skills/organize.ts`)

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
- No stable official vendor docs were captured for the Agents target beyond the repo’s own target-path convention.

Notes:
- The `.agents/skills` path is the repo’s target convention here and the owner of the repo-only shared skills destination.

## OpenCode

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#opencode-skills-local), [global](#opencode-skills-global)
- Shared .agents support: `compatibility`
- Format: package
- Reliability: High
- Evidence status: `official+implementation`
- Evidence summary: OpenCode officially documents native `.opencode/skills` locations and compatibility discovery under `.agents/skills` and `.claude/skills`.
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
- OpenCode documents package-based skills in `.opencode/skills/` and `~/.config/opencode/skills/`.
- OpenCode also supports compatibility discovery under `.claude/skills` and `.agents/skills`.

Notes:
- `.agents/skills` is an official compatibility/discovery path for OpenCode, not its primary native storage root.

## Qoder

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#qoder-skills-local), [global](#qoder-skills-global)
- Shared .agents support: `not documented`
- Format: package
- Reliability: High
- Evidence status: `official+implementation`
- Evidence summary: Qoder documents package-style skill directories with `SKILL.md` plus optional supporting files under both project and user scopes.
- Sources: [Qoder skills](https://docs.qoder.com/cli/Skills); Target adapters (`src/targets/adapters.ts`)

### Local path {#qoder-skills-local}

- Scope: `local`
- Path: <project>/.qoder/skills

### Global path {#qoder-skills-global}

- Scope: `global`
- Path: ~/.qoder/skills

Restrictions:
None.

Notes:
None.
