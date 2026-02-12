# agent-plugins (ap)

A CLI tool for centralized management and cross-tool synchronization of **LLM Agent Skills** and **Commands**.

<div align="center">
  <a href="assets/intro.mp4">
    <img src="assets/intro.gif" alt="agent-plugins demo" width="800" />
  </a>
  <br />
  <sub>Click to watch in full quality</sub>
</div>

## Core Conventions

- Central skills directory (default): `$HOME/.agent-plugins/skills/<skill-name>/`
- Central commands directory (default): `$HOME/.agent-plugins/commands/<command-name>/`
- `add/rm/update` commands operate on central items by default.
- `sync`: Central -> Target tool (one-way copy, supports conflict resolution).
- `collect`: Target tool -> Central (collects items scattered across different tools, supports conflict resolution).
- Commands support two forms: **file-form** (single `.md` file) and **directory-form** (a directory containing multiple files).

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

Both `skills` and `commands` share the same subcommand structure.

### Skills

```bash
# List central skills
ap skills list

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
```

### Commands

```bash
# List central commands
ap commands list

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
```

### Aliases

Root groups support abbreviations:

| Full       | Aliases               |
| ---------- | --------------------- |
| `skills`   | `skill`, `sk`, `s`    |
| `commands` | `command`, `cmd`, `c` |

Subcommands also support abbreviations (parsed by position):

```bash
ap s ls           # skills list
ap s a /path      # skills add
ap c ls           # commands list
ap c show         # commands show
```

### Targets

`--target` supports `all`, comma-separated values (e.g., `--target cursor,codex`), or repeated flags (e.g., `--target cursor --target codex`).

Supported targets: `cursor`, `gemini`, `codex`, `claude-code`, `antigravity`, `openskills`, `agents`.

## Sync Targets and Default Paths (macOS)

`--scope global` is the default. `--scope local` defaults to the git root as the project root (uses current directory if git root is not found).

### Skills Paths

| Target               | local                       | global                                 |
| -------------------- | --------------------------- | -------------------------------------- |
| Cursor               | `<project>/.cursor/skills/` | `~/.cursor/skills/`                    |
| Gemini CLI           | `<project>/.gemini/skills/` | `~/.gemini/skills/`                    |
| Codex                | `<project>/.codex/skills/`  | `$CODEX_HOME/skills/`                  |
| Claude Code          | `<project>/.claude/skills/` | `~/.claude/skills/`                    |
| Antigravity          | `<project>/.agent/skills/`  | `~/.gemini/antigravity/global_skills/` |
| Openskills           | `<project>/.agent/skills/`  | `~/.agent/skills/`                     |
| Agents (Vercel Labs) | `<project>/.agents/skills/` | `~/.agents/skills/`                    |

### Commands Paths

| Target               | local                         | global                                   |
| -------------------- | ----------------------------- | ---------------------------------------- |
| Cursor               | `<project>/.cursor/commands/` | `~/.cursor/commands/`                    |
| Gemini CLI           | `<project>/.gemini/commands/` | `~/.gemini/commands/`                    |
| Codex                | `<project>/.codex/commands/`  | `$CODEX_HOME/commands/`                  |
| Claude Code          | `<project>/.claude/commands/` | `~/.claude/commands/`                    |
| Antigravity          | `<project>/.agent/commands/`  | `~/.gemini/antigravity/global_commands/` |
| Openskills           | `<project>/.agent/commands/`  | `~/.agent/commands/`                     |
| Agents (Vercel Labs) | `<project>/.agents/commands/` | `~/.agents/commands/`                    |

## Configuration and State Files

- Configuration: `$APG_HOME/config.json`
  - `defaultScope` (local/global) for each target.
  - `include` for each target (skills to sync; supports `["*"]` for all).
  - `includeCommands` for each target (commands to sync; supports `["*"]` for all).
- State: `$APG_HOME/sync-state.json`
  - Records the last synced hash for each target/scope (and projectRoot for local). Used to determine if "the target side has been manually modified" and optimize conflict resolution.

## Conflict Strategy

- Both `sync` and `collect` compare directory content hashes.
- In case of conflict:
  - Non-interactive environment: Requires `--force` (otherwise exits with error).
  - Interactive environment: Prompts to choose `overwrite / backup / skip / keep both ...`.
