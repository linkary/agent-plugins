# agent-plugins (ap)

A CLI tool for centralized management and cross-tool synchronization of **LLM Agent Skills**.

## Core Conventions

- Central skills directory (default): `$HOME/.agent-plugins/skills/<skill-name>/`
- `add/rm/update/manage` commands operate on central skills by default.
- `sync`: Central → Target tool (one-way copy, supports conflict resolution).
- `collect`: Target tool → Central (collects skills scattered across different tools, supports conflict resolution).

You can override the default directories using environment variables:

- `APG_HOME` or `AGENT_PLUGINS_HOME`: Overrides `~/.agent-plugins`.
- `CODEX_HOME`: Overrides Codex's `~/.codex` (affects Codex global skills path).

## Installation and Build

This project is developed/built using Bun, but the artifacts can run under Node.js:

```bash
bun run build
node dist/cli.cjs --help
```

After publishing to npm, two command entry points will be provided:

- `ap` (short alias)
- `agent-plugins` (full name)

## Interactive Experience

Interactive selection (`sync/collect/manage` and conflict resolution) defaults to using `inquirer` list/multiselect components. It falls back to basic `readline` interaction if dependencies are unavailable.

## Command Overview

```bash
# List central skills
ap skills list

# Add a skill (git URL or local path)
ap skills add <git-url|local-path> [--name <skill>] [--ref <ref>] [--force]

# Update skills (based on the source recorded during 'add')
ap skills update [<skill>...] [--all] [--dry-run] [--force]

# Sync: Central -> Target Tool
ap skills sync [<skill>...] --target <cursor|gemini|codex|claude-code|antigravity|all> [--scope local|global] [--dry-run] [--force]

# Collect: Target Tool -> Central
ap skills collect [<skill>...] --target <cursor|gemini|codex|claude-code|antigravity|all> [--scope local|global] [--all] [--dry-run] [--force]

# Remove central skill (default) or remove skill from target (with --target)
ap skills rm <skill>... [--target <...>] [--scope local|global] [--dry-run]

# Visual Management (Interactive)
ap skills manage
```

Notes:

- `--target` supports `all`, comma-separated values (e.g., `--target cursor,codex`), or repeated flags (e.g., `--target cursor --target codex`).

Subcommands support abbreviations (parsed by position):

```bash
ap s ls
ap s a /path/to/skill --name my-skill
```

## Sync Targets and Default Paths (macOS)

`--scope local` defaults to the git root as the project root (uses current directory if git root is not found).

- Cursor
  - local: `<project>/.cursor/skills/`
  - global: `~/.cursor/skills/`
- Gemini CLI
  - local: `<project>/.gemini/skills/`
  - global: `~/.gemini/skills/`
- Codex
  - local: `<project>/.codex/skills/`
  - global: `$CODEX_HOME/skills/` (default `~/.codex/skills/`)
- Claude Code
  - local: `<project>/.claude/skills/`
  - global: `~/.claude/skills/`
- Google Antigravity
  - local: `<project>/.agent/skills/`
  - global: `~/.gemini/antigravity/global_skills/`

## Configuration and State Files

- Configuration: `$APG_HOME/config.json`
  - `defaultScope` (local/global) for each target.
  - `include` for each target (skills to sync; supports `["*"]` for all).
- State: `$APG_HOME/sync-state.json`
  - Records the last synced hash for each target/scope (and projectRoot for local). usage: Used to determine if "the target side has been manually modified" and optimize conflict resolution.

## Conflict Strategy

- Both `sync` and `collect` compare directory content hashes.
- In case of conflict:
  - Non-interactive environment: Requires `--force` (otherwise exits with error).
  - Interactive environment: Prompts to choose `overwrite / backup / skip / keep both ...`.
