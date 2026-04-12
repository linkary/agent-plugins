# Technology Stack

**Analysis Date:** 2026-04-12

## Languages

**Primary:**
- TypeScript - Main application language in `src/cli.ts`, `src/runner/cli.ts`, `src/core/*.ts`, `src/util/*.ts`, and `tests/*.test.ts`.

**Secondary:**
- TSX / React JSX - Terminal UI components in `src/ui/*.tsx` and interactive command screens such as `src/commands/skills/show.tsx`, `src/commands/commands/show.tsx`, and `src/commands/rules/show.tsx`.
- JavaScript (ESM) - Thin executable wrappers in `bin/ap.js` and `bin/ap-dev.js`.
- Bash - Video asset build script in `video/build.sh`.
- Markdown / MDC / TOML / JSON / YAML - Core content and config formats handled by `src/core/agent-store.ts`, `src/util/rule-transform.ts`, `src/util/mcp-config-io.ts`, `src/core/mcp-store.ts`, and `.prettierrc.yml`.

## Runtime

**Environment:**
- Node.js `>=20` - Declared in `package.json`; the published CLI entrypoint is `dist/cli.mjs`, launched through `bin/ap.js`.
- Bun - Primary local runtime for build, dev, and test scripts in `package.json` (`build`, `dev`, `test`).
- Browser/runtime service dependencies are not required for the main CLI. The app is a local terminal program started from `src/cli.ts`.

**Package Manager:**
- Bun - Primary workflow is implied by `bun.lock` and Bun-based scripts in `package.json`.
- npm - `package-lock.json` is also present, so dependency installs have been run through npm at least once.
- Lockfile: present (`bun.lock`, `package-lock.json`)

## Frameworks

**Core:**
- Ink `^6.6.0` - Terminal UI framework used by `src/ui/render.tsx`, `src/ui/select.tsx`, `src/ui/file-browser.tsx`, and `src/ui/file-viewer.tsx`.
- React `^19.1.0` - Component model for Ink screens in `src/ui/*.tsx` and `src/commands/*/show.tsx`.

**Testing:**
- Bun test runner - All automated tests import from `bun:test`; 46 test files were detected under `tests/*.test.ts`.

**Build/Dev:**
- Bun build - `package.json` builds `src/cli.ts` into `dist/cli.mjs` with `bun build --target node --format esm`.
- Shiki CLI / ANSI highlighting - `@shikijs/cli` plus `shiki` power syntax-highlighted terminal file viewing in `src/ui/file-viewer.tsx`.
- `smol-toml` - TOML parse/stringify layer for Codex agent metadata and MCP configs in `src/core/agent-store.ts`, `src/util/agent-transform.ts`, and `src/util/mcp-config-io.ts`.
- Remotion - Separate media package in `video/package.json` for demo asset generation, not part of the main CLI runtime.

## Key Dependencies

**Critical:**
- `ink` `^6.6.0` - Interactive TUI surface for prompts and browsers in `src/util/prompt.ts` and `src/ui/*.tsx`.
- `react` `^19.1.0` - Required by Ink-rendered components in `src/ui/*.tsx`.
- `smol-toml` `^1.6.0` - Needed to read and write Codex-style TOML agent and MCP files in `src/core/agent-store.ts` and `src/util/mcp-config-io.ts`.
- `@shikijs/cli` `^3.22.0` - Used directly by `src/ui/file-viewer.tsx` for terminal syntax highlighting.

**Infrastructure:**
- `@types/bun`, `@types/node`, `@types/react` - Type support for the Bun/Node/React toolchain in `package.json`.
- `@remotion/cli`, `remotion`, `@remotion/google-fonts`, `@remotion/transitions` - Video-only tooling in `video/package.json`.
- `react-dom` - Video rendering dependency in `video/package.json`.
- `react-devtools-core` - Declared in `package.json`; no direct imports were detected in `src/`, so treat it as ancillary unless new code proves a runtime dependency.

## Configuration

**Environment:**
- Central storage root is configurable through `APG_HOME` or `AGENT_PLUGINS_HOME` in `src/util/apg-paths.ts`.
- Codex global target paths are configurable through `CODEX_HOME` in `src/targets/adapters.ts`.
- Cursor global rules fallback file is configurable through `AP_CURSOR_USER_RULES_FILE` in `src/util/cursor-user-rules.ts`.
- Remote discovery endpoints and cache behavior are configurable through `APG_FIND_SKILLS_API`, `SKILLS_API_URL`, `APG_FIND_GITHUB_API`, `APG_FIND_CACHE_TTL_SEC`, `APG_FIND_DISABLE_CACHE`, `GITHUB_TOKEN`, and `GH_TOKEN` in `src/util/remote-find.ts`.
- No `.env` file usage is implemented in code. Environment is read directly from `process.env` in the modules above.

**Build:**
- `package.json` - Primary build/test/dev script surface for the CLI.
- `.prettierrc.yml` - Only formatting config detected at the repo root.
- `video/tsconfig.json` - The only `tsconfig` detected; it applies to the separate Remotion package under `video/`.
- Root TypeScript compilation config: Not detected. The root package relies on Bun’s direct TS transpilation instead of a root `tsconfig.json`.
- ESLint, Biome, Vitest, and Jest config: Not detected at the repo root.

## Platform Requirements

**Development:**
- Node.js 20+ and Bun are the baseline requirements from `package.json`.
- A TTY is required for interactive Ink flows in `src/util/prompt.ts` and `src/commands/mcp/add.ts`.
- `git` CLI is required for add/update flows sourced from repositories via `src/util/git-utils.ts` and the `src/commands/*/add.ts` / `src/commands/*/update.ts` command groups.
- `sqlite3` CLI or `python3` is optionally required for Cursor legacy rule/token access fallbacks in `src/util/cursor-user-rules.ts` and `src/util/cursor-api.ts`.
- `npx` and `ffmpeg` are required only for demo media generation in `video/build.sh`.

**Production:**
- Deployment target is a local developer machine, not a hosted server. The distributed artifact is `dist/cli.mjs`, invoked through `bin/ap.js`.
- The CLI assumes access to user home directories and tool-specific config locations resolved in `src/targets/adapters.ts`, including macOS-specific paths for Cursor and Qoder plus platform branches for Qoder on Windows/Linux.

---

*Stack analysis: 2026-04-12*
