# Feature Landscape

**Domain:** Generated target-reference documentation for a multi-target CLI that manages skills, commands, agents, rules, and MCP definitions
**Project:** agent-plugins
**Researched:** 2026-04-12

## Table Stakes

Features maintainers should expect from a trustworthy reference-doc system. Missing these means the docs are likely to drift or mislead.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Code-derived target matrix | This repo already encodes target truth in `src/targets/adapters.ts`, `src/util/rule-transform.ts`, `src/util/agent-transform.ts`, `src/util/command-transform.ts`, and `src/util/mcp-transform.ts`; hand-maintained tables are the exact drift problem this project is trying to solve. | Med | Generate per target and per item family: supported scopes, paths, storage format, aliases, unsupported cases, and special handling. |
| Per-family reference pages | Maintainers need one reliable place for `skills`, `commands`, `agents`, `rules`, and `mcp` behavior instead of reconstructing it from README prose and source. | Med | Each page should answer: where does it live, what formats are accepted, what is unsupported, and what transforms happen on sync/collect. |
| Explicit scope semantics | Scope handling is not uniform across targets. Claude Code has user/project/local distinctions, Codex supports project and global config, Cursor has user rules outside project dirs, and Qoder rules are effectively project-local. | Med | Docs must show scope support as a capability table, not a blanket “local/global” column. |
| Special-case behavior called out inline | This repo has meaningful exceptions: Cursor global rules use managed user-rules text storage, Codex agents use TOML, Antigravity commands map to workflows, some targets do not support agents or commands, and MCP conversion can be lossy or incompatible. | Med | Do not hide exceptions in footnotes. Put them beside the relevant claim. |
| Unsupported and lossy behavior surfaced | Maintainable reference docs must state what the CLI cannot faithfully preserve, especially for MCP and rules. | Med | Examples: unsupported transports, dropped fields, prompt-rule vs exec-rule mismatch, no local/global support, or “preview only” organize behavior. |
| Provenance for every nontrivial claim | When docs disagree with code or vendor docs, maintainers need to know which source won. | Med | Every generated section should link back to source files or tests, and external claims should include vendor-doc URLs plus verification date. |
| Verification status on claims | “Documented” is not enough when code may be wrong. Maintainers need claim states such as code-confirmed, externally confirmed, externally contradicted, or unverified. | Med | This is table stakes for this repo because `PROJECT.md` explicitly treats verification as part of the feature. |
| Tests for generated reference invariants | The repo already tests adapters/help/transforms. The docs system needs equivalent checks so docs cannot silently drift from code. | Med | Good checks: every target/family combination appears once, every documented path matches adapter output, every lossy/incompatible flag matches transform tests. |
| README as overview, not source-of-truth | The current README is too large and already serves as a manual matrix. A strong docs system replaces that burden with generated detail pages and concise overview links. | Low | Root README should summarize capabilities and point to generated references. |

## Differentiators

Features that make the docs actually usable for maintainers instead of merely comprehensive.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Claim-level evidence panel | Lets maintainers answer “why does the doc say this?” without grepping the repo. | Med | For each claim, show source file/test path and optional external doc link. This is the fastest path to debugging drift. |
| Disagreement report | Makes the system useful when implementation and official docs diverge, which is likely for fast-moving tools. | High | Add a generated “known mismatches” section: current implementation, vendor-documented behavior, confidence, and required action (`accept`, `fix code`, `re-verify`). |
| Confidence badges by section | Helps maintainers know what is solid versus what still needs validation. | Low | Suggested levels: `HIGH` = code + tests + official docs agree; `MEDIUM` = code + tests only or code + official docs; `LOW` = single-source or suspected drift. |
| Per-target diff view across families | Maintainers often need to compare one target across skills/commands/agents/rules/MCP, not read five isolated pages. | Med | Example: one target summary showing where Codex diverges from filesystem-markdown targets. |
| Machine-readable doc manifest | Makes the documentation reusable in tests, CI, and future UI/CLI commands. | Med | Emit a JSON manifest behind the markdown so assertions and future tooling reuse the same facts. |
| “How to verify this claim” guidance | Makes the docs operational for maintainers, not just descriptive. | Med | Example: for Cursor global rules, point to the adapter logic plus the external Cursor rules docs and the relevant tests. |
| Version/date stamping on external checks | Vendor docs change frequently. Maintainability improves when every external assertion says when it was last checked. | Low | Especially important for Cursor, Claude Code, Codex, and MCP behavior. |

## Anti-Features

Features to explicitly avoid in v1 because they add cost, false confidence, or scope risk.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Hand-edited duplicate matrices across README and generated docs | This recreates the drift problem and guarantees maintenance debt. | Keep one generated reference source and let README link to it. |
| Narrative tutorials for every target workflow | Helpful later, but not the core reliability problem. Tutorials are expensive to keep current and easy to let rot. | Ship concise reference docs first; add tutorials only after the reference layer is stable. |
| Auto-correcting implementation based only on external docs | Vendor docs can be incomplete or wrong for real-world behavior; blindly mutating code from docs is unsafe. | Generate discrepancy reports and require explicit engineering review before code changes. |
| Exhaustive screenshots or UI clickpaths | These decay fast and are not the truth source for a CLI/reference system. | Prefer text references, paths, formats, and official links. |
| Speculative support pages for targets or features not implemented | This makes the docs look more complete while hiding real support boundaries. | Document only behavior backed by code or explicitly marked as future work. |
| Trying to normalize all targets into one fake universal model | The repo’s value comes from preserving target-specific exceptions. Over-normalization hides important behavior. | Use a common schema, but expose divergences prominently. |
| Large LLM-written prose without source attribution | Polished prose is not trustworthy by itself and will be hard to review. | Favor structured tables, generated facts, and short human-curated notes around exceptions. |

## Feature Dependencies

`code-extraction pipeline` -> `per-family reference pages`

`code-extraction pipeline` -> `target matrix`

`target matrix` -> `special-case behavior sections`

`transform analysis` -> `unsupported/lossy behavior surfaced`

`source linking` -> `claim-level evidence panel`

`external verification workflow` -> `confidence badges`

`external verification workflow` -> `disagreement report`

`generated reference pages` -> `README reduction`

`machine-readable manifest` -> `CI/tests for docs invariants`

## Verification Expectations When Code May Disagree With External Docs

This is the most important feature area for this repo.

1. Every generated claim should carry a source class:
   `implementation`, `test`, `official-doc`, or `mixed`.
2. When implementation and official docs agree, mark the claim `verified` and record the check date.
3. When implementation exists but no reliable external doc exists, mark the claim `implementation-only`, not “official.”
4. When official docs and implementation disagree, never collapse them into one sentence. Show both and require a verdict:
   `implementation bug`, `vendor-doc stale`, or `needs manual validation`.
5. For negative claims such as “target does not support X,” require stronger evidence than absence in code comments. Prefer adapter behavior plus official docs or a focused test.
6. External checks should prioritize official docs for current behavior expectations:
   Cursor rules storage and precedence, Claude Code scope tables for agents/MCP/CLAUDE.md, Codex `AGENTS.md` and `config.toml`, and MCP transport/security requirements.
7. The docs should explicitly state when behavior is repo-specific rather than vendor-guaranteed. Example: `agent-plugins` may choose to skip or coerce some fields even if the upstream tool can represent more.

## MVP Recommendation

Prioritize:

1. Code-derived target/family reference pages with explicit unsupported and special-case behavior.
2. Claim provenance and verification status, including external-check date.
3. A disagreement workflow for implementation vs official docs, with CI tests that fail on undocumented drift.

Defer:

- Tutorial-style content: useful, but secondary to trustworthy reference.
- Full UI niceties or screenshot-rich docs: not necessary for v1.
- Auto-remediation of code/doc mismatches: too risky until discrepancy reporting is stable.

## Sources

- Repo source of truth: `src/targets/adapters.ts`, `src/util/apg-paths.ts`, `src/util/rule-transform.ts`, `src/util/agent-transform.ts`, `src/util/command-transform.ts`, `src/util/mcp-transform.ts`, `src/util/cli-defs.ts`
- Repo verification surface: `tests/adapters.test.ts`, `tests/help.test.ts`, `tests/mcp-transform.test.ts`
- Project requirements: `.planning/PROJECT.md`
- Cursor rules docs: https://cursor.com/help/customization/rules
- Claude Code settings: https://docs.anthropic.com/en/docs/claude-code/settings
- Claude Code MCP: https://docs.anthropic.com/en/docs/claude-code/mcp
- Claude Code memory / CLAUDE.md behavior: https://docs.anthropic.com/en/docs/claude-code/memory
- OpenAI Codex app settings: https://developers.openai.com/codex/app/settings
- OpenAI Codex AGENTS.md: https://developers.openai.com/codex/guides/agents-md
- OpenAI Codex MCP: https://developers.openai.com/codex/mcp
- Model Context Protocol specification: https://modelcontextprotocol.io/specification/2025-11-25
- Model Context Protocol transports: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
