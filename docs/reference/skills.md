# Skills Reference

Generated: 2026-04-15

This page is official-doc-first. Vendor docs are treated as authoritative. Current repo behavior is only used to fill gaps and is labeled in the evidence status.

| Target | Support | Repo Support | Scopes | Format | Reliability |
| --- | --- | --- | --- | --- | --- |
| [Cursor](./targets/cursor.md#skills) | supported | managed | [local](#cursor-skills-local), [global](#cursor-skills-global) | package | Low |
| [Gemini CLI](./targets/gemini.md#skills) | supported | managed | [local](#gemini-skills-local), [global](#gemini-skills-global), [shared](#gemini-skills-shared) | package | Low |
| [Codex](./targets/codex.md#skills) | supported | documented-only | [local](#codex-skills-local), [global](#codex-skills-global) | package | High |
| [Claude Code](./targets/claude-code.md#skills) | supported | managed | [local](#claude-code-skills-local), [global](#claude-code-skills-global) | package | High |
| [Google Antigravity](./targets/antigravity.md#skills) | supported | managed | [local](#antigravity-skills-local), [global](#antigravity-skills-global) | package | Low |
| [Openskills](./targets/openskills.md#skills) | supported | managed | [local](#openskills-skills-local), [global](#openskills-skills-global) | package | Low |
| [Agentskills (Vercel Labs)](./targets/agents.md#skills) | supported | managed | [local](#agents-skills-local), [global](#agents-skills-global), [shared](#agents-skills-shared) | package | Low |
| [OpenCode](./targets/opencode.md#skills) | supported | managed | [local](#opencode-skills-local), [global](#opencode-skills-global), [shared](#opencode-skills-shared) | package | Medium |
| [Qoder](./targets/qoder.md#skills) | supported | managed | [local](#qoder-skills-local), [global](#qoder-skills-global) | package | High |

## Cursor

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#cursor-skills-local), [global](#cursor-skills-global)
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
None.

Notes:
None.

## Codex

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#codex-skills-local), [global](#codex-skills-global)
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
- Official docs describe Codex skill discovery under .agents/skills rather than .codex/skills.

## Claude Code

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#claude-code-skills-local), [global](#claude-code-skills-global)
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
- Format: package
- Reliability: Medium
- Evidence status: `official+implementation`
- Evidence summary: Official docs directly cover `.opencode/skills/<name>/SKILL.md`, `~/.config/opencode/skills/<name>/SKILL.md`, and compatibility discovery under `.claude/skills` and `.agents/skills`.
- Sources: [OpenCode skills](https://opencode.ai/docs/skills); Target adapters (`src/targets/adapters.ts`)

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
None.

Notes:
None.

## OpenCode

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#opencode-skills-local), [global](#opencode-skills-global)
- Format: Directory-based skill with SKILL.md and optional supporting files
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Current repo adapters define skill sync directories for this target.
- Sources: Target adapters (`src/targets/adapters.ts`)

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
None.

## Qoder

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#qoder-skills-local), [global](#qoder-skills-global)
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
