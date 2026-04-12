# External Integrations

**Analysis Date:** 2026-04-12

## APIs & External Services

**Remote discovery:**
- `skills.sh` - Remote skill search backend used by `src/util/remote-find.ts`.
  - SDK/Client: native `fetch` in `src/util/remote-find.ts`
  - Auth: none by default; endpoint is overrideable through `APG_FIND_SKILLS_API` or `SKILLS_API_URL`
- GitHub Search API - Repository/code search fallback for skills, agents, commands, rules, and MCP discovery in `src/util/remote-find.ts`.
  - SDK/Client: native `fetch` in `src/util/remote-find.ts`
  - Auth: `GITHUB_TOKEN` or `GH_TOKEN`
- Cursor Knowledge Base API - Reverse-engineered Connect RPC endpoint at `https://api2.cursor.sh/aiserver.v1.AiService/*` used for Cursor global rule CRUD in `src/util/cursor-api.ts`.
  - SDK/Client: native `fetch` in `src/util/cursor-api.ts`
  - Auth: Cursor access token extracted from Cursor local storage in `src/util/cursor-api.ts`

**Repository sources:**
- Git repositories on GitHub or arbitrary git remotes - Add/update flows clone or pull content via `git` in `src/util/git-utils.ts`, `src/commands/skills/add.ts`, `src/commands/agents/add.ts`, `src/commands/commands/add.ts`, and `src/commands/rules/add.ts`.
  - SDK/Client: local `git` CLI via `spawn()` in `src/util/git-utils.ts`
  - Auth: inherited from the developer machine’s git credentials; no repo-managed auth flow

**Installed tool ecosystems:**
- Cursor, Gemini CLI, Codex, Claude Code, Antigravity, Openskills, Agents, OpenCode, and Qoder - The CLI syncs content into each tool’s local/global directories and MCP config files using path resolution in `src/targets/adapters.ts`.
  - SDK/Client: local filesystem I/O in `src/commands/*/sync.ts`, `src/util/mcp-config-io.ts`, `src/util/agent-transform.ts`, and `src/util/rule-transform.ts`
  - Auth: none inside this repo; integration assumes the target tool is already installed locally

## Data Storage

**Databases:**
- SQLite - The repo does not own an application database, but it reads and writes Cursor’s local SQLite state file at `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` through `src/util/cursor-user-rules.ts` and `src/util/cursor-api.ts`.
  - Connection: implicit file path from `getCursorStateDbPath()` in `src/util/cursor-user-rules.ts`
  - Client: `sqlite3` CLI or embedded `python3` `sqlite3` fallback
- App-owned database: Not detected

**File Storage:**
- Local filesystem only - Central canonical storage is rooted at `~/.agent-plugins` or the override from `APG_HOME` / `AGENT_PLUGINS_HOME`, resolved in `src/util/apg-paths.ts`.
- Central stores are split by type:
  - Skills: `~/.agent-plugins/skills` via `src/util/apg-paths.ts`
  - Agents: `~/.agent-plugins/agents` via `src/core/agent-store.ts`
  - Commands: `~/.agent-plugins/commands` via `src/core/command-store.ts`
  - Rules: `~/.agent-plugins/rules` via `src/core/rule-store.ts`
  - MCP: `~/.agent-plugins/mcp` via `src/core/mcp-store.ts`
- Media output is written to `assets/` by `video/build.sh`.

**Caching:**
- JSON file cache - Remote find responses are cached in `~/.agent-plugins/cache/remote-find-v1.json` by `src/util/remote-find.ts`.
- Redis / Memcached / external cache service: None

## Authentication & Identity

**Auth Provider:**
- None for first-party application users. The CLI has no login flow and no user account model in `src/`.
  - Implementation: operations run as the local OS user and rely on filesystem access plus optional environment variables

**Outbound credentials:**
- GitHub API tokens - Read from `GITHUB_TOKEN` or `GH_TOKEN` in `src/util/remote-find.ts`.
- Cursor API token - Pulled from Cursor’s local SQLite store by `readCursorAccessToken()` in `src/util/cursor-api.ts`.
- MCP server credentials - Passed through as definition payload fields like `env` and `headers` in `src/core/mcp-types.ts` and `src/util/mcp-config-io.ts`; this repo stores them only when the user explicitly adds them to MCP definitions.

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- CLI stdout/stderr only, using `process.stdout.write`, `process.stderr.write`, and a top-level `console.error` fallback in `src/cli.ts`.
- No metrics backend, tracing SDK, or SaaS observability integration was detected under `src/`.

## CI/CD & Deployment

**Hosting:**
- Not applicable. The main deliverable is a local CLI built from `package.json` into `dist/cli.mjs`.

**CI Pipeline:**
- Not detected. No `.github/` workflow directory or other CI config was found at the repo root.

## File Formats & Touchpoints

**Canonical content formats:**
- Skills use `SKILL.md` directories copied through the skill commands in `src/commands/skills/*.ts`.
- Agents normalize to `agent.toml` + `prompt.md` + optional `resources/` in `src/core/agent-store.ts`.
- Commands support directory-form and file-form Markdown in `src/core/command-store.ts` and `src/util/command-transform.ts`.
- Rules normalize between Cursor `.mdc` and Claude/Qoder `.md` prompt rules in `src/util/rule-transform.ts`.
- Global rule collections serialize as `_global.json` in `src/core/rule-store.ts`.
- MCP server definitions are stored as per-server JSON files in `src/core/mcp-store.ts`.

**Target config touchpoints:**
- Cursor MCP config: `~/.cursor/mcp.json` or `<project>/.cursor/mcp.json` from `src/targets/adapters.ts`
- Gemini MCP config: `~/.gemini/settings.json` or `<project>/.gemini/settings.json` from `src/targets/adapters.ts`
- Codex MCP config: `$CODEX_HOME/config.toml` from `src/targets/adapters.ts`
- Claude Code MCP config: `~/.claude.json` or `<project>/.mcp.json` from `src/targets/adapters.ts`
- Antigravity MCP config: `~/.gemini/antigravity/mcp_config.json` from `src/targets/adapters.ts`
- OpenCode MCP config: `~/.opencode/mcp.json` or `<project>/.opencode/mcp.json` from `src/targets/adapters.ts`
- Qoder MCP config: platform-specific global cache under Qoder app data or local `<project>/.mcp.json` from `src/targets/adapters.ts`

**Single-file global rule touchpoints:**
- Cursor global rules: Cursor Knowledge Base API or legacy `state.vscdb`, abstracted by `src/util/global-rules-store.ts` and `src/util/cursor-user-rules.ts`
- Claude Code global rules: `~/.claude/CLAUDE.md` via `src/util/global-rules-store.ts`
- Antigravity global rules: `~/.gemini/GEMINI.md` via `src/util/global-rules-store.ts`

## Environment Configuration

**Required env vars:**
- No mandatory environment variables are required for basic local filesystem operations.
- Use `APG_HOME` or `AGENT_PLUGINS_HOME` when central storage must live outside `~/.agent-plugins` (`src/util/apg-paths.ts`).
- Use `CODEX_HOME` when Codex global paths should point somewhere other than `~/.codex` (`src/targets/adapters.ts`).
- Use `AP_CURSOR_USER_RULES_FILE` only to bypass Cursor API / SQLite access with a plain-text rule file (`src/util/cursor-user-rules.ts`).
- Use `GITHUB_TOKEN` or `GH_TOKEN` to raise GitHub API limits for remote search (`src/util/remote-find.ts`).
- Use `APG_FIND_SKILLS_API`, `SKILLS_API_URL`, `APG_FIND_GITHUB_API`, `APG_FIND_CACHE_TTL_SEC`, and `APG_FIND_DISABLE_CACHE` to redirect or tune remote search behavior (`src/util/remote-find.ts`).

**Secrets location:**
- No secret files are read from the repo itself.
- Runtime secrets come from `process.env`, external git credentials, or external tool storage such as Cursor’s local SQLite database.

## Webhooks & Callbacks

**Incoming:**
- None detected. No HTTP server, webhook receiver, or callback endpoint exists under `src/`.

**Outgoing:**
- HTTPS requests to `skills.sh` and GitHub Search API from `src/util/remote-find.ts`
- HTTPS requests to Cursor’s Knowledge Base API from `src/util/cursor-api.ts`
- Local child-process calls to `git`, `sqlite3`, and `python3` from `src/util/git-utils.ts`, `src/util/cursor-user-rules.ts`, and `src/util/cursor-api.ts`
- Local media tooling calls to `npx remotion` and `ffmpeg` from `video/build.sh`

---

*Integration audit: 2026-04-12*
