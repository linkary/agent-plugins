# Coding Conventions

**Analysis Date:** 2026-04-12

## Naming Patterns

**Files:**
- Command handlers live in verb-focused files under `src/commands/<group>/`, for example `src/commands/skills/add.ts`, `src/commands/rules/sync.ts`, and `src/commands/mcp/rm.ts`.
- Interactive command entry points use `.tsx` and a `show` naming pattern, for example `src/commands/skills/show.tsx`, `src/commands/commands/show.tsx`, and `src/commands/rules/show.tsx`.
- Core persistence and domain helpers use noun-based files under `src/core/`, for example `src/core/registry.ts`, `src/core/config.ts`, and `src/core/command-store.ts`.
- Shared utilities use kebab-case under `src/util/`, for example `src/util/command-meta.ts`, `src/util/fs-utils.ts`, and `src/util/remote-find.ts`.
- Tests mirror the production module or behavior name at top level in `tests/`, for example `tests/options.test.ts`, `tests/skills-update.test.ts`, and `tests/prompt-review-confirm.test.ts`.

**Functions:**
- Exported command handlers use `cmd<Group><Action>` camelCase names, for example `cmdSkillsAdd` in `src/commands/skills/add.ts` and `cmdRulesCollect` in `src/commands/rules/collect.ts`.
- Utility helpers use plain camelCase with imperative verbs, for example `parseOptions` in `src/util/options.ts`, `loadConfig` in `src/core/config.ts`, and `normalizeRepoUrl` in `src/core/registry.ts`.
- React components use PascalCase function names, for example `MultiSelect` in `src/ui/multi-select.tsx` and `ReviewConfirm` in `src/ui/review-confirm.tsx`.

**Variables:**
- Local variables are short camelCase names that describe filesystem or CLI state, for example `srcPath`, `destExists`, `refFlag`, `tmpApgHome`, and `interactive` in `src/commands/skills/add.ts`.
- CLI flag-derived locals are usually suffixed with `Flag`, for example `nameFlag`, `refFlag`, `scopeFlag`, and `cwdFlag` in `src/commands/rules/add.ts` and `src/commands/skills/manage-utils.ts`.

**Types:**
- Types and aliases use PascalCase, often with domain suffixes such as `ConfigV1`, `RepoRecord`, `McpConfigSpec`, `TargetAdapter`, and `CliRunContext` in `src/core/config.ts`, `src/core/registry.ts`, `src/core/mcp-types.ts`, `src/targets/adapters.ts`, and `src/runner/cli.ts`.
- Versioned persisted shapes are explicitly suffixed with `V1`, for example `ConfigV1`, `TargetConfigV1`, `RegistryFileV1`, and `SyncStateV1`.
- Small state machines prefer string-literal unions, for example `type EntryStatus = 'new' | 'replace' | 'same'` in `src/commands/skills/sync.ts`.

## Code Style

**Formatting:**
- Use the repo-level `.editorconfig` and `.prettierrc.yml`.
- Indentation is 2 spaces, line endings are LF, final newlines are required, and trailing whitespace is trimmed except in Markdown: `.editorconfig`.
- Prettier rules are `singleQuote: true`, `semi: true`, `trailingComma: all`, and `printWidth: 120`: `.prettierrc.yml`.
- TypeScript source uses ESM-style relative imports with explicit `.js` extensions even inside `.ts` files, for example `src/cli.ts` imports `./runner/cli.js` and `src/commands/skills/add.ts` imports `../../core/skill-store.js`.

**Linting:**
- No active ESLint, Biome, or TypeScript lint config is present at repo root. No `eslint.config.*`, `.eslintrc*`, or `biome.json` was detected.
- A leftover suppression exists in `src/cli.ts` (`eslint-disable-next-line no-console`), so match the existing style but do not rely on an enforced lint pipeline.

## Import Organization

**Order:**
1. Node built-ins first, for example `import path from 'node:path';` and `import fs from 'node:fs/promises';` in `src/commands/rules/add.ts`.
2. External packages second, for example `import React from 'react';` and `import { Box, Text, useInput } from 'ink';` in `src/ui/multi-select.tsx`.
3. Internal relative modules third, grouped by area, for example `src/runner/cli.ts` and `src/util/prompt.ts`.
4. `type` imports are commonly placed after value imports, for example `import type { ParsedFlags } from '../../util/options.js';`.

**Path Aliases:**
- Not detected. All imports use relative paths such as `../util/options.js` and `../../core/registry.js`.

## Error Handling

**Patterns:**
- CLI handlers report user-facing failures via `process.stderr.write(...)` and return numeric exit codes instead of throwing, for example `src/runner/cli.ts`, `src/commands/skills/add.ts`, and `src/commands/rules/add.ts`.
- Top-level process failures are caught once in `src/cli.ts`, logged with `console.error`, and mapped to `process.exitCode = 1`.
- Recoverable filesystem and parsing failures often fall back to safe defaults, for example `pathExists` in `src/util/fs-utils.ts`, `loadConfig` in `src/core/config.ts`, and `parseCommandMeta` in `src/util/command-meta.ts`.
- Invariant violations and misuse of interactive helpers still throw hard errors, for example `throw new Error('Interactive prompt requires a TTY')` in `src/util/prompt.ts` and `throw new Error('useResolve must be used inside runInk')` in `src/ui/render.tsx`.

## Logging

**Framework:** `process.stdout.write` / `process.stderr.write`

**Patterns:**
- Normal CLI output goes to stdout and status/warning output often goes to stderr, especially during collect/sync flows such as `src/commands/skills/collect.ts` and `src/commands/rules/collect.ts`.
- Colored output is centralized through `src/util/ansi.ts` and adapter label helpers in `src/targets/adapters.ts`.
- Structured logging libraries are not used.

## Comments

**When to Comment:**
- Comments are used for section dividers, CLI intent, and filesystem/tool compatibility notes rather than line-by-line narration, for example `src/util/prompt.ts`, `src/targets/adapters.ts`, and `src/commands/skills/manage-utils.ts`.
- Match the surrounding file’s tone. The codebase mixes English and Chinese comments, for example `src/util/command-meta.ts`, `src/targets/adapters.ts`, and `tests/mcp-config-io.test.ts`.

**JSDoc/TSDoc:**
- Short doc comments are common on exported types and helpers in infrastructure files such as `src/util/cli-defs.ts`, `src/util/command-meta.ts`, and `src/util/git-utils.ts`.
- Command handlers themselves usually rely on clear naming plus inline section comments instead of full TSDoc blocks.

## Function Design

**Size:** Large orchestration functions are accepted for command handlers.
- Files such as `src/commands/skills/add.ts`, `src/commands/skills/rm.ts`, and `src/commands/commands/collect.ts` contain long, workflow-style functions that sequence validation, scanning, previewing, and writes.
- Pure transformations and storage primitives are pushed into smaller helpers under `src/util/` and `src/core/`.

**Parameters:** Use stable, repeated function signatures.
- Command handlers almost always accept `(positionals, flags, ctx)`, for example `src/commands/skills/list.ts`, `src/commands/commands/update.ts`, and `src/commands/mcp/collect.ts`.
- Internal helpers prefer a single object parameter when there are more than a few inputs, for example `gatherTargetSkills(...)` in `src/commands/skills/manage-utils.ts` and `selectTargetAdapters(...)` in `src/targets/select-targets.ts`.

**Return Values:** Return narrow, explicit result shapes.
- Commands return `Promise<number>` exit codes.
- Store and parser helpers return `null`, empty arrays, or empty objects on “not found / invalid input” cases rather than raising user-facing errors, for example `getCommandMdPath` in `src/core/command-store.ts`, `readMcpServers` in `src/util/mcp-config-io.ts`, and `parseCommandMeta` in `src/util/command-meta.ts`.

## Module Design

**Exports:** Prefer direct named exports from the owning file.
- There are no barrel files in `src/`; `export *` or re-export aggregator modules were not detected.
- Files generally expose a small cluster of related functions and types, for example `src/core/command-store.ts` and `src/util/options.ts`.

**Barrel Files:** Not used.

## CLI Patterns

- Keep CLI metadata centralized in `src/util/cli-defs.ts`. Help text and option parsing depend on that file, and `tests/help.test.ts` verifies it directly.
- Dispatch by top-level group in `src/runner/cli.ts`, then switch on subcommand in a dedicated `dispatch<Group>` function.
- Use `formatHelp(...)` from `src/runner/help.ts` for fallback usage output instead of duplicating static help text.
- For interactive flows, gate behavior on `process.stdin.isTTY && process.stdout.isTTY`, as seen in `src/commands/skills/add.ts`, `src/commands/skills/show.tsx`, and `src/commands/skills/sync.ts`.
- Keep prompt abstraction in `src/util/prompt.ts`; Ink components under `src/ui/` should not be called directly from command files.

## Docs & Config Conventions

- `README.md` is the canonical operator-facing reference. It uses sectioned headings plus fenced `bash` blocks for command examples.
- Markdown command metadata is frontmatter-driven. `src/util/command-meta.ts` parses `description`, `resources`, and `tags`, and preserves unknown frontmatter keys in `raw`.
- Persistent JSON is written through `writeJsonFileAtomic(...)` in `src/util/fs-utils.ts`, which formats with 2-space indentation and a trailing newline.
- Persistent config and registry files are explicitly versioned with `version: 1`, for example `src/core/config.ts` and `src/core/registry.ts`.
- Environment variable names are uppercase and tool-specific, for example `APG_HOME`, `AGENT_PLUGINS_HOME`, `CODEX_HOME`, and `AP_CURSOR_USER_RULES_FILE` in `README.md`, `src/util/apg-paths.ts`, and `src/util/cursor-user-rules.ts`.

---

*Convention analysis: 2026-04-12*
