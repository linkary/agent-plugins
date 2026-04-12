# Architecture

**Analysis Date:** 2026-04-12

## Pattern Overview

**Overall:** Layered CLI application with a central canonical content store, tool-specific target adapters, and format-conversion utilities.

**Key Characteristics:**
- All execution starts in `src/cli.ts`, then routes through `src/runner/cli.ts` into a content-type-specific command module.
- The command surface is mirrored by domain under `src/commands/skills/`, `src/commands/agents/`, `src/commands/commands/`, `src/commands/rules/`, and `src/commands/mcp/`.
- The app has no server, database, or long-lived daemon. State is persisted as files under the central home resolved by `src/util/apg-paths.ts`.

## Layers

**CLI Bootstrap and Routing:**
- Purpose: Parse argv, resolve aliases, print help/version, and dispatch to the correct command handler.
- Location: `src/cli.ts`, `src/runner/cli.ts`, `src/runner/help.ts`, `src/util/command-path.ts`, `src/util/options.ts`, `src/util/cli-defs.ts`
- Contains: Process entrypoint, alias resolution, option parsing, help-text generation, exit-code handling.
- Depends on: Command handlers in `src/commands/**`, metadata in `src/meta.ts`.
- Used by: `bin/ap.js` and `bin/ap-dev.js`.

**Command Orchestration:**
- Purpose: Implement lifecycle operations such as `add`, `collect`, `sync`, `rm`, `show`, and `organize`.
- Location: `src/commands/skills/*.ts`, `src/commands/agents/*.ts`, `src/commands/commands/*.ts`, `src/commands/rules/*.ts`, `src/commands/mcp/*.ts`
- Contains: User-facing workflows, dry-run handling, interactive prompts, preview generation, and mutation sequencing.
- Depends on: `src/core/*.ts`, `src/targets/*.ts`, `src/util/*.ts`, `src/ui/*.tsx`.
- Used by: `runCli()` in `src/runner/cli.ts`.

**Central Persistence and Metadata:**
- Purpose: Define the canonical local store and persist registry/config/sync metadata.
- Location: `src/core/skill-store.ts`, `src/core/agent-store.ts`, `src/core/command-store.ts`, `src/core/rule-store.ts`, `src/core/mcp-store.ts`, `src/core/registry.ts`, `src/core/config.ts`, `src/core/sync-state.ts`
- Contains: Central path conventions, content discovery, canonical agent parsing, registry records, target defaults, and per-target sync hashes.
- Depends on: `src/util/apg-paths.ts`, `src/util/fs-utils.ts`, normalization helpers such as `src/util/rule-utils.ts`.
- Used by: Nearly every mutating and listing command.

**Target Resolution and Tool Adapters:**
- Purpose: Translate a logical target like `codex` or `cursor` plus `local/global` scope into concrete filesystem/config paths.
- Location: `src/targets/adapters.ts`, `src/targets/select-targets.ts`, `src/util/scope.ts`, `src/util/project-root.ts`
- Contains: `TargetAdapter`, alias tables, per-tool directory conventions, MCP config specs, and interactive target selection.
- Depends on: Node path utilities and the current working directory.
- Used by: All `sync`, `collect`, `show --target`, `rm --target`, and `organize` commands.

**Format Normalization and Sync Utilities:**
- Purpose: Convert between the central canonical representations and each target tool's on-disk format.
- Location: `src/util/agent-transform.ts`, `src/util/command-transform.ts`, `src/util/rule-transform.ts`, `src/util/mcp-transform.ts`, `src/util/mcp-config-io.ts`, `src/util/global-rules-store.ts`, `src/util/cursor-user-rules.ts`, `src/util/hash-dir.ts`, `src/util/item-utils.ts`, `src/util/sync-conflict.ts`, `src/util/sync-preview.ts`
- Contains: Canonical rule and MCP models, command directory/file conversion, agent TOML/markdown conversion, target capability checks, conflict handling, and preview rendering.
- Depends on: `src/core/*-store.ts`, `src/targets/adapters.ts`, filesystem helpers.
- Used by: `sync`, `collect`, `organize`, `show`, and validation flows.

**Interactive UI and Prompt Layer:**
- Purpose: Provide TTY-only browsing, selection, confirmation, and review flows.
- Location: `src/util/prompt.ts`, `src/ui/render.tsx`, `src/ui/select.tsx`, `src/ui/multi-select.tsx`, `src/ui/confirm.tsx`, `src/ui/review-confirm.tsx`, `src/ui/file-browser.tsx`, `src/ui/file-viewer.tsx`, `src/ui/skill-browser.tsx`
- Contains: Ink components and a thin adapter API consumed by command modules.
- Depends on: `ink`, `react`, and metadata readers such as `src/util/skill-meta.ts`.
- Used by: `show` commands and interactive variants of `sync`, `collect`, `rm`, and `organize`.

## Data Flow

**CLI Command Execution:**

1. `bin/ap.js` or `bin/ap-dev.js` loads `src/cli.ts`.
2. `src/cli.ts` calls `runCli()` in `src/runner/cli.ts`.
3. `runCli()` resolves the command path via `src/util/command-path.ts` and flags via `src/util/options.ts`.
4. The selected handler in `src/commands/<group>/<action>.ts` loads central state from `src/core/*.ts` and target context from `src/targets/*.ts` plus `src/util/scope.ts`.
5. When formats differ, transform utilities in `src/util/*-transform.ts` normalize content before copying or writing.
6. File mutations happen through filesystem helpers or config writers such as `src/util/mcp-config-io.ts`, then sync metadata is updated through `src/core/sync-state.ts`.

**Interactive Browse Flow:**

1. `src/commands/*/show.tsx` gathers entries either from the central store or a target tool.
2. `src/ui/skill-browser.tsx` renders the list and fetches metadata lazily for the highlighted item.
3. Selecting an item switches to `src/ui/file-browser.tsx`, which drills into files and delegates rendering to `src/ui/file-viewer.tsx`.

**Global Rule Sync Flow:**

1. Rule commands read file-based rules from `src/core/rule-store.ts` and global rule items through `src/util/global-rules-store.ts`.
2. `src/util/rule-transform.ts` converts prompt-rule frontmatter into a canonical representation keyed by rule id.
3. For Cursor global rules, `src/util/cursor-user-rules.ts` uses the Knowledge Base API first, then SQLite, then a file override fallback.

**State Management:**
- Canonical content lives outside the repo by default under the paths built by `src/util/apg-paths.ts`, such as `~/.agent-plugins/skills`, `~/.agent-plugins/agents`, and `~/.agent-plugins/mcp`.
- Target defaults live in `ConfigV1` in `src/core/config.ts`.
- Source provenance lives in `RegistryFileV1` in `src/core/registry.ts`.
- Incremental sync bookkeeping lives in `SyncStateV1` in `src/core/sync-state.ts`.

## Key Abstractions

**TargetAdapter:**
- Purpose: Encapsulate how one external tool exposes skills, agents, commands, rules, and MCP configuration.
- Examples: `src/targets/adapters.ts`
- Pattern: Data-driven adapter table. New targets extend the `adapters` array instead of changing command logic everywhere.

**Canonical Central Stores:**
- Purpose: Represent each managed artifact in one stable home format before copying to tool-specific targets.
- Examples: `src/core/skill-store.ts`, `src/core/command-store.ts`, `src/core/agent-store.ts`, `src/core/rule-store.ts`, `src/core/mcp-store.ts`
- Pattern: Small store modules that expose path helpers plus listing/read/write functions.

**Content Canonicalizers:**
- Purpose: Remove tool-specific syntax differences before comparing or syncing items.
- Examples: `src/util/agent-transform.ts`, `src/util/command-transform.ts`, `src/util/rule-transform.ts`, `src/util/mcp-transform.ts`
- Pattern: Parse target/native content into canonical structures, then serialize back per target capability.

**Prompt/UI Adapter:**
- Purpose: Keep command modules mostly UI-framework-agnostic.
- Examples: `src/util/prompt.ts`, `src/ui/*.tsx`
- Pattern: Thin imperative wrappers around reusable Ink components.

## Entry Points

**Production CLI:**
- Location: `bin/ap.js`
- Triggers: `ap` or `agent-plugins`
- Responsibilities: Load `dist/cli.mjs` with a Node-compatible shebang wrapper.

**Development CLI:**
- Location: `bin/ap-dev.js`
- Triggers: `apd` or direct Bun execution
- Responsibilities: Load `src/cli.ts` directly for local development.

**Application Entrypoint:**
- Location: `src/cli.ts`
- Triggers: Both wrapper scripts
- Responsibilities: Build argv, call `runCli()`, and convert thrown errors into exit code `1`.

## Error Handling

**Strategy:** Fail fast with exit codes, print actionable stderr messages, and fall back to less capable storage mechanisms when possible.

**Patterns:**
- Invalid CLI usage returns `1` after printing help from `src/runner/help.ts`.
- Non-interactive flows avoid prompts and require explicit flags, for example in `src/targets/select-targets.ts` and `src/util/organize.ts`.
- Tool-specific fallbacks are encoded in utilities, for example `src/util/cursor-user-rules.ts` falls back from Cursor API to SQLite or file override.
- Read helpers generally return empty/default state on missing files, for example `loadConfig()` in `src/core/config.ts` and `loadSyncState()` in `src/core/sync-state.ts`.

## Cross-Cutting Concerns

**Logging:** Plain `process.stdout.write` and `process.stderr.write` calls inside command modules. No centralized logging subsystem is present.

**Validation:** Command validation is mostly structural and capability-based. Examples include `src/commands/rules/validate.ts`, `getRuleCapability()` in `src/util/rule-transform.ts`, and `serializeCanonicalMcpForTarget()` in `src/util/mcp-transform.ts`.

**Authentication:** The app does not own an auth layer. External tool/API access relies on local environment and tool state, such as `CODEX_HOME` in `src/targets/adapters.ts` and Cursor access token discovery in `src/util/cursor-user-rules.ts`.

---

*Architecture analysis: 2026-04-12*
