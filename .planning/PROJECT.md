# agent-plugins Documentation Reliability

## What This Is

This project improves `agent-plugins` so future development can rely on code-grounded, trustworthy reference documentation instead of stale memory or guessed target behavior. It adds generated documentation for target-specific locations, scope behavior, supported formats, and special cases across skills, commands, agents, rules, and MCP, while reducing the root README to an overview plus links into the generated docs.

## Core Value

Anyone changing target behavior in `agent-plugins` can find one reliable, code-derived source of truth for path, scope, format, and compatibility rules.

## Requirements

### Validated

- ✓ `agent-plugins` manages centralized canonical stores for skills, agents, commands, rules, and MCP definitions — existing
- ✓ `agent-plugins` resolves target-specific local and global paths across Cursor, Gemini, Codex, Claude Code, Antigravity, Openskills, Agents, OpenCode, and Qoder — existing
- ✓ `agent-plugins` already performs target-specific format conversion and compatibility handling for artifacts such as Codex TOML agents, Cursor/Claude/Qoder rules, and MCP config files — existing

### Active

- [ ] Generate reference docs for skills, commands, agents, rules, MCP, and target-wide matrices from code such as `src/targets/adapters.ts` and related format logic
- [ ] Verify generated reference docs with unit tests plus targeted checks against official docs or other reliable web sources where the local code may be wrong
- [ ] Restructure `README.md` into a short overview that links to the generated reference docs instead of carrying the full target matrix inline

### Out of Scope

- Broad new sync features or new target integrations unrelated to documentation reliability — this effort is for trustworthy documentation and verification first
- Manually maintained duplicate reference tables across multiple markdown files — duplicates would drift and undermine the purpose of this work
- Full redesign of existing target behavior unless verification shows the current implementation is wrong and the fix is required to keep the docs reliable

## Context

This is a brownfield TypeScript CLI application built around a central canonical store with target adapters and format-conversion utilities. Existing code already encodes the important truth source for target behavior in files such as `src/targets/adapters.ts`, `src/util/apg-paths.ts`, `src/util/agent-transform.ts`, `src/util/rule-transform.ts`, `src/util/mcp-config-io.ts`, and `src/util/global-rules-store.ts`. The current `README.md` contains large path and compatibility tables, but those tables are cumbersome to maintain and can drift from implementation. The codebase map also surfaced known drift risks and possible bugs in format/discovery logic, so generated docs need explicit verification instead of trusting the code blindly.

## Constraints

- **Brownfield**: Work must preserve existing CLI behavior and documented target support while improving reliability for maintainers
- **Source of truth**: Reference docs must be derived from implementation logic, not maintained as hand-written duplicate tables
- **Verification**: Documentation claims must be backed by unit tests and checked against official docs or other reliable web sources where possible
- **README scope**: The root `README.md` should stay concise and act as a guidepost, not the primary storage location for exhaustive target reference
- **Target complexity**: Some targets have special handling, such as Cursor global rules, Qoder local-only rules, Codex TOML agents, and shared `.agents` behavior that must be represented accurately

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Generate target reference docs from code | Hand-maintained matrices will drift from adapters and format logic | — Pending |
| Keep `README.md` short and link to docs | The README should orient users quickly, while detailed target reference belongs in dedicated docs | — Pending |
| Treat verification as part of the feature, not cleanup | The current code may have bugs, so trusted docs require tests and external cross-checking | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check -> still the right priority?
3. Audit Out of Scope -> reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-12 after initialization*
