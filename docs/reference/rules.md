# Rules Reference

Generated: 2026-04-15

This page is official-doc-first. Vendor docs are treated as authoritative. Current repo behavior is only used to fill gaps and is labeled in the evidence status.

| Target | Support | Repo Support | Scopes | Format | Reliability |
| --- | --- | --- | --- | --- | --- |
| [Cursor](https://docs.cursor.com/en/context) | supported | managed | [local](#cursor-rules-local), [global](#cursor-rules-global) | mdc + text | Medium |
| [Gemini CLI](https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html) | supported | documented-only | [local](#gemini-rules-local), [global](#gemini-rules-global) | markdown | Medium |
| [Codex](https://developers.openai.com/codex/guides/agents-md) | supported | documented-only | [local](#codex-rules-local), [global](#codex-rules-global) | .rules | Low |
| [Claude Code](https://code.claude.com/docs/en/memory) | supported | partial | [local](#claude-code-rules-local), [global](#claude-code-rules-global) | markdown | High |
| [Google Antigravity](https://codelabs.developers.google.com/getting-started-google-antigravity) | supported | documented-only | [local](#antigravity-rules-local) | markdown | Low |
| Openskills | unsupported | unsupported | Undocumented | — | Low |
| Agentskills (Vercel Labs) | unsupported | unsupported | Undocumented | — | Low |
| [OpenCode](https://opencode.ai/docs/rules) | supported | documented-only | [local](#opencode-rules-local), [global](#opencode-rules-global) | markdown | Medium |
| [Qoder](https://docs.qoder.com/user-guide/rules) | supported | documented-only | [local](#qoder-rules-local) | markdown | High |

## Cursor

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#cursor-rules-local), [global](#cursor-rules-global)
- Format: mdc + text
- Reliability: Medium
- Evidence status: `official+implementation`
- Evidence summary: Official docs cover local `.mdc` project rules and user rules, while current implementation fills the exact global storage backend.
- Sources: [Cursor rules](https://docs.cursor.com/en/context); Target adapters (`src/targets/adapters.ts`); Rule transform (`src/util/rule-transform.ts`); Rules sync special cases (`src/commands/rules/sync.ts`); Cursor user-rules storage (`src/util/cursor-user-rules.ts`)

### Local path {#cursor-rules-local}

- Scope: `local`
- Path: <project>/.cursor/rules

### Global path {#cursor-rules-global}

- Scope: `global`
- Path: Cursor user rules via Knowledge Base API; legacy macOS fallback: ~/Library/Application Support/Cursor/User/globalStorage/state.vscdb#aicontext.personalContext; override: $AP_CURSOR_USER_RULES_FILE

Restrictions:
- Cursor documents project rules as `.mdc` files under `.cursor/rules`.
- Cursor also documents user rules, but it does not fully specify the storage backend that agent-plugins reads and writes.
- The exact global storage backend used by agent-plugins is implementation-defined rather than fully vendor-specified.
- Global rules use Cursor user-rules storage rather than the `.cursor/rules` directory.
- agent-plugins currently supports Cursor global rules through the Knowledge Base API, SQLite fallback, or AP_CURSOR_USER_RULES_FILE override.

Notes:
None.

## Gemini CLI

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#gemini-rules-local), [global](#gemini-rules-global)
- Format: markdown
- Reliability: Medium
- Evidence status: `disputed`
- Evidence summary: Gemini CLI officially documents `GEMINI.md` instruction files, while the repo currently maps this surface to `.gemini/rules`.
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

## Codex

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#codex-rules-local), [global](#codex-rules-global)
- Format: .rules
- Reliability: Low
- Evidence status: `disputed`
- Evidence summary: Codex officially documents `AGENTS.md` instruction files, but the repo rules surface is a separate `.rules` execution-policy convention.
- Sources: [OpenAI Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md); Target adapters (`src/targets/adapters.ts`); Rule transform (`src/util/rule-transform.ts`); Rules sync special cases (`src/commands/rules/sync.ts`)

### Local path {#codex-rules-local}

- Scope: `local`
- Path: <project>/.codex/rules

### Global path {#codex-rules-global}

- Scope: `global`
- Path: $CODEX_HOME/rules

Restrictions:
- OpenAI’s official instruction surface is `AGENTS.md`, not a `.codex/rules` directory.
- Codex rules are execution-policy rules, not prompt rules.
- The `.codex/rules` and `$CODEX_HOME/rules` paths remain repo-specific conventions.

Notes:
None.

## Claude Code

- Target support: `supported`
- Repo support: `partial`
- Scopes: [local](#claude-code-rules-local), [global](#claude-code-rules-global)
- Format: markdown
- Reliability: High
- Evidence status: `official+implementation`
- Evidence summary: Anthropic directly documents Markdown rule files in both project and user rule directories, while the repo currently only syncs the local rules directory and handles global rules through `~/.claude/CLAUDE.md`.
- Sources: [Claude Code memory](https://code.claude.com/docs/en/memory); Target adapters (`src/targets/adapters.ts`); Global rules store (`src/util/global-rules-store.ts`)

### Local path {#claude-code-rules-local}

- Scope: `local`
- Path: <project>/.claude/rules

### Global path {#claude-code-rules-global}

- Scope: `global`
- Path: Official path: `~/.claude/rules`; current repo behavior: `~/.claude/CLAUDE.md` via the global-rules store

Restrictions:
- Claude Code documents Markdown rule files in `.claude/rules/` and `~/.claude/rules/`.
- `CLAUDE.md` remains a broader memory surface and is separate from the dedicated rules directories.
- agent-plugins does not currently sync Claude Code global rules to the documented `~/.claude/rules` directory.
- In the current repo, Claude global rules flow through `~/.claude/CLAUDE.md`, and `resolveRulesDir` does not provide a global rules directory.

Notes:
None.

## Google Antigravity

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#antigravity-rules-local)
- Format: markdown
- Reliability: Low
- Evidence status: `official+implementation`
- Evidence summary: Google’s Antigravity docs cover a global `GEMINI.md` rule file and a workspace rules directory, while the repo maps workspace rules to a local `.agent/rules` folder.
- Sources: [Google Antigravity getting started codelab](https://codelabs.developers.google.com/getting-started-google-antigravity); Target adapters (`src/targets/adapters.ts`); Rule transform (`src/util/rule-transform.ts`); Rules sync special cases (`src/commands/rules/sync.ts`)

### Local path {#antigravity-rules-local}

- Scope: `local`
- Path: <project>/.agent/rules

Restrictions:
- Google’s Antigravity docs cover a global `~/.gemini/GEMINI.md` rule file and a workspace rules directory.
- The repo currently maps workspace rules to `<project>/.agent/rules`, but exact workspace file naming and compatibility still need manual validation.

Notes:
None.

## Openskills

- Target support: `unsupported`
- Repo support: `unsupported`
- Scopes: Undocumented
- Format: —
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Current repo rule adapters and transforms define this rule surface or incompatibility.
- Sources: Target adapters (`src/targets/adapters.ts`); Rule transform (`src/util/rule-transform.ts`); Rules sync special cases (`src/commands/rules/sync.ts`)

No scope-specific paths captured.

Restrictions:
None.

Notes:
None.

## Agentskills (Vercel Labs)

- Target support: `unsupported`
- Repo support: `unsupported`
- Scopes: Undocumented
- Format: —
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Current repo rule adapters and transforms define this rule surface or incompatibility.
- Sources: Target adapters (`src/targets/adapters.ts`); Rule transform (`src/util/rule-transform.ts`); Rules sync special cases (`src/commands/rules/sync.ts`)

No scope-specific paths captured.

Restrictions:
None.

Notes:
None.

## OpenCode

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#opencode-rules-local), [global](#opencode-rules-global)
- Format: markdown
- Reliability: Medium
- Evidence status: `disputed`
- Evidence summary: OpenCode officially documents Markdown `AGENTS.md` instruction files, while the repo currently maps this surface to `.opencode/rules`.
- Sources: [OpenCode rules](https://opencode.ai/docs/rules); Target adapters (`src/targets/adapters.ts`); Rule transform (`src/util/rule-transform.ts`); Rules sync special cases (`src/commands/rules/sync.ts`)

### Local path {#opencode-rules-local}

- Scope: `local`
- Path: Official equivalent: `<project>/AGENTS.md`; current repo adapter: `<project>/.opencode/rules`

### Global path {#opencode-rules-global}

- Scope: `global`
- Path: Official equivalent: `~/.config/opencode/AGENTS.md`; current repo adapter: `~/.opencode/rules`

Restrictions:
- OpenCode documents rule-like instructions through Markdown `AGENTS.md` files, not a `.opencode/rules` directory.
- The repo currently exposes rules through a synthetic local/global rules directory, so path compatibility should be validated before relying on sync behavior.

Notes:
None.

## Qoder

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#qoder-rules-local)
- Format: markdown
- Reliability: High
- Evidence status: `official+implementation`
- Evidence summary: Qoder officially documents project rules in `.qoder/rules`, and its `@ Mention` docs explicitly state that `.md` files in that directory can be referenced as rules.
- Sources: [Qoder rules](https://docs.qoder.com/user-guide/rules); [Qoder @ Mention](https://docs.qoder.com/user-guide/chat/context); Target adapters (`src/targets/adapters.ts`); Rule transform (`src/util/rule-transform.ts`); Rules sync special cases (`src/commands/rules/sync.ts`)

### Local path {#qoder-rules-local}

- Scope: `local`
- Path: <project>/.qoder/rules

Restrictions:
- Qoder documents project rule `.md` files under `.qoder/rules`.
- Qoder docs emphasize project rules rather than a user-global rules surface.
- agent-plugins currently limits Qoder rules sync to the local project scope.

Notes:
None.
