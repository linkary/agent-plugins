<!-- GSD:project-start source:PROJECT.md -->
## Project

**agent-plugins Documentation Reliability**

This project improves `agent-plugins` so future development can rely on code-grounded, trustworthy reference documentation instead of stale memory or guessed target behavior. It adds generated documentation for target-specific locations, scope behavior, supported formats, and special cases across skills, commands, agents, rules, and MCP, while reducing the root README to an overview plus links into the generated docs.

**Core Value:** Anyone changing target behavior in `agent-plugins` can find one reliable, code-derived source of truth for path, scope, format, and compatibility rules.

### Constraints

- **Brownfield**: Work must preserve existing CLI behavior and documented target support while improving reliability for maintainers
- **Source of truth**: Reference docs must be derived from implementation logic, not maintained as hand-written duplicate tables
- **Verification**: Documentation claims must be backed by unit tests and checked against official docs or other reliable web sources where possible
- **README scope**: The root `README.md` should stay concise and act as a guidepost, not the primary storage location for exhaustive target reference
- **Target complexity**: Some targets have special handling, such as Cursor global rules, Qoder local-only rules, Codex TOML agents, and shared `.agents` behavior that must be represented accurately
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript - Main application language in `src/cli.ts`, `src/runner/cli.ts`, `src/core/*.ts`, `src/util/*.ts`, and `tests/*.test.ts`.
- TSX / React JSX - Terminal UI components in `src/ui/*.tsx` and interactive command screens such as `src/commands/skills/show.tsx`, `src/commands/commands/show.tsx`, and `src/commands/rules/show.tsx`.
- JavaScript (ESM) - Thin executable wrappers in `bin/ap.js` and `bin/ap-dev.js`.
- Bash - Video asset build script in `video/build.sh`.
- Markdown / MDC / TOML / JSON / YAML - Core content and config formats handled by `src/core/agent-store.ts`, `src/util/rule-transform.ts`, `src/util/mcp-config-io.ts`, `src/core/mcp-store.ts`, and `.prettierrc.yml`.
## Runtime
- Node.js `>=20` - Declared in `package.json`; the published CLI entrypoint is `dist/cli.mjs`, launched through `bin/ap.js`.
- Bun - Primary local runtime for build, dev, and test scripts in `package.json` (`build`, `dev`, `test`).
- Browser/runtime service dependencies are not required for the main CLI. The app is a local terminal program started from `src/cli.ts`.
- Bun - Primary workflow is implied by `bun.lock` and Bun-based scripts in `package.json`.
- npm - `package-lock.json` is also present, so dependency installs have been run through npm at least once.
- Lockfile: present (`bun.lock`, `package-lock.json`)
## Frameworks
- Ink `^6.6.0` - Terminal UI framework used by `src/ui/render.tsx`, `src/ui/select.tsx`, `src/ui/file-browser.tsx`, and `src/ui/file-viewer.tsx`.
- React `^19.1.0` - Component model for Ink screens in `src/ui/*.tsx` and `src/commands/*/show.tsx`.
- Bun test runner - All automated tests import from `bun:test`; 46 test files were detected under `tests/*.test.ts`.
- Bun build - `package.json` builds `src/cli.ts` into `dist/cli.mjs` with `bun build --target node --format esm`.
- Shiki CLI / ANSI highlighting - `@shikijs/cli` plus `shiki` power syntax-highlighted terminal file viewing in `src/ui/file-viewer.tsx`.
- `smol-toml` - TOML parse/stringify layer for Codex agent metadata and MCP configs in `src/core/agent-store.ts`, `src/util/agent-transform.ts`, and `src/util/mcp-config-io.ts`.
- Remotion - Separate media package in `video/package.json` for demo asset generation, not part of the main CLI runtime.
## Key Dependencies
- `ink` `^6.6.0` - Interactive TUI surface for prompts and browsers in `src/util/prompt.ts` and `src/ui/*.tsx`.
- `react` `^19.1.0` - Required by Ink-rendered components in `src/ui/*.tsx`.
- `smol-toml` `^1.6.0` - Needed to read and write Codex-style TOML agent and MCP files in `src/core/agent-store.ts` and `src/util/mcp-config-io.ts`.
- `@shikijs/cli` `^3.22.0` - Used directly by `src/ui/file-viewer.tsx` for terminal syntax highlighting.
- `@types/bun`, `@types/node`, `@types/react` - Type support for the Bun/Node/React toolchain in `package.json`.
- `@remotion/cli`, `remotion`, `@remotion/google-fonts`, `@remotion/transitions` - Video-only tooling in `video/package.json`.
- `react-dom` - Video rendering dependency in `video/package.json`.
- `react-devtools-core` - Declared in `package.json`; no direct imports were detected in `src/`, so treat it as ancillary unless new code proves a runtime dependency.
## Configuration
- Central storage root is configurable through `APG_HOME` or `AGENT_PLUGINS_HOME` in `src/util/apg-paths.ts`.
- Codex global target paths are configurable through `CODEX_HOME` in `src/targets/adapters.ts`.
- Cursor global rules fallback file is configurable through `AP_CURSOR_USER_RULES_FILE` in `src/util/cursor-user-rules.ts`.
- Remote discovery endpoints and cache behavior are configurable through `APG_FIND_SKILLS_API`, `SKILLS_API_URL`, `APG_FIND_GITHUB_API`, `APG_FIND_CACHE_TTL_SEC`, `APG_FIND_DISABLE_CACHE`, `GITHUB_TOKEN`, and `GH_TOKEN` in `src/util/remote-find.ts`.
- No `.env` file usage is implemented in code. Environment is read directly from `process.env` in the modules above.
- `package.json` - Primary build/test/dev script surface for the CLI.
- `.prettierrc.yml` - Only formatting config detected at the repo root.
- `video/tsconfig.json` - The only `tsconfig` detected; it applies to the separate Remotion package under `video/`.
- Root TypeScript compilation config: Not detected. The root package relies on Bun’s direct TS transpilation instead of a root `tsconfig.json`.
- ESLint, Biome, Vitest, and Jest config: Not detected at the repo root.
## Platform Requirements
- Node.js 20+ and Bun are the baseline requirements from `package.json`.
- A TTY is required for interactive Ink flows in `src/util/prompt.ts` and `src/commands/mcp/add.ts`.
- `git` CLI is required for add/update flows sourced from repositories via `src/util/git-utils.ts` and the `src/commands/*/add.ts` / `src/commands/*/update.ts` command groups.
- `sqlite3` CLI or `python3` is optionally required for Cursor legacy rule/token access fallbacks in `src/util/cursor-user-rules.ts` and `src/util/cursor-api.ts`.
- `npx` and `ffmpeg` are required only for demo media generation in `video/build.sh`.
- Deployment target is a local developer machine, not a hosted server. The distributed artifact is `dist/cli.mjs`, invoked through `bin/ap.js`.
- The CLI assumes access to user home directories and tool-specific config locations resolved in `src/targets/adapters.ts`, including macOS-specific paths for Cursor and Qoder plus platform branches for Qoder on Windows/Linux.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Command handlers live in verb-focused files under `src/commands/<group>/`, for example `src/commands/skills/add.ts`, `src/commands/rules/sync.ts`, and `src/commands/mcp/rm.ts`.
- Interactive command entry points use `.tsx` and a `show` naming pattern, for example `src/commands/skills/show.tsx`, `src/commands/commands/show.tsx`, and `src/commands/rules/show.tsx`.
- Core persistence and domain helpers use noun-based files under `src/core/`, for example `src/core/registry.ts`, `src/core/config.ts`, and `src/core/command-store.ts`.
- Shared utilities use kebab-case under `src/util/`, for example `src/util/command-meta.ts`, `src/util/fs-utils.ts`, and `src/util/remote-find.ts`.
- Tests mirror the production module or behavior name at top level in `tests/`, for example `tests/options.test.ts`, `tests/skills-update.test.ts`, and `tests/prompt-review-confirm.test.ts`.
- Exported command handlers use `cmd<Group><Action>` camelCase names, for example `cmdSkillsAdd` in `src/commands/skills/add.ts` and `cmdRulesCollect` in `src/commands/rules/collect.ts`.
- Utility helpers use plain camelCase with imperative verbs, for example `parseOptions` in `src/util/options.ts`, `loadConfig` in `src/core/config.ts`, and `normalizeRepoUrl` in `src/core/registry.ts`.
- React components use PascalCase function names, for example `MultiSelect` in `src/ui/multi-select.tsx` and `ReviewConfirm` in `src/ui/review-confirm.tsx`.
- Local variables are short camelCase names that describe filesystem or CLI state, for example `srcPath`, `destExists`, `refFlag`, `tmpApgHome`, and `interactive` in `src/commands/skills/add.ts`.
- CLI flag-derived locals are usually suffixed with `Flag`, for example `nameFlag`, `refFlag`, `scopeFlag`, and `cwdFlag` in `src/commands/rules/add.ts` and `src/commands/skills/manage-utils.ts`.
- Types and aliases use PascalCase, often with domain suffixes such as `ConfigV1`, `RepoRecord`, `McpConfigSpec`, `TargetAdapter`, and `CliRunContext` in `src/core/config.ts`, `src/core/registry.ts`, `src/core/mcp-types.ts`, `src/targets/adapters.ts`, and `src/runner/cli.ts`.
- Versioned persisted shapes are explicitly suffixed with `V1`, for example `ConfigV1`, `TargetConfigV1`, `RegistryFileV1`, and `SyncStateV1`.
- Small state machines prefer string-literal unions, for example `type EntryStatus = 'new' | 'replace' | 'same'` in `src/commands/skills/sync.ts`.
## Code Style
- Use the repo-level `.editorconfig` and `.prettierrc.yml`.
- Indentation is 2 spaces, line endings are LF, final newlines are required, and trailing whitespace is trimmed except in Markdown: `.editorconfig`.
- Prettier rules are `singleQuote: true`, `semi: true`, `trailingComma: all`, and `printWidth: 120`: `.prettierrc.yml`.
- TypeScript source uses ESM-style relative imports with explicit `.js` extensions even inside `.ts` files, for example `src/cli.ts` imports `./runner/cli.js` and `src/commands/skills/add.ts` imports `../../core/skill-store.js`.
- No active ESLint, Biome, or TypeScript lint config is present at repo root. No `eslint.config.*`, `.eslintrc*`, or `biome.json` was detected.
- A leftover suppression exists in `src/cli.ts` (`eslint-disable-next-line no-console`), so match the existing style but do not rely on an enforced lint pipeline.
## Import Organization
- Not detected. All imports use relative paths such as `../util/options.js` and `../../core/registry.js`.
## Error Handling
- CLI handlers report user-facing failures via `process.stderr.write(...)` and return numeric exit codes instead of throwing, for example `src/runner/cli.ts`, `src/commands/skills/add.ts`, and `src/commands/rules/add.ts`.
- Top-level process failures are caught once in `src/cli.ts`, logged with `console.error`, and mapped to `process.exitCode = 1`.
- Recoverable filesystem and parsing failures often fall back to safe defaults, for example `pathExists` in `src/util/fs-utils.ts`, `loadConfig` in `src/core/config.ts`, and `parseCommandMeta` in `src/util/command-meta.ts`.
- Invariant violations and misuse of interactive helpers still throw hard errors, for example `throw new Error('Interactive prompt requires a TTY')` in `src/util/prompt.ts` and `throw new Error('useResolve must be used inside runInk')` in `src/ui/render.tsx`.
## Logging
- Normal CLI output goes to stdout and status/warning output often goes to stderr, especially during collect/sync flows such as `src/commands/skills/collect.ts` and `src/commands/rules/collect.ts`.
- Colored output is centralized through `src/util/ansi.ts` and adapter label helpers in `src/targets/adapters.ts`.
- Structured logging libraries are not used.
## Comments
- Comments are used for section dividers, CLI intent, and filesystem/tool compatibility notes rather than line-by-line narration, for example `src/util/prompt.ts`, `src/targets/adapters.ts`, and `src/commands/skills/manage-utils.ts`.
- Match the surrounding file’s tone. The codebase mixes English and Chinese comments, for example `src/util/command-meta.ts`, `src/targets/adapters.ts`, and `tests/mcp-config-io.test.ts`.
- Short doc comments are common on exported types and helpers in infrastructure files such as `src/util/cli-defs.ts`, `src/util/command-meta.ts`, and `src/util/git-utils.ts`.
- Command handlers themselves usually rely on clear naming plus inline section comments instead of full TSDoc blocks.
## Function Design
- Files such as `src/commands/skills/add.ts`, `src/commands/skills/rm.ts`, and `src/commands/commands/collect.ts` contain long, workflow-style functions that sequence validation, scanning, previewing, and writes.
- Pure transformations and storage primitives are pushed into smaller helpers under `src/util/` and `src/core/`.
- Command handlers almost always accept `(positionals, flags, ctx)`, for example `src/commands/skills/list.ts`, `src/commands/commands/update.ts`, and `src/commands/mcp/collect.ts`.
- Internal helpers prefer a single object parameter when there are more than a few inputs, for example `gatherTargetSkills(...)` in `src/commands/skills/manage-utils.ts` and `selectTargetAdapters(...)` in `src/targets/select-targets.ts`.
- Commands return `Promise<number>` exit codes.
- Store and parser helpers return `null`, empty arrays, or empty objects on “not found / invalid input” cases rather than raising user-facing errors, for example `getCommandMdPath` in `src/core/command-store.ts`, `readMcpServers` in `src/util/mcp-config-io.ts`, and `parseCommandMeta` in `src/util/command-meta.ts`.
## Module Design
- There are no barrel files in `src/`; `export *` or re-export aggregator modules were not detected.
- Files generally expose a small cluster of related functions and types, for example `src/core/command-store.ts` and `src/util/options.ts`.
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
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- All execution starts in `src/cli.ts`, then routes through `src/runner/cli.ts` into a content-type-specific command module.
- The command surface is mirrored by domain under `src/commands/skills/`, `src/commands/agents/`, `src/commands/commands/`, `src/commands/rules/`, and `src/commands/mcp/`.
- The app has no server, database, or long-lived daemon. State is persisted as files under the central home resolved by `src/util/apg-paths.ts`.
## Layers
- Purpose: Parse argv, resolve aliases, print help/version, and dispatch to the correct command handler.
- Location: `src/cli.ts`, `src/runner/cli.ts`, `src/runner/help.ts`, `src/util/command-path.ts`, `src/util/options.ts`, `src/util/cli-defs.ts`
- Contains: Process entrypoint, alias resolution, option parsing, help-text generation, exit-code handling.
- Depends on: Command handlers in `src/commands/**`, metadata in `src/meta.ts`.
- Used by: `bin/ap.js` and `bin/ap-dev.js`.
- Purpose: Implement lifecycle operations such as `add`, `collect`, `sync`, `rm`, `show`, and `organize`.
- Location: `src/commands/skills/*.ts`, `src/commands/agents/*.ts`, `src/commands/commands/*.ts`, `src/commands/rules/*.ts`, `src/commands/mcp/*.ts`
- Contains: User-facing workflows, dry-run handling, interactive prompts, preview generation, and mutation sequencing.
- Depends on: `src/core/*.ts`, `src/targets/*.ts`, `src/util/*.ts`, `src/ui/*.tsx`.
- Used by: `runCli()` in `src/runner/cli.ts`.
- Purpose: Define the canonical local store and persist registry/config/sync metadata.
- Location: `src/core/skill-store.ts`, `src/core/agent-store.ts`, `src/core/command-store.ts`, `src/core/rule-store.ts`, `src/core/mcp-store.ts`, `src/core/registry.ts`, `src/core/config.ts`, `src/core/sync-state.ts`
- Contains: Central path conventions, content discovery, canonical agent parsing, registry records, target defaults, and per-target sync hashes.
- Depends on: `src/util/apg-paths.ts`, `src/util/fs-utils.ts`, normalization helpers such as `src/util/rule-utils.ts`.
- Used by: Nearly every mutating and listing command.
- Purpose: Translate a logical target like `codex` or `cursor` plus `local/global` scope into concrete filesystem/config paths.
- Location: `src/targets/adapters.ts`, `src/targets/select-targets.ts`, `src/util/scope.ts`, `src/util/project-root.ts`
- Contains: `TargetAdapter`, alias tables, per-tool directory conventions, MCP config specs, and interactive target selection.
- Depends on: Node path utilities and the current working directory.
- Used by: All `sync`, `collect`, `show --target`, `rm --target`, and `organize` commands.
- Purpose: Convert between the central canonical representations and each target tool's on-disk format.
- Location: `src/util/agent-transform.ts`, `src/util/command-transform.ts`, `src/util/rule-transform.ts`, `src/util/mcp-transform.ts`, `src/util/mcp-config-io.ts`, `src/util/global-rules-store.ts`, `src/util/cursor-user-rules.ts`, `src/util/hash-dir.ts`, `src/util/item-utils.ts`, `src/util/sync-conflict.ts`, `src/util/sync-preview.ts`
- Contains: Canonical rule and MCP models, command directory/file conversion, agent TOML/markdown conversion, target capability checks, conflict handling, and preview rendering.
- Depends on: `src/core/*-store.ts`, `src/targets/adapters.ts`, filesystem helpers.
- Used by: `sync`, `collect`, `organize`, `show`, and validation flows.
- Purpose: Provide TTY-only browsing, selection, confirmation, and review flows.
- Location: `src/util/prompt.ts`, `src/ui/render.tsx`, `src/ui/select.tsx`, `src/ui/multi-select.tsx`, `src/ui/confirm.tsx`, `src/ui/review-confirm.tsx`, `src/ui/file-browser.tsx`, `src/ui/file-viewer.tsx`, `src/ui/skill-browser.tsx`
- Contains: Ink components and a thin adapter API consumed by command modules.
- Depends on: `ink`, `react`, and metadata readers such as `src/util/skill-meta.ts`.
- Used by: `show` commands and interactive variants of `sync`, `collect`, `rm`, and `organize`.
## Data Flow
- Canonical content lives outside the repo by default under the paths built by `src/util/apg-paths.ts`, such as `~/.agent-plugins/skills`, `~/.agent-plugins/agents`, and `~/.agent-plugins/mcp`.
- Target defaults live in `ConfigV1` in `src/core/config.ts`.
- Source provenance lives in `RegistryFileV1` in `src/core/registry.ts`.
- Incremental sync bookkeeping lives in `SyncStateV1` in `src/core/sync-state.ts`.
## Key Abstractions
- Purpose: Encapsulate how one external tool exposes skills, agents, commands, rules, and MCP configuration.
- Examples: `src/targets/adapters.ts`
- Pattern: Data-driven adapter table. New targets extend the `adapters` array instead of changing command logic everywhere.
- Purpose: Represent each managed artifact in one stable home format before copying to tool-specific targets.
- Examples: `src/core/skill-store.ts`, `src/core/command-store.ts`, `src/core/agent-store.ts`, `src/core/rule-store.ts`, `src/core/mcp-store.ts`
- Pattern: Small store modules that expose path helpers plus listing/read/write functions.
- Purpose: Remove tool-specific syntax differences before comparing or syncing items.
- Examples: `src/util/agent-transform.ts`, `src/util/command-transform.ts`, `src/util/rule-transform.ts`, `src/util/mcp-transform.ts`
- Pattern: Parse target/native content into canonical structures, then serialize back per target capability.
- Purpose: Keep command modules mostly UI-framework-agnostic.
- Examples: `src/util/prompt.ts`, `src/ui/*.tsx`
- Pattern: Thin imperative wrappers around reusable Ink components.
## Entry Points
- Location: `bin/ap.js`
- Triggers: `ap` or `agent-plugins`
- Responsibilities: Load `dist/cli.mjs` with a Node-compatible shebang wrapper.
- Location: `bin/ap-dev.js`
- Triggers: `apd` or direct Bun execution
- Responsibilities: Load `src/cli.ts` directly for local development.
- Location: `src/cli.ts`
- Triggers: Both wrapper scripts
- Responsibilities: Build argv, call `runCli()`, and convert thrown errors into exit code `1`.
## Error Handling
- Invalid CLI usage returns `1` after printing help from `src/runner/help.ts`.
- Non-interactive flows avoid prompts and require explicit flags, for example in `src/targets/select-targets.ts` and `src/util/organize.ts`.
- Tool-specific fallbacks are encoded in utilities, for example `src/util/cursor-user-rules.ts` falls back from Cursor API to SQLite or file override.
- Read helpers generally return empty/default state on missing files, for example `loadConfig()` in `src/core/config.ts` and `loadSyncState()` in `src/core/sync-state.ts`.
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
