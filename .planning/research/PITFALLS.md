# Domain Pitfalls

**Domain:** Documentation reliability for code-derived reference docs
**Researched:** 2026-04-12

## Critical Pitfalls

### Pitfall 1: Treating local implementation as unquestioned truth
**What goes wrong:** The generator emits clean-looking reference docs from `src/targets/adapters.ts` and transform code, but some of those claims can still be wrong because the implementation may encode bugs, stale assumptions, or partial coverage of special cases.
**Why it happens:** "Generated from code" is mistaken for "verified against reality." In this repo that is already risky: the current README path matrices drift from implementation in multiple places, and implementation itself contains target behavior that depends on special handling outside the main adapter table.
**Consequences:** Generated docs become high-confidence falsehoods. Maintainers stop checking source code because the docs look authoritative. Future changes optimize for the docs instead of real target behavior.
**Prevention:** Treat generated docs as a compilation artifact plus verification layer, not a pure extraction layer. Every generated claim should have provenance:
- `implementation`: which function/file produced the claim
- `official-source`: the target vendor doc that confirms or contradicts it
- `confidence`: `verified`, `implementation-only`, or `disputed`
Use fail-closed rules for disputed claims: either block publication or render an explicit warning.
**Detection:** Add a doc-audit test that compares generated target matrices against curated assertions for known sharp edges:
- Cursor global rules are not a directory path in this repo; they go through `src/util/global-rules-store.ts` and `src/util/cursor-user-rules.ts`
- Claude Code global rules are not `~/.claude/rules/`; they map to `~/.claude/CLAUDE.md`
- Qoder global rules are unsupported; local rules live in `.qoder/rules/`
- Antigravity command/skill naming in README is already a drift signal and should be treated as suspect input, not source truth

### Pitfall 2: Missing special-case behavior because the extractor only reads the matrix file
**What goes wrong:** The generator documents only the simple path table and misses behavior encoded in sync commands, fallback stores, or transform utilities.
**Why it happens:** `src/targets/adapters.ts` looks like the canonical source, but it is not sufficient by itself. Important behavior is split across:
- `src/util/global-rules-store.ts`
- `src/util/cursor-user-rules.ts`
- `src/util/cursor-api.ts`
- `src/commands/rules/sync.ts`
- `src/util/rule-transform.ts`
- `src/util/agent-transform.ts`
- `src/util/mcp-config-io.ts`
**Consequences:** Docs say the right file path but the wrong operational behavior. Users follow docs and hit hidden exceptions around global rules, fallback storage, additive sync, lossy transforms, or unsupported target kinds.
**Prevention:** Build documentation from a composed model, not one file. The generator should merge:
- path resolution
- supported scopes
- format and extension mapping
- unsupported modes
- special-case write/read behavior
- lossy conversion notes
Require a source-coverage test that asserts every rendered special-case section is backed by at least one explicit extractor from non-adapter code.
**Detection:** A repo-specific lint can scan generated docs for targets with global rules or format conversions and fail if the output omits keywords like `Cursor User Rules`, `CLAUDE.md`, `alwaysApply`, `mcp_servers`, `lossy`, or `unsupported`.

### Pitfall 3: Letting local assumptions override official docs for external tool behavior
**What goes wrong:** The repo documents target behavior based on what `agent-plugins` currently does, even when the target vendor documents a different source of truth.
**Why it happens:** Local code is easier to inspect than vendor docs, and some integrations are reverse engineered. The sharpest example is Cursor: `src/util/cursor-api.ts` explicitly says the Knowledge Base API is non-public and may break as Cursor changes. That is implementation detail, not stable product contract.
**Consequences:** Generated docs become a mix of true target behavior and repo-specific workaround behavior without saying which is which. Readers cannot tell when to trust the vendor over this tool.
**Prevention:** Use this precedence rule:
1. Official target docs define target semantics and supported storage models.
2. Local implementation defines how `agent-plugins` currently interoperates with that target.
3. If they differ, generated docs must say so explicitly and label the local behavior as compatibility logic or fallback behavior.

External official docs should override local assumptions at least for:
- Cursor rule storage and precedence
- Claude Code instruction loading and `.claude/rules/` semantics
- Qoder project-only rules and limits
- Codex `CODEX_HOME`, `config.toml`, and project config behavior
**Detection:** Keep a small checked-in verification manifest with `url`, `checked_at`, `claim`, and `expected_local_mapping`. Regenerate docs only after re-checking that manifest on target-related changes.

### Pitfall 4: Testing single examples instead of the full path/format matrix
**What goes wrong:** A handful of passing tests give false confidence while large parts of the target matrix remain unverified.
**Why it happens:** The repo already has strong targeted tests, but docs reliability needs a different test shape: matrix coverage, not just representative samples.
**Consequences:** Generated docs are correct for the tested happy paths but wrong for platform-specific or environment-specific edges. Regressions hide in unsupported or rarely used combinations until docs ship.
**Prevention:** Add a generated-doc oracle test suite over this minimum matrix:
- Target: `cursor`, `gemini`, `codex`, `claude-code`, `antigravity`, `openskills`, `agents`, `opencode`, `qoder`
- Artifact: `skills`, `agents`, `commands`, `rules`, `mcp`
- Scope: `local`, `global`
- Platform: `darwin`, `linux`, `win32` for platform-aware paths like Qoder app data
- Env overrides: `CODEX_HOME`, `APG_HOME`, `AGENT_PLUGINS_HOME`, `AP_CURSOR_USER_RULES_FILE`
- Format variants: Cursor `.mdc`, Claude/Qoder `.md`, Codex TOML, JSON vs TOML MCP
- Capability variants: supported, unsupported, exec-rule, lossy/incompatible

The test output should assert both machine-readable facts and rendered markdown snippets.
**Detection:** Track coverage as matrix cells, not line coverage. A docs build should report untested cells and fail if any required cell is uncovered.

### Pitfall 5: Silent lossy conversion turning into silent documentation lies
**What goes wrong:** The docs imply exact parity across targets even when conversions intentionally drop information or map concepts imperfectly.
**Why it happens:** The code already acknowledges lossy behavior:
- `src/util/mcp-config-io.ts` does not preserve TOML comments
- MCP sync marks unsupported fields as `incompatible` or `lossy`
- Rules map different frontmatter schemas (`globs` vs `paths`)
- Codex rules are not prompt rules at all
**Consequences:** Users trust generated docs as round-trip guarantees and then hit surprising behavior during sync or collect.
**Prevention:** Make lossiness a first-class doc field. Each generated reference section should include:
- `round_trip_safe: yes/no`
- `data_loss_risk`
- `unsupported_fields`
- `semantic_mismatch`
**Detection:** Add round-trip tests for every supported conversion path and assert that lossy sections are rendered whenever the conversion test reports dropped or transformed data.

### Pitfall 6: README migration causing rollout regressions
**What goes wrong:** The root `README.md` is trimmed aggressively, but generated docs are incomplete, poorly linked, or harder to discover than the old tables.
**Why it happens:** Moving content is treated as cleanup rather than a user-facing rollout. The repo currently relies on README tables as a quick entry point, even though they drift.
**Consequences:** Users lose fast answers, external links break, search results land on thinner pages, and contributors keep editing stale mental models because the overview no longer points clearly to authoritative docs.
**Prevention:** Roll out in phases:
1. Keep README overview plus stable links to generated target docs.
2. Preserve one concise "how to find paths and exceptions" section in README during transition.
3. Add link-check and anchor-check tests in CI.
4. Keep generated pages on stable paths so future README edits do not break external references.
5. Add a short "special cases" summary in README pointing to Cursor global rules, Qoder local-only rules, Codex MCP global-only, and CLAUDE.md behavior.
**Detection:** Add smoke checks for:
- every README doc link resolves
- generated doc pages contain expected headings
- key search terms from today’s README still exist somewhere in generated docs

## Moderate Pitfalls

### Pitfall 1: Reverse-engineered or fallback integrations being documented as product guarantees
**What goes wrong:** Cursor API fallback behavior is presented as if Cursor officially supports that access pattern.
**Prevention:** Mark reverse-engineered behavior as repo compatibility logic. Do not phrase it as "Cursor stores X in Y" without qualification when the code itself says the API is non-public.

### Pitfall 2: Generated docs flattening precedence and scope rules
**What goes wrong:** Docs list locations but omit precedence or loading rules, which changes meaning.
**Prevention:** For rules/instructions targets, render precedence and load semantics next to paths. Cursor team/project/user precedence and Claude broader-to-more-specific loading behavior matter as much as path strings.

### Pitfall 3: Tests verify structured facts but not rendered narrative
**What goes wrong:** The JSON model behind docs is correct, but the markdown template phrases it incorrectly or drops caveats.
**Prevention:** Snapshot-test final markdown for a few critical targets, not just the intermediate data model.

## Minor Pitfalls

### Pitfall 1: Environment-variable overrides disappearing from docs
**What goes wrong:** Users follow default path docs and miss `CODEX_HOME` or `AP_CURSOR_USER_RULES_FILE`.
**Prevention:** Treat env overrides as part of the path model, not footnotes.

### Pitfall 2: Special filenames being documented without behavioral context
**What goes wrong:** Docs mention `AGENTS.md`, `CLAUDE.md`, or managed markdown files without explaining when they are imported, always applied, or conflict-resolved.
**Prevention:** Pair each filename with its load rules and precedence.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Source extraction | Reading only `adapters.ts` and missing behavioral code elsewhere | Build a composed extractor and assert source coverage per claim |
| Official verification | Publishing repo behavior as vendor truth | Add a checked-date verification manifest against official docs |
| Matrix testing | Happy-path tests only | Require target × artifact × scope × platform × env matrix coverage |
| Format conversion | Lossy transforms hidden in prose | Render explicit lossiness metadata and round-trip tests |
| README migration | Broken discoverability after moving tables | Keep stable README links and add link/anchor smoke tests |
| Release gating | Shipping docs while validation is partial | Fail docs publish when disputed claims or uncovered matrix cells remain |

## Sources

### Repo Sources
- `.planning/PROJECT.md`
- `README.md`
- `src/targets/adapters.ts`
- `src/util/global-rules-store.ts`
- `src/util/cursor-user-rules.ts`
- `src/util/cursor-api.ts`
- `src/commands/rules/sync.ts`
- `src/util/rule-transform.ts`
- `src/util/agent-transform.ts`
- `src/util/mcp-config-io.ts`
- `tests/adapters.test.ts`
- `tests/rule-transform.test.ts`
- `tests/rules-sync-qoder.test.ts`
- `tests/mcp-config-io.test.ts`

### External Sources
- OpenAI Codex advanced configuration: https://developers.openai.com/codex/config-advanced
- Cursor rules docs: https://cursor.com/help/customization/rules
- Cursor rules reference: https://cursor.com/docs/rules
- Claude Code memory and `CLAUDE.md` loading: https://docs.anthropic.com/en/docs/claude-code/memory
- Qoder intro and project rules: https://docs.qoder.com/plugins/introduction
- Qoder rules reference: https://docs.qoder.com/user-guide/rules
