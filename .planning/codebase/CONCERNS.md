# Codebase Concerns

**Analysis Date:** 2026-04-12

## Tech Debt

**Cross-item repo tracking uses a skill-shaped schema:**
- Issue: `src/core/registry.ts` uses one `RepoRecord` shape with a `skills` array for skills, agents, commands, and rules. The same field is then reused in `src/commands/agents/add.ts`, `src/commands/agents/update.ts`, `src/commands/commands/add.ts`, and `src/commands/commands/update.ts`.
- Status: Confirmed.
- Files: `src/core/registry.ts`, `src/commands/agents/add.ts`, `src/commands/agents/update.ts`, `src/commands/commands/add.ts`, `src/commands/commands/update.ts`
- Impact: The naming mismatch raises cognitive load, makes the update/remove code harder to reason about, and increases the chance of copy-paste bugs when adding new item types.
- Fix approach: Replace the shared `skills` field with an item-neutral name such as `items`, or split repo records by item type.

**Discovery logic has drifted away from storage/import formats:**
- Issue: remote discovery still assumes legacy file names, while the local import/store logic now accepts broader shapes.
- Status: Confirmed.
- Files: `src/util/remote-find.ts`, `src/core/command-store.ts`, `src/core/agent-store.ts`, `src/util/agent-transform.ts`, `src/commands/commands/add.ts`
- Impact: Search results can under-represent repositories that the local add/collect flows can actually consume.
- Fix approach: Move format detection into shared helpers and make remote discovery reuse the same naming/storage rules as add/collect.

## Known Bugs

**Command remote search misses the command formats this repo actually supports:**
- Symptoms: `ap commands find` searches GitHub code for `COMMAND.md`, but local command import accepts plain `.md` files, directory-form commands with `<name>.md`, and `index.md`.
- Status: Confirmed.
- Files: `src/util/remote-find.ts`, `src/commands/commands/find.ts`, `src/commands/commands/add.ts`, `src/core/command-store.ts`, `tests/remote-find.test.ts`
- Trigger: Searching for commands stored as `commands/refactor.md` or `commands/refactor/index.md`.
- Workaround: Add the repository directly with `ap commands add <repo>` instead of relying on remote discovery.

**Agent remote search only covers legacy `AGENT.md` repositories:**
- Symptoms: remote discovery ignores canonical agent layouts based on `agent.toml` plus `prompt.md`, and it also ignores `.md` file-form agents.
- Status: Confirmed.
- Files: `src/util/remote-find.ts`, `src/core/agent-store.ts`, `src/util/agent-transform.ts`
- Trigger: Searching for agents stored in canonical Codex-style or normalized central-store format.
- Workaround: Add the repo directly or point the CLI at a local path.

**Invalid target MCP config is treated as empty and then rewritten:**
- Symptoms: `readExistingConfig` swallows parse failures and returns `{}`. The next `writeMcpServer` or `removeMcpServer` call rewrites the file from that empty base.
- Status: Confirmed.
- Files: `src/util/mcp-config-io.ts`, `tests/mcp-config-io.test.ts`
- Trigger: Malformed JSON/TOML, unsupported TOML constructs, or partial manual edits in a target tool config.
- Workaround: Repair the target config before running MCP sync/remove/update commands.

## Security Considerations

**Path traversal safeguards exist for rules, but not for skills, agents, commands, or MCP names:**
- Risk: Raw item names are joined into filesystem paths without a normalization step like `normalizeRulePath`.
- Status: Confirmed.
- Files: `src/core/skill-store.ts`, `src/core/command-store.ts`, `src/core/mcp-store.ts`, `src/core/agent-store.ts`, `src/commands/skills/add.ts`, `src/commands/skills/rm.ts`, `src/commands/commands/add.ts`, `src/commands/commands/rm.ts`, `src/commands/mcp/add.ts`, `src/commands/agents/add.ts`, `src/commands/agents/rm.ts`, `src/util/rule-utils.ts`
- Current mitigation: Rules are protected by `normalizeRulePath` in `src/util/rule-utils.ts`.
- Recommendations: Introduce a shared item-name validator for all non-rule item types before any `path.join`, read, write, or delete operation.

**Symlinked content is copied by dereferencing the real target path:**
- Risk: `copyDir` follows symbolic links and copies the resolved target, even if it lives outside the source repository or source directory.
- Status: Confirmed.
- Files: `src/util/copy-dir.ts`, `src/commands/skills/add.ts`, `src/commands/skills/update.ts`, `src/commands/commands/add.ts`, `src/commands/commands/update.ts`, `src/core/agent-store.ts`, `src/util/command-transform.ts`, `src/util/item-utils.ts`
- Current mitigation: `.git` is ignored, but there is no source-root containment check for symlinks.
- Recommendations: Skip symlinks by default or enforce that `realpath` stays under the expected source root before copying.

**Dry-run for manual MCP creation can echo secrets back to the terminal:**
- Risk: `ap mcp add --dry-run` prints the full server definition, including `env` values collected interactively or passed via flags.
- Status: Confirmed.
- Files: `src/commands/mcp/add.ts`
- Current mitigation: None detected.
- Recommendations: Redact `env` values in display output and only show env key names.

## Performance Bottlenecks

**Repo updates do a fresh serial clone for every tracked repo:**
- Problem: skills, commands, and agents update flows all create a temp directory, perform `git clone --depth 1`, and process repos one by one.
- Status: Confirmed.
- Files: `src/commands/skills/update.ts`, `src/commands/commands/update.ts`, `src/commands/agents/update.ts`
- Cause: There is no persistent mirror/cache, no fetch-based refresh path, and no bounded parallelism.
- Improvement path: Keep a reusable cache of cloned repos, switch to `git fetch`, and parallelize with a small concurrency cap.

**Hashing and copy paths re-scan full directory trees repeatedly:**
- Problem: sync/update/compare code walks whole directories and computes recursive hashes for commands and agents during each operation.
- Status: Confirmed.
- Files: `src/util/hash-dir.ts`, `src/util/item-utils.ts`, `src/util/agent-transform.ts`, `src/commands/commands/update.ts`
- Cause: No persistent content index or changed-file shortcut exists.
- Improvement path: Cache hashes by mtime/size, or compute incremental metadata during add/update operations instead of rescanning.

## Fragile Areas

**Most write paths mutate destination state in place instead of staging atomically:**
- Files: `src/commands/skills/update.ts`, `src/commands/commands/update.ts`, `src/core/agent-store.ts`, `src/util/mcp-config-io.ts`
- Why fragile: several flows delete or clear the destination before the replacement copy/write fully succeeds. A crash or thrown error can leave the managed item half-written or empty.
- Safe modification: stage into a sibling temp path, validate, then swap with rename plus backup/rollback.
- Test coverage: `tests/skills-update.test.ts` covers one happy path for skills; equivalent failure-path coverage is not present for commands or agents.

**Cursor rule sync relies on a reverse-engineered private API plus external local fallbacks:**
- Files: `src/util/cursor-api.ts`, `src/util/cursor-user-rules.ts`
- Why fragile: the code explicitly depends on a non-public Cursor API and then falls back to `sqlite3` or `python3` on the local machine. Any upstream API change or missing local binary can break rule sync.
- Safe modification: keep the file override path working, isolate the transport behind a stronger adapter boundary, and add smoke tests around fallback selection.
- Test coverage: `tests/cursor-api.test.ts` and `tests/cursor-user-rules.test.ts` validate mocked behavior, but not live compatibility.

## Scaling Limits

**Cursor Knowledge Base sync caps reads at 200 items:**
- Current capacity: `listKnowledgeBase` requests `limit: 200`.
- Status: Confirmed.
- Files: `src/util/cursor-api.ts`
- Limit: users with more than 200 non-generated knowledge-base rules can fall out of sync because extra records are never read.
- Scaling path: add pagination or repeated fetches until the API returns no more results.

## Dependencies at Risk

**Cursor integration depends on an unpublished upstream contract:**
- Risk: `src/util/cursor-api.ts` documents that the API was reverse-engineered from Cursor internals and may change with Cursor releases.
- Status: Confirmed.
- Impact: rule sync/update/remove can fail without any repo change when Cursor changes its service contract.
- Migration plan: prefer a supported public API if one appears; otherwise isolate version-specific transport logic and add compatibility probes.

**TOML rewrite path uses a serializer that does not preserve comments:**
- Risk: `src/util/mcp-config-io.ts` notes that TOML round-tripping drops comments.
- Status: Confirmed.
- Impact: hand-edited target config files lose human context after MCP writes.
- Migration plan: use an AST-preserving TOML editor or restrict writes to machine-managed sections.

## Missing Critical Features

**There is no lint command or CI pipeline enforcing behavior across platforms/runtimes:**
- Problem: the repo exposes destructive filesystem and config-mutating commands, but `package.json` only defines `build`, `dev`, `prepack`, and `test`, and no `.github/workflows/` directory is present.
- Status: Confirmed for the missing safeguard. The resulting regression risk is inferred.
- Blocks: safe refactors, consistent Node-vs-Bun validation, and automated protection against filesystem/config regressions.

**There is no shared validation layer for item names and source roots:**
- Problem: rules have a dedicated validator, but the other item families do not.
- Status: Confirmed.
- Blocks: confidently exposing add/rm/sync flows to untrusted repos, symlink-heavy repos, or user-supplied names without risking path escape behavior.

## Test Coverage Gaps

**Update flows are unevenly tested:**
- What's not tested: `src/commands/commands/update.ts` and `src/commands/agents/update.ts` do not have dedicated update tests comparable to `tests/skills-update.test.ts`.
- Files: `src/commands/commands/update.ts`, `src/commands/agents/update.ts`, `tests/skills-update.test.ts`
- Risk: regressions in repo refresh, partial overwrite, and missing-item handling can ship unnoticed.
- Priority: High

**Security-sensitive path handling is untested outside the rules subsystem:**
- What's not tested: traversal attempts in names/flags and symlinked source content across skills, agents, commands, and MCP flows.
- Files: `src/commands/skills/add.ts`, `src/commands/skills/rm.ts`, `src/commands/agents/add.ts`, `src/commands/agents/rm.ts`, `src/commands/commands/add.ts`, `src/commands/commands/rm.ts`, `src/commands/mcp/add.ts`, `src/util/copy-dir.ts`
- Risk: unsafe file writes/deletes or unintended file import can remain latent until a user hits an edge case.
- Priority: High

**Node runtime support is documented but not separately verified:**
- What's not tested: README states the built artifact runs on Node.js `>=20`, but the test command is `bun test` and no Node-specific smoke suite is present.
- Files: `README.md`, `package.json`
- Risk: build or runtime drift can appear only after publishing or user installation.
- Priority: Medium

---

*Concerns audit: 2026-04-12*
