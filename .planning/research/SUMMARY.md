# Research Summary

**Project:** agent-plugins  
**Synthesized:** 2026-04-12

## Executive Summary

This repo should solve its documentation problem by generating committed Markdown reference docs from runtime behavior, not by expanding hand-maintained README tables and not by building a docs site first. The reliable source of truth already lives in executable modules such as `src/targets/adapters.ts` and the transform utilities for rules, commands, agents, and MCP. The right architecture is a single normalized manifest derived from those modules, with Markdown pages and JSON artifacts rendered from that shared model.

The v1 product is not “better prose.” It is a trustworthy reference layer for target behavior: paths, supported scopes, storage formats, transform semantics, unsupported cases, lossy conversions, and repo-specific exceptions. That means table stakes are code-derived matrices, explicit special-case handling, provenance for nontrivial claims, and tests that fail when docs drift. The biggest differentiator is making verification visible: each important claim should show whether it is implementation-only, externally confirmed, or disputed.

The main risk is false confidence. “Generated from code” is not enough because this repo already has evidence of drift, and some target behavior depends on special handling outside the main adapter matrix. The roadmap should therefore build extraction and verification together: first stabilize the manifest and test coverage, then render artifact docs, then reduce README tables only after generated pages are complete and linkable.

## Recommended Implementation Direction

- Build a runtime-derived `ReferenceManifest` in TypeScript/Bun and treat it as the only docs source of truth.
- Keep supplement metadata small and typed. Use it only for human labels, official-doc URLs, and notes that cannot be derived from code.
- Render committed Markdown under `docs/reference/` plus machine-readable outputs under `docs/reference/_generated/`.
- Prefer pure extractor and renderer modules with a thin orchestration script such as `scripts/generate-reference.ts`.
- Test the manifest and rendered Markdown with `bun:test` and snapshots. Add a stale-docs check to CI or the local verification flow.
- Keep `README.md` as an overview and entry point, not as the full compatibility matrix.

## Key Findings

### Stack

- TypeScript with repo-native ESM modules is the right generator language because the facts worth documenting are already encoded in executable modules.
- Bun should remain the runtime for generation and verification to avoid stack sprawl and keep docs on the same toolchain as tests.
- A local deterministic Markdown renderer is a better fit than TypeDoc or a docs-site framework for this repo’s behavior matrices.
- TypeDoc is optional only as a later API-doc sidecar, not as the primary source for target reference docs.

### Feature Framing

**Table stakes**

- Code-derived target and artifact matrices.
- Per-family reference pages for `skills`, `commands`, `agents`, `rules`, and `mcp`.
- Explicit scope semantics instead of a simplistic local/global model.
- Special-case behavior called out inline for targets like Cursor, Claude Code, Codex, Antigravity, and Qoder.
- Unsupported and lossy behavior surfaced as first-class facts.
- Claim provenance and verification state for nontrivial assertions.
- Tests that lock generated facts and rendered output to implementation behavior.

**Differentiators**

- Claim-level evidence panels pointing back to source files, tests, and official docs.
- A disagreement report when implementation and vendor docs diverge.
- Confidence badges by section or claim.
- A machine-readable manifest reused by docs, CI, and future tooling.
- Guidance on how maintainers can manually verify high-risk claims.

**Anti-features**

- No duplicate hand-edited matrices across README and generated docs.
- No tutorial-heavy or screenshot-heavy docs in v1.
- No AST scraping or regex-based extraction when runtime imports can express the truth more directly.
- No speculative support pages for behavior not backed by code or clearly labeled as future work.
- No fake “universal” model that hides important target-specific exceptions.

### Architecture

- The system should follow a one-manifest-many-views pattern.
- Extraction must compose facts from `src/targets/adapters.ts` and the relevant transform and store modules, not from `adapters.ts` alone.
- Deterministic path normalization is required so generated output does not vary by machine or platform.
- Verification metadata should live beside implementation facts, not inside prose.
- Generator logic should stay outside runtime command handlers to keep docs work pure and low-risk.

## Architectural Build Order

1. **Reference manifest foundation**
   Deliver a normalized `ReferenceManifest` plus extractor tests.
   This should cover target identity, aliases, scope support, paths, formats, MCP config shape, unsupported cases, and special storage modes.

2. **Verification and evidence layer**
   Attach official-doc URLs, checked dates, confidence levels, and disputed-claim handling.
   This phase prevents the repo from publishing implementation behavior as vendor truth.

3. **Machine-readable outputs**
   Generate `reference-manifest.json` and `verification.json`.
   These outputs make review, testing, and future automation easier before Markdown rendering becomes the main surface.

4. **Artifact reference pages**
   Render `skills`, `commands`, `agents`, `rules`, and `mcp` pages first.
   This is the highest-value slice because the hardest-to-understand repo behavior lives in the transform logic, not in path strings alone.

5. **Target pages and matrix pages**
   Render cross-target support, path, format, and MCP capability matrices from the same manifest.
   Avoid separate page-specific queries that can drift.

6. **README reduction and release gating**
   Replace large README tables with overview links only after generated docs are complete, discoverable, and checked for staleness.

## Roadmap Implications

### Suggested Phase Structure

1. **Docs Model and Extraction**
   Rationale: every later deliverable depends on a correct shared model.
   Deliver: normalized manifest, extraction helpers, deterministic path normalization, focused unit tests.
   Pull from research: code-derived target matrix, explicit scope semantics, no duplicate registry.
   Must avoid: reading only `adapters.ts`, using live machine paths, or burying special cases.

2. **Verification Contracts**
   Rationale: this repo needs trustworthy docs, not just generated docs.
   Deliver: verification metadata schema, claim provenance, confidence states, disagreement handling, checked-date support.
   Pull from research: claim-level evidence, disagreement report, confidence badges.
   Must avoid: treating local implementation as unquestioned truth or silently overriding official docs.

3. **Reference Outputs**
   Rationale: artifact pages and JSON outputs are the first user-visible value.
   Deliver: machine-readable manifest, artifact reference pages, lossy/unsupported behavior sections, snapshot tests.
   Pull from research: per-family pages, unsupported behavior surfaced, machine-readable manifest.
   Must avoid: hiding lossy conversion, flattening precedence rules, or generating polished but weakly sourced prose.

4. **Cross-Target Views and README Migration**
   Rationale: once core reference pages are stable, the repo can safely replace drifting overview tables.
   Deliver: target pages, matrix pages, README link updates, link and anchor checks, stale-docs CI gate.
   Pull from research: README as overview, per-target diff views, stable discoverability.
   Must avoid: cutting README too early or shipping incomplete navigation.

### Requirements Drivers

- The system must derive target reference facts from runtime code, not hand-maintained markdown.
- The system must encode verification state for important claims and distinguish implementation behavior from vendor-confirmed behavior.
- The system must document unsupported, lossy, and scope-specific behavior as first-class outputs.
- The system must produce both Markdown pages and a machine-readable manifest from the same normalized model.
- The system must fail verification when generated outputs drift, when critical matrix cells are untested, or when disputed claims are unresolved.

### Research Flags

- **Needs focused validation during planning:** official-doc verification for Cursor, Claude Code, Codex, Qoder, and OpenCode behaviors; matrix coverage strategy across target × artifact × scope × platform × env.
- **Can proceed without more research:** manifest-first architecture, runtime extraction approach, Bun/TypeScript generator choice, committed Markdown output model.

## Major Risks and Roadmap Response

| Risk | Why it matters here | Roadmap response |
|------|---------------------|------------------|
| Generated docs become authoritative but wrong | Code and README already show drift signals | Put verification metadata and dispute handling in the first two phases |
| Extractor misses behavior outside `adapters.ts` | Special handling lives in sync/store/transform utilities | Require a composed extractor and source-coverage tests |
| Lossy or incompatible transforms get documented as parity | MCP and rules already have mismatch cases | Model lossiness explicitly and add round-trip checks |
| Matrix testing stays shallow | This repo has many targets and irregular exceptions | Track coverage by target × artifact × scope × platform × env, not by line coverage |
| README migration hurts discoverability | README is still the current entry point | Migrate last, keep stable links, and add link/anchor smoke checks |

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | High | The recommendation matches the repo’s existing Bun/TypeScript runtime and the shape of the current source of truth. |
| Features | High | The feature framing is grounded in concrete repo problems: drift, special cases, unsupported modes, and verification needs. |
| Architecture | High | The manifest-first design aligns with the existing code layout and minimizes brownfield risk. |
| Pitfalls | High | The risks are repo-specific and backed by current examples in README/code differences and transform complexity. |
| External target semantics | Medium | The strategy is solid, but several vendor-behavior claims still require ongoing verification because upstream docs can move. |

## Gaps To Carry Into Planning

- Define the exact manifest schema boundaries so artifact-specific exceptions remain visible instead of being over-normalized.
- Decide how granular verification status should be: per page, per section, or per claim.
- Decide the minimum required matrix coverage for docs release gating.
- Confirm which external claims must block publication when disputed versus which can ship with warnings.
- Plan how README updates will be scoped so navigation improves before old tables disappear.

## Sources

### Synthesized Research Files

- `.planning/research/STACK.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`

### Core Repo Surfaces Repeated Across Research

- `src/targets/adapters.ts`
- `src/util/agent-transform.ts`
- `src/util/command-transform.ts`
- `src/util/rule-transform.ts`
- `src/util/mcp-transform.ts`
- `src/util/mcp-config-io.ts`
- `src/util/global-rules-store.ts`
- `src/util/cursor-user-rules.ts`
- `src/commands/rules/sync.ts`
- `tests/adapters.test.ts`
- `tests/rule-transform.test.ts`
- `tests/mcp-transform.test.ts`
- `tests/mcp-config-io.test.ts`
- `README.md`

### External Sources Repeated Across Research

- Cursor rules docs
- Claude Code settings, memory, and MCP docs
- OpenAI Codex AGENTS.md, settings, and MCP docs
- Qoder rules docs
- MCP specification and transport docs
