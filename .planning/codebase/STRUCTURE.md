# Codebase Structure

**Analysis Date:** 2026-04-12

## Directory Layout

```text
[project-root]/
├── src/                # TypeScript CLI implementation
│   ├── commands/       # User-facing command handlers by content type
│   ├── core/           # Central store and persisted metadata models
│   ├── runner/         # CLI bootstrap and help rendering
│   ├── targets/        # Tool adapters and target-selection logic
│   ├── ui/             # Ink TUI components
│   └── util/           # Shared transforms, filesystem helpers, and previews
├── tests/              # Bun test suite, mostly one file per module/flow
├── bin/                # Runtime wrappers for built and dev CLIs
├── assets/             # Demo media used by README
├── .planning/          # Planning artifacts; `codebase/` is generated analysis output
├── dist/               # Built CLI output, ignored by Git
├── .cursor/            # Local target-tool content, ignored by Git
├── .codex/            # Local target-tool content and GSD materials, ignored by Git
├── .claude/            # Local target-tool content, ignored by Git
├── .qoder/             # Tracked Qoder rule samples
└── video/              # Separate local Remotion demo app, ignored by Git
```

## Directory Purposes

**`src/commands/`:**
- Purpose: Implement the top-level CLI workflows.
- Contains: One mirrored subdirectory per domain: `skills`, `agents`, `commands`, `rules`, `mcp`.
- Key files: `src/commands/skills/sync.ts`, `src/commands/commands/add.ts`, `src/commands/rules/validate.ts`, `src/commands/mcp/show.tsx`

**`src/core/`:**
- Purpose: Define canonical storage layout and persistent metadata/state.
- Contains: `*-store.ts` modules, type definitions, registry/config/sync-state persistence.
- Key files: `src/core/registry.ts`, `src/core/config.ts`, `src/core/sync-state.ts`, `src/core/agent-store.ts`

**`src/runner/`:**
- Purpose: Own CLI bootstrapping and help text generation.
- Contains: Routing entrypoint and help formatter.
- Key files: `src/runner/cli.ts`, `src/runner/help.ts`

**`src/targets/`:**
- Purpose: Map logical targets and scopes to concrete external tool locations.
- Contains: Adapter definitions and selection helpers.
- Key files: `src/targets/adapters.ts`, `src/targets/select-targets.ts`

**`src/ui/`:**
- Purpose: Implement TTY UI primitives and browsers using Ink.
- Contains: Selectors, confirms, file browser/viewer, and the shared browser layout.
- Key files: `src/ui/skill-browser.tsx`, `src/ui/file-browser.tsx`, `src/ui/file-viewer.tsx`

**`src/util/`:**
- Purpose: Hold cross-cutting helpers that do not own persisted state.
- Contains: Target-format transforms, hashing, git helpers, MCP config IO, prompt wrappers, preview rendering, and rule/agent metadata helpers.
- Key files: `src/util/agent-transform.ts`, `src/util/command-transform.ts`, `src/util/rule-transform.ts`, `src/util/mcp-config-io.ts`, `src/util/cursor-user-rules.ts`

**`tests/`:**
- Purpose: Exercise command workflows, transforms, stores, and prompt/UI helpers.
- Contains: Flat test files named after the module or behavior they cover.
- Key files: `tests/skills-sync-preview.test.ts`, `tests/agents-collect-canonical.test.ts`, `tests/mcp-transform.test.ts`, `tests/command-path.test.ts`

**`bin/`:**
- Purpose: Provide executable wrappers with correct shebangs.
- Contains: One production wrapper and one Bun-based development wrapper.
- Key files: `bin/ap.js`, `bin/ap-dev.js`

**`.codex/`, `.cursor/`, `.claude/`:**
- Purpose: Local target directories used for sync/dogfooding against real tool layouts.
- Contains: Skills, commands, rules, agents, and GSD materials such as `.codex/get-shit-done/`.
- Key files: `.codex/skills/gsd-map-codebase/SKILL.md`, `.codex/agents/gsd-codebase-mapper.toml`, `.cursor/rules/core-principle.mdc`

**`video/`:**
- Purpose: Sidecar demo application for generating promotional media.
- Contains: A Remotion project separate from the CLI under `video/src/`.
- Key files: `video/package.json`, `video/src/IntroVideo.tsx`, `video/src/scenes/TerminalSyncScene.tsx`

## Key File Locations

**Entry Points:**
- `bin/ap.js`: Production wrapper that loads `dist/cli.mjs`
- `bin/ap-dev.js`: Development wrapper that loads `src/cli.ts`
- `src/cli.ts`: Process entrypoint
- `src/runner/cli.ts`: Main dispatcher

**Configuration:**
- `package.json`: Package metadata, scripts, dependencies, published entrypoints
- `.editorconfig`: Baseline whitespace and line-ending rules
- `.prettierrc.yml`: Formatter configuration
- `.gitignore`: Marks local target directories, `dist/`, and `video/` as ignored

**Core Logic:**
- `src/targets/adapters.ts`: External tool directory/config mapping
- `src/core/registry.ts`: Source provenance for installed items
- `src/core/config.ts`: Per-target default scope/include rules
- `src/core/sync-state.ts`: Per-target hash tracking
- `src/util/*-transform.ts`: Canonicalization boundaries for agents, commands, rules, and MCP

**Testing:**
- `tests/*.test.ts`: Flat Bun test files
- `package.json`: `bun test` is the test runner command

## Naming Conventions

**Files:**
- Command handlers follow `src/commands/<group>/<action>.ts`, for example `src/commands/skills/add.ts`.
- Interactive command handlers use `.tsx`, for example `src/commands/skills/show.tsx` and `src/commands/mcp/show.tsx`.
- Store modules use `*-store.ts`, for example `src/core/skill-store.ts` and `src/core/mcp-store.ts`.
- Transform modules use `*-transform.ts`, for example `src/util/command-transform.ts`.
- Support helpers use suffixes that match responsibility, such as `*-meta.ts`, `*-utils.ts`, `*-preview.ts`, and `*-path.ts`.
- Tests use `<subject>.test.ts` or `<flow>.test.ts`, for example `tests/rules-sync-qoder.test.ts`.

**Directories:**
- Runtime source folders are plural and role-based: `commands`, `targets`, `tests`.
- Command subdirectories are domain names, not technical layers: `skills`, `agents`, `commands`, `rules`, `mcp`.
- Local content directories use tool-native layouts, for example `.codex/skills/<skill-name>/`, `.cursor/rules/`, and `.qoder/rules/`.

## Where to Add New Code

**New Feature:**
- Primary code: Add the command implementation in the matching domain directory under `src/commands/<group>/`.
- Wire-up: Register CLI metadata in `src/util/cli-defs.ts` and route it from `src/runner/cli.ts`.
- Tests: Add a focused file in `tests/` named for the flow or module, for example `tests/skills-new-command.test.ts`.

**New Component/Module:**
- New command workflow: `src/commands/<group>/<action>.ts`
- New shared content-browser UI: `src/ui/`
- New target adapter or target-path behavior: `src/targets/adapters.ts` and, if selection behavior changes, `src/targets/select-targets.ts`
- New canonical store/state type: `src/core/`

**Utilities:**
- Shared helpers: `src/util/`
- Format conversion logic: Prefer `src/util/*-transform.ts` instead of burying conversion inside command files.
- Filesystem or hash helpers: Extend `src/util/fs-utils.ts`, `src/util/hash-dir.ts`, or `src/util/item-utils.ts` when the behavior is generic.

## Special Directories

**`.planning/codebase/`:**
- Purpose: Generated codebase intelligence documents such as this file.
- Generated: Yes
- Committed: No

**`dist/`:**
- Purpose: Bundled CLI output built from `src/cli.ts`.
- Generated: Yes
- Committed: No

**`.cursor/`:**
- Purpose: Local Cursor target content used for sync/collect testing or dogfooding.
- Generated: No
- Committed: No

**`.codex/`:**
- Purpose: Local Codex target content and GSD workflow materials used as live sync targets.
- Generated: No
- Committed: No

**`.qoder/`:**
- Purpose: Qoder-specific rules sample content currently tracked in the repo.
- Generated: No
- Committed: Yes

**`video/`:**
- Purpose: Separate demo project for rendered CLI videos.
- Generated: No
- Committed: No

---

*Structure analysis: 2026-04-12*
