# Commands Reference

Reviewed: 2026-04-16

This page is official-doc-first. Vendor docs are treated as authoritative. Current repo behavior is only used to fill gaps and is labeled in the evidence status.

| Target | Support | Repo Support | Scopes | Shared .agents | Format | Reliability |
| --- | --- | --- | --- | --- | --- | --- |
| [Cursor](https://docs.cursor.com/en/agent/chat/commands) | supported | managed | [local](#cursor-commands-local), [global](#cursor-commands-global) | unsupported | markdown | High |
| [Gemini CLI](https://google-gemini.github.io/gemini-cli/docs/cli/custom-commands.html) | supported | documented-only | [local](#gemini-commands-local), [global](#gemini-commands-global) | unsupported | toml | High |
| [Codex](https://developers.openai.com/codex/app/commands) | supported | managed | [local](#codex-commands-local), [global](#codex-commands-global) | unsupported | markdown | Low |
| [Claude Code](https://code.claude.com/docs/en/slash-commands) | supported | documented-only | [local](#claude-code-commands-local), [global](#claude-code-commands-global) | unsupported | markdown | High |
| Google Antigravity | supported | partial | [local](#antigravity-commands-local), [global](#antigravity-commands-global) | unsupported | markdown | Low |
| Openskills | unsupported | unsupported | Undocumented | unsupported | — | Low |
| Agentskills (Vercel Labs) | unsupported | unsupported | Undocumented | unsupported | — | Low |
| [OpenCode](https://opencode.ai/docs/commands/) | supported | documented-only | [local](#opencode-commands-local), [global](#opencode-commands-global) | unsupported | markdown | High |
| [Qoder](https://docs.qoder.com/user-guide/commands) | supported | documented-only | [local](#qoder-commands-local), [global](#qoder-commands-global) | unsupported | markdown | Medium |

## Cursor

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#cursor-commands-local), [global](#cursor-commands-global)
- Shared .agents support: `unsupported`
- Format: markdown
- Reliability: High
- Evidence status: `official+implementation`
- Evidence summary: Cursor documents both project and global command directories and states that commands are plain Markdown files.
- Sources: [Cursor commands](https://docs.cursor.com/en/agent/chat/commands); Target adapters (`src/targets/adapters.ts`); Command transform (`src/util/command-transform.ts`)

### Local path {#cursor-commands-local}

- Scope: `local`
- Path: <project>/.cursor/commands

### Global path {#cursor-commands-global}

- Scope: `global`
- Path: ~/.cursor/commands

Restrictions:
- Cursor commands are currently in beta.
- Cursor loads commands from both project and global directories when you type `/`.
- agent-plugins sync keeps the same Markdown command layout that Cursor documents.

Notes:
None.

## Gemini CLI

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#gemini-commands-local), [global](#gemini-commands-global)
- Shared .agents support: `unsupported`
- Format: toml
- Reliability: High
- Evidence status: `official`
- Evidence summary: Gemini CLI documents both command locations and requires `.toml` files written in the TOML v1 command format.
- Sources: [Gemini CLI custom commands](https://google-gemini.github.io/gemini-cli/docs/cli/custom-commands.html)

### Local path {#gemini-commands-local}

- Scope: `local`
- Path: <project>/.gemini/commands

### Global path {#gemini-commands-global}

- Scope: `global`
- Path: ~/.gemini/commands

Restrictions:
- Gemini CLI requires `.toml` files in the commands directories.
- Gemini CLI uses subdirectories as namespaces and lets project commands override global commands with the same name.

Notes:
None.

## Codex

- Target support: `supported`
- Repo support: `managed`
- Scopes: [local](#codex-commands-local), [global](#codex-commands-global)
- Shared .agents support: `unsupported`
- Format: markdown
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: OpenAI’s current Codex docs document built-in slash commands, but the `.codex/commands` sync layout remains repo-defined.
- Sources: [OpenAI Codex app commands](https://developers.openai.com/codex/app/commands); Target adapters (`src/targets/adapters.ts`); Command transform (`src/util/command-transform.ts`)

### Local path {#codex-commands-local}

- Scope: `local`
- Path: <project>/.codex/commands

### Global path {#codex-commands-global}

- Scope: `global`
- Path: $CODEX_HOME/commands

Restrictions:
- Central commands are normalized from directory-form or file-form into a flat target layout.
- OpenAI’s current official docs do not document a custom on-disk commands directory for Codex.

Notes:
None.

## Claude Code

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#claude-code-commands-local), [global](#claude-code-commands-global)
- Shared .agents support: `unsupported`
- Format: markdown
- Reliability: High
- Evidence status: `official`
- Evidence summary: Claude Code documents custom slash commands as `.md` files in both project and user command directories.
- Sources: [Claude Code slash commands](https://code.claude.com/docs/en/slash-commands); [Claude Code SDK slash commands](https://code.claude.com/docs/en/agent-sdk/slash-commands)

### Local path {#claude-code-commands-local}

- Scope: `local`
- Path: <project>/.claude/commands

### Global path {#claude-code-commands-global}

- Scope: `global`
- Path: ~/.claude/commands

Restrictions:
- Claude Code documents `.md` command files in `.claude/commands/` and `~/.claude/commands/`.
- Claude recommends skills for richer workflows, but existing command files still work.

Notes:
None.

## Google Antigravity

- Target support: `supported`
- Repo support: `partial`
- Scopes: [local](#antigravity-commands-local), [global](#antigravity-commands-global)
- Shared .agents support: `unsupported`
- Format: markdown
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: Current repo adapters and command transforms define the target command/workflow layout.
- Sources: Target adapters (`src/targets/adapters.ts`); Command transform (`src/util/command-transform.ts`)

### Local path {#antigravity-commands-local}

- Scope: `local`
- Path: <project>/.agent/workflows

### Global path {#antigravity-commands-global}

- Scope: `global`
- Path: ~/.gemini/antigravity/global_workflows

Restrictions:
- agent-plugins maps commands to Antigravity workflows.

Notes:
None.

## Openskills

- Target support: `unsupported`
- Repo support: `unsupported`
- Scopes: Undocumented
- Shared .agents support: `unsupported`
- Format: —
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No official command surface is captured for this target in the current docs set.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- Unsupported in the current target model.

Notes:
None.

## Agentskills (Vercel Labs)

- Target support: `unsupported`
- Repo support: `unsupported`
- Scopes: Undocumented
- Shared .agents support: `unsupported`
- Format: —
- Reliability: Low
- Evidence status: `implementation-only`
- Evidence summary: No official command surface is captured for this target in the current docs set.
- Sources: Target adapters (`src/targets/adapters.ts`)

No scope-specific paths captured.

Restrictions:
- Unsupported in the current target model.

Notes:
None.

## OpenCode

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#opencode-commands-local), [global](#opencode-commands-global)
- Shared .agents support: `unsupported`
- Format: markdown
- Reliability: High
- Evidence status: `official+implementation`
- Evidence summary: OpenCode documents project and global command directories as Markdown command files, while also allowing commands in JSON config.
- Sources: [OpenCode commands](https://opencode.ai/docs/commands/); Target adapters (`src/targets/adapters.ts`); Command transform (`src/util/command-transform.ts`)

### Local path {#opencode-commands-local}

- Scope: `local`
- Path: <project>/.opencode/commands

### Global path {#opencode-commands-global}

- Scope: `global`
- Path: ~/.config/opencode/commands

Restrictions:
- OpenCode supports Markdown command files in `.opencode/commands/` and `~/.config/opencode/commands/`.
- OpenCode also supports defining commands in config JSON, but this page tracks the command-directory file layout.

Notes:
None.

## Qoder

- Target support: `supported`
- Repo support: `documented-only`
- Scopes: [local](#qoder-commands-local), [global](#qoder-commands-global)
- Shared .agents support: `unsupported`
- Format: markdown
- Reliability: Medium
- Evidence status: `official+implementation`
- Evidence summary: Qoder documents project and user command scopes directly, while the Markdown file format remains an implementation-aligned inference.
- Sources: [Qoder commands](https://docs.qoder.com/user-guide/commands); Target adapters (`src/targets/adapters.ts`); Command transform (`src/util/command-transform.ts`)

### Local path {#qoder-commands-local}

- Scope: `local`
- Path: <project>/.qoder/commands

### Global path {#qoder-commands-global}

- Scope: `global`
- Path: macOS / Linux: ~/.qoder/commands; Windows: %USERPROFILE%\\.qoder\\commands

Restrictions:
- Qoder separates project and user commands.
- Qoder notes that user-level commands do not sync across devices automatically.

Notes:
None.
