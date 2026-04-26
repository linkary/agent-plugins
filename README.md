# agent-plugins (ap)

A CLI tool for centralized management and cross-tool synchronization of **LLM Agent Skills**, **Subagents**, and **Commands**.

<div align="center">
  <a href="assets/intro.mp4">
    <img src="assets/intro.gif" alt="agent-plugins demo" width="800" />
  </a>
  <br />
  <sub>Click to watch in full quality</sub>
</div>

## Core Conventions

- Central skills directory (default): `$HOME/.agent-plugins/skills/<skill-name>/`
- Central agents directory (default): `$HOME/.agent-plugins/agents/<agent-name>/`
- Central commands directory (default): `$HOME/.agent-plugins/commands/<command-name>/`
- `add/rm/update` commands operate on central items by default.
- `sync`: Central -> Target tool (one-way copy, supports conflict resolution).
- `collect`: Target tool -> Central (collects items scattered across different tools, supports conflict resolution).
- Commands support two forms: **file-form** (single `.md` file) and **directory-form** (a directory containing multiple files).
- Rules use a canonical prompt-rule model. Sync/collect converts between Cursor (`.mdc`) and Claude/Qoder (`.md`) formats automatically.
- MCP sync/collect now uses target-aware conversion. Unsupported transport/fields are marked as `incompatible`/`lossy` before write.

You can override the default directories using environment variables:

- `APG_HOME` or `AGENT_PLUGINS_HOME`: Overrides `~/.agent-plugins`.
- `CODEX_HOME`: Overrides Codex's `~/.codex` (affects Codex global paths).

## Installation and Build

This project is developed/built using Bun, but the artifacts can run under Node.js (>= 20):

```bash
bun run build
node dist/cli.mjs --help
```

After publishing to npm, two command entry points will be provided:

- `ap` (short alias)
- `agent-plugins` (full name)

## Interactive Experience

Interactive features (selection, conflict resolution, browsing) use an ink-based TUI:

- **SkillBrowser / CommandBrowser**: Two-panel view with a navigable list on the left and metadata on the right. Supports search (`/`), vim-style navigation (`j/k/f/b/d/u/g/G`), and Enter to open.
- **FileBrowser**: Directory-based navigation for directory-form items.
- **FileViewer**: Syntax-highlighted file viewer with scrolling support.

## Command Overview

`skills`, `agents`, `commands`, `rules`, and `mcp` share lifecycle-style subcommands. `organize` is compatibility-aware: it scans target tools, previews exact duplicates, and only proposes safe mutations.

### Skills

```bash
# List central skills
ap skills list

# Find skills (local + remote)
ap skills find [query]
ap skills find react --limit 10
ap skills find react --offline

# Browse and inspect skills (interactive TUI)
ap skills show

# Add a skill (git URL or local path)
ap skills add <git-url|local-path> [--name <skill>] [--ref <ref>] [--force]

# Update skills (based on the source recorded during 'add')
ap skills update [<skill>...] [--all] [--dry-run] [--force]

# Sync: Central -> Target Tool
ap skills sync [<skill>...] --target <target> [--scope local|global] [--dry-run] [--force]

# Collect: Target Tool -> Central
ap skills collect [<skill>...] --target <target> [--scope local|global] [--all] [--dry-run] [--force]

# Remove skills (interactive mode when no args given)
ap skills rm [<skill>...] [--target <...>] [--scope local|global] [--dry-run]

# Organize exact duplicate skills across selected target tools
ap skills organize [<skill>...] --target <target> [--scope local|global] [--dry-run] [--force]
```

### Commands

```bash
# List central commands
ap commands list

# Find commands (local + remote)
ap commands find [query]

# Browse and inspect commands (interactive TUI)
ap commands show

# Add a command (git URL or local path)
ap commands add <git-url|local-path> [--name <cmd>] [--ref <ref>] [--force]

# Update commands
ap commands update [<command>...] [--all] [--dry-run] [--force]

# Sync: Central -> Target Tool
ap commands sync [<command>...] --target <target> [--scope local|global] [--dry-run] [--force]

# Collect: Target Tool -> Central
ap commands collect [<command>...] --target <target> [--scope local|global] [--all] [--dry-run] [--force]

# Remove commands
ap commands rm [<command>...] [--target <...>] [--scope local|global] [--dry-run]

# Organize exact duplicate commands across selected target tools
ap commands organize [<command>...] --target <target> [--scope local|global] [--dry-run] [--force]
```

### Agents

```bash
# List central agents
ap agents list

# Find agents (local + remote)
ap agents find [query]

# Add an agent (git URL or local path)
ap agents add <git-url|local-path> [--name <agent>] [--ref <ref>] [--force]

# Update agents
ap agents update [<agent>...] [--all] [--dry-run] [--force]

# Sync: Central -> Target Tool
ap agents sync [<agent>...] --target <target> [--scope local|global] [--dry-run] [--force]

# Collect: Target Tool -> Central
ap agents collect [<agent>...] --target <target> [--scope local|global] [--all] [--dry-run] [--force]

# Remove agents
ap agents rm [<agent>...] [--target <...>] [--scope local|global] [--dry-run]

# Organize exact duplicate agents across selected target tools
ap agents organize [<agent>...] --target <target> [--scope local|global] [--dry-run] [--force]
```

### Rules

```bash
# List central rules
ap rules list

# Find rules (local + remote)
ap rules find [query]

# Browse and inspect rules (interactive TUI)
ap rules show [rule]
ap rules show --target cursor --scope local

# Add rules from git URL, local path, or rule file
ap rules add <git-url|local-path|rule-file> [--name <rule>] [--ref <ref>] [--force]

# Sync: Central -> Target Tool
ap rules sync [<rule>...] --target <target> [--scope local|global] [--dry-run] [--force]

# Collect: Target Tool -> Central
ap rules collect [<rule>...] --target <target> [--scope local|global] [--dry-run] [--force]

# Remove rules
ap rules rm [<rule>...] [--target <...>] [--scope local|global] [--dry-run]

# Validate rules (empty files / basename conflicts)
ap rules validate

# Organize exact duplicate prompt-rules across selected target tools
ap rules organize [<rule>...] --target <target> [--scope local|global] [--dry-run] [--force]
```

### MCP

```bash
# List central MCP servers
ap mcp list

# Find MCP servers (local + remote)
ap mcp find [query]

# Browse and inspect MCP server definitions
ap mcp show [server]

# Organize exact duplicate MCP servers across selected target tools
ap mcp organize [<server>...] --target <target> [--scope local|global] [--dry-run] [--force]
```

Note: `ap rules sync/collect/rm --target cursor --scope global` now operates on Cursor **User Rules (Settings text)** using managed blocks.  
Storage backend defaults to:

- `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` (`ItemTable[aicontext.personalContext]`)
- Optional override for automation/testing: `AP_CURSOR_USER_RULES_FILE=/path/to/text-file`

### Aliases

Root groups support abbreviations:

| Full       | Aliases               |
| ---------- | --------------------- |
| `skills`   | `skill`, `sk`, `s`    |
| `agents`   | `ag`                  |
| `commands` | `command`, `cmd`, `c` |
| `rules`    | `rule`, `rl`, `r`     |

Subcommands also support abbreviations (parsed by position):

```bash
ap s ls           # skills list
ap s a /path      # skills add
ap s o            # skills organize
ap c ls           # commands list
ap c show         # commands show
```

### Compatibility-Aware Organize

- `organize` compares exact canonical content only. Same name is not enough.
- Skills are the only v1 workflow with safe promotion into a shared destination: Gemini CLI + Agents can consolidate into `.agents/skills`.
- Commands, agents, rules, and MCP mostly remain preview/report-only in cross-tool cases because their official storage models are still tool-specific.
- `organize` does not rewrite `config.json`; later `sync` can recreate removed copies if your include lists still target them.

### Targets

`--target` supports `all`, comma-separated values (e.g., `--target cursor,codex`), or repeated flags (e.g., `--target cursor --target codex`).

Supported targets: `cursor`, `gemini`, `codex`, `claude-code`, `antigravity`, `agents`, `opencode`, `qoder`.

## Sync Targets and Default Paths (macOS)

`--scope global` is the default. `--scope local` defaults to the git root as the project root (uses current directory if git root is not found).
Qoder rules are the exception: `ap rules sync --target qoder` defaults to `local` because Qoder documents project-specific rules only.

### Skills Paths

| Target               | local                       | global                                 |
| -------------------- | --------------------------- | -------------------------------------- |
| Cursor               | `<project>/.cursor/skills/` | `~/.cursor/skills/`                    |
| Gemini CLI           | `<project>/.gemini/skills/` | `~/.gemini/skills/`                    |
| Codex                | `<project>/.codex/skills/`  | `$CODEX_HOME/skills/`                  |
| Claude Code          | `<project>/.claude/skills/` | `~/.claude/skills/`                    |
| Antigravity          | `<project>/.agent/skills/`  | `~/.gemini/antigravity/global_skills/` |
| Agentskills            | `<project>/.agents/skills/` | `~/.agents/skills/`                    |
| OpenCode             | `<project>/.opencode/skills/` | `~/.opencode/skills/`                |
| Qoder                | `<project>/.qoder/skills/`    | `~/.qoder/skills/`                   |

### Commands Paths

| Target               | local                         | global                                   |
| -------------------- | ----------------------------- | ---------------------------------------- |
| Cursor               | `<project>/.cursor/commands/` | `~/.cursor/commands/`                    |
| Gemini CLI           | `<project>/.gemini/commands/` | `~/.gemini/commands/`                    |
| Codex                | `<project>/.codex/commands/`  | `$CODEX_HOME/commands/`                  |
| Claude Code          | `<project>/.claude/commands/` | `~/.claude/commands/`                    |
| Antigravity          | `<project>/.agent/commands/`  | `~/.gemini/antigravity/global_commands/` |
| Agentskills            | `<project>/.agents/commands/` | `~/.agents/commands/`                    |
| OpenCode             | `<project>/.opencode/commands/` | `~/.opencode/commands/`               |
| Qoder                | `<project>/.qoder/commands/`    | `~/.qoder/commands/`                  |

### Rules Paths

| Target               | local                      | global                                |
| -------------------- | -------------------------- | ------------------------------------- |
| Cursor               | `<project>/.cursor/rules/` | `~/.cursor/rules/`                    |
| Gemini CLI           | `<project>/.gemini/rules/` | `~/.gemini/rules/`                    |
| Codex                | `<project>/.codex/rules/`  | `$CODEX_HOME/rules/`                  |
| Claude Code          | `<project>/.claude/rules/` | `~/.claude/rules/`                    |
| Antigravity          | `<project>/.agent/rules/`  | `~/.gemini/antigravity/global_rules/` |
| Agentskills            | `<project>/.agents/rules/` | `~/.agents/rules/`                    |
| OpenCode             | `<project>/.opencode/rules/` | `~/.opencode/rules/`                |
| Qoder                | `<project>/.qoder/rules/`    | `-`                                |

Cursor special case (global scope):

- `sync/collect/rm` for `cursor` + `global` uses Cursor User Rules text storage (Settings) instead of only relying on `~/.cursor/rules/`.

Qoder special case (local scope):

- `sync` writes a managed always-apply file to `<project>/.qoder/rules/agent-plugins-global.md`.
- `global` scope is skipped for Qoder rules because the official Qoder rules docs describe project-local rules only.

### Rules Compatibility

- Prompt-rule sync/collect with conversion: `cursor`, `claude-code`, `qoder`
- Skipped as incompatible for prompt rules:
  - `codex` (uses execution-policy `.rules`)
  - `gemini`, `antigravity`, `agents`, `opencode`

## Configuration and State Files

- Configuration: `$APG_HOME/config.json`
  - `defaultScope` (local/global) for each target.
  - `include` for each target (skills to sync; supports `["*"]` for all).
  - `includeCommands` for each target (commands to sync; supports `["*"]` for all).
  - `includeRules` for each target (rules to sync; supports `["*"]` for all).
- State: `$APG_HOME/sync-state.json`
  - Records the last synced hash for each target/scope (and projectRoot for local). Used to determine if "the target side has been manually modified" and optimize conflict resolution.

## Conflict Strategy

- Both `sync` and `collect` compare directory content hashes.
- In case of conflict:
  - Non-interactive environment: Requires `--force` (otherwise exits with error).
  - Interactive environment: Prompts to choose `overwrite / backup / skip / keep both ...`.
