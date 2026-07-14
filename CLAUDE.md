# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`agent-plugins` (CLI: `ap` / `agent-plugins`, dev alias `apd`) is a CLI for centrally managing and cross-tool syncing five kinds of AI agent artifacts — **skills**, **agents** (subagents), **commands**, **rules**, and **MCP server configs** — across Cursor, Codex, Claude Code, Google Antigravity, Agentskills, OpenCode, and Qoder/QoderCLI.

The mental model is a hub-and-spoke: a central store at `~/.agent-plugins/` is the source of truth; each supported tool is a "target". `sync` copies central → target (one-way), `collect` pulls target → central, and `organize` deduplicates identical items already scattered across targets.

## Commands

```bash
bun run dev            # run the CLI from source (src/cli.ts)
bun run build          # bundle src/cli.ts -> dist/cli.mjs (ESM, node target)
bun test               # run all tests in tests/
bun test tests/adapters.test.ts        # run a single test file
bun test -t "resolveAdapter"           # run tests matching a name
node dist/cli.mjs --help               # run the built artifact
```

- Runtime: **Bun** for dev/build/test; the published artifact `dist/cli.mjs` is ESM and runs on **Node.js >= 20**.
- `@shikijs/cli` and `shiki` are marked `--external` in the build (kept as runtime deps).
- There is no `tsconfig.json`; TypeScript is handled by Bun. There is no separate lint step — Prettier (`.prettierrc.yml`: single quotes, semicolons, `trailingComma: all`, `printWidth: 120`) is the style authority.

## Architecture

Layered, function-first (no classes). Data flows: CLI entry → router → command handler → core stores + target adapters + util helpers.

- **`src/cli.ts`** — thin entrypoint; calls `runCli(argv, { cwd })`.
- **`src/runner/`** — `cli.ts` routes `<group> <subcommand>` to `cmd<Group><Action>` handlers; `help.ts` renders help. Pure dispatch, no business logic.
- **`src/commands/<group>/<action>.ts`** — one file per subcommand. Groups: `skills`, `agents`, `commands`, `rules`, `mcp`. Every handler has the signature `(positionals, flags, ctx) => Promise<number>` (returns exit code). `show.tsx` handlers render Ink TUIs.
- **`src/targets/adapters.ts`** — the `TargetAdapter` registry. Each target resolves its own skills/agents/commands/rules directories and MCP config spec per `{ scope, projectRoot, homeDir }`. This is the **single place** that encodes where each tool stores things. `filterCommandAdapters`/`filterAgentAdapters`/`filterRuleAdapters` express which targets support which artifact types (e.g. `agents` target is skills-only; `antigravity` has no subagents).
- **`src/core/`** — stateful data layer over `~/.agent-plugins/`: `registry.ts` (`registry.json` — records every added item and its `source`), `config.ts` (`config.json` — per-target `defaultScope` and `include*` lists), `sync-state.ts` (`sync-state.json` — last-synced content hashes for conflict detection), plus per-artifact stores (`skill-store`, `agent-store`, `command-store`, `rule-store`, `mcp-store`).
- **`src/util/`** — pure helpers (I/O helpers excepted). Notable: `cli-defs.ts` (single source of truth for options/subcommands — help text is generated, never hardcoded), `scope.ts`/`project-root.ts` (resolve local project root via git), `hash-dir.ts` + `sync-conflict.ts` (content-hash-based conflict resolution), `*-transform.ts` (format conversion between tools, e.g. Cursor `.mdc` ↔ Claude `.md`, MCP transport translation), `apg-paths.ts` (all central-store path resolution + env overrides).
- **`src/ui/`** — Ink/React (`.tsx`) terminal components (selectors, browsers, viewers, confirm prompts).

### Key cross-cutting behaviors

- **Scope**: `global` is the default everywhere except Qoder rules (project-local only). `local` resolves the project root from the git root (falls back to cwd).
- **Conflict resolution**: `sync` and `collect` compare directory content hashes against `sync-state.json`. Status is `new`/`same`/`replace` (target matches last sync) or `conflict` (target changed underneath us). Non-interactive requires `--force`; interactive prompts overwrite/backup/skip.
- **Format conversion**: rules and MCP are not copied verbatim — they are transformed per target, and unsupported fields are flagged `incompatible`/`lossy` before write. Skills/agents/commands are copied as directory trees.
- **Special cases worth knowing**: Cursor global rules live in SQLite User Rules (`state.vscdb`), not a directory; Codex uses TOML (`config.toml`, agents as TOML) and global-only MCP; Antigravity maps commands → workflows and has single-file global rules; Qoder rules are local-only.

## Conventions (enforced by `.cursor/rules/`)

- **Async only** — use `node:fs/promises`; no sync I/O. Atomic writes go through `writeJsonFileAtomic` (tmp file → rename).
- **Functional** — pure functions, immutability, factory functions (`defaultConfig()`) over mutable globals; no classes.
- **Imports** — relative imports use the `.js` extension (`./foo.js`); Node builtins use the `node:` prefix; types use `import type`. No re-exporting of imported packages.
- **Naming** — files `kebab-case.ts`; types `PascalCase` (versioned as `TypeNameV1`); command handlers `cmd<Group><Action>`; getters `get*`, loaders `load*`/`save*`.
- **Adding a new target**: add a `TargetAdapter` entry in `adapters.ts`, then update `defaultConfig()` in `core/config.ts` and the target description in `util/cli-defs.ts`. Adapter IDs are lowercase kebab-case.
- **Tests**: `bun test`; add `tests/<module>.test.ts` for new util/core modules. Comments are typically in Chinese in this codebase.

## Environment variables

- `APG_HOME` / `AGENT_PLUGINS_HOME` — override the `~/.agent-plugins` central store.
- `CODEX_HOME` — override Codex's `~/.codex` (affects Codex global paths).
- `AP_CURSOR_USER_RULES_FILE` — override Cursor User Rules storage (automation/testing).

## Docs

`docs/reference/*.md` contains code-derived reference for each artifact type's per-target paths, scope, formats, and special cases. `README.md` (and `README.zh.md`) is the concise overview; keep exhaustive target tables in the docs, not the README.
