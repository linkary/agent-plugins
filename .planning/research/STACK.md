# Technology Stack

**Project:** agent-plugins
**Researched:** 2026-04-12

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript (repo-native ESM modules) | current repo standard | Build a `ReferenceModel` directly from runtime exports | The important truth is already encoded in executable modules such as `src/targets/adapters.ts`, `src/util/agent-transform.ts`, `src/util/rule-transform.ts`, and `src/util/mcp-transform.ts`. Importing those modules is less brittle than reverse-engineering source text. |
| Bun | current repo standard | Run generation and tests | The repo already builds and tests with Bun. Keeping docs generation on the same runtime reduces stack sprawl and lets generated markdown use the same test runner and CI path as the implementation. |
| Deterministic markdown renderer implemented in-repo | no new dependency required | Render target matrices and capability tables into markdown | This repo needs behavior reference docs, not generic API docs. A small local renderer keeps output stable, sortable, and tailored to adapter/format semantics. |

### Documentation Model

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Runtime-derived `ReferenceModel` object | local code | Canonical input for generated docs | Make one typed intermediate model that gathers adapter paths, scope support, agent format, rules capability, MCP config shape, and lossy/incompatible cases. Docs and tests should both read this model. |
| Small typed supplement metadata file | local code | Hold only facts not derivable from code | Use this only for human labels, explanatory notes, and official-source URLs. Keep it adjacent to the code and keyed by `TargetId` to avoid a second truth source. |

### Verification

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `bun:test` unit tests | current repo standard | Assert the extracted reference model matches implementation behavior | Existing tests already prove path and transform semantics in `tests/adapters.test.ts`, `tests/rule-transform.test.ts`, `tests/mcp-transform.test.ts`, and `tests/mcp-config-io.test.ts`. Reuse that style for doc extraction. |
| `bun:test` snapshots | current repo standard | Golden-test generated markdown | Bun officially supports snapshots and `--update-snapshots`, which is a good fit for locking markdown tables and diffing intentional changes. |
| Optional TypeDoc sidecar | latest if adopted | API docs only, not target reference docs | TypeDoc is good for exported API/comment docs or JSON reflection output, but it should not be the primary generator for target behavior reference pages in this repo. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `smol-toml` | existing dependency | Reuse for examples and tests involving Codex TOML MCP/agent behavior | Use when generated docs need canonical example snippets for TOML-backed targets. |
| TypeDoc | optional dev dependency | Supplemental API reference or exported JSON reflection | Use only if the project later wants public API docs for exported modules. Do not make it the source of the target matrix. |

## Concrete Recommendation For This Repo

Use a three-layer approach:

1. `ReferenceModel` extractor
   - Add a small docs module that imports runtime exports and returns stable JSON-ish data.
   - Primary inputs should be:
     - `getAdapters()`, `filterAgentAdapters()`, `filterCommandAdapters()`, `filterRuleAdapters()` from `src/targets/adapters.ts`
     - `getRuleCapability()` from `src/util/rule-transform.ts`
     - MCP config details from each adapter `resolveMcpConfig`
     - Agent format logic from `agentFormat` plus `resolveTargetAgentPaths` if examples need file-vs-directory form
     - MCP lossy/incompatible behavior from `serializeCanonicalMcpForTarget()`
   - Normalize all maps/arrays with stable sort order before rendering.

2. Tiny supplement metadata
   - Keep a small typed object for notes that code cannot infer cleanly, such as:
     - official documentation URLs per target
     - short human explanations for empty-string paths meaning “not directory-backed”
     - wording for special cases like Cursor/Claude global rules and Qoder local-only rules
   - This metadata must not restate paths, capabilities, or formats already available from code.

3. Markdown renderer
   - Render markdown from the `ReferenceModel`, not directly from ad hoc code in tests.
   - Generate dedicated docs files under `docs/reference/` or similar, then keep `README.md` as a short overview linking to them.
   - Favor plain template functions over a generic markdown AST stack unless the docs become much more complex.

## Why This Repo Should Not Use Pure Introspection

**Recommendation:** Prefer runtime imports plus typed supplement metadata, not AST introspection.

Reasons:

- The repo’s doc-worthy facts are behavioral, not just declarative. Examples:
  - `src/targets/adapters.ts` encodes scope-specific paths, unsupported directory cases via `''`, and per-target MCP config shapes.
  - `src/util/rule-transform.ts` encodes prompt-rule compatibility and extension conversion.
  - `src/util/mcp-transform.ts` encodes lossy or incompatible MCP conversions per target.
  - `src/util/agent-transform.ts` encodes file-vs-directory target output for Codex vs markdown targets.
- Parsing TypeScript AST adds fragility for little gain here. The TypeScript team’s own Compiler API wiki still warns that the compiler API is not yet a stable API.
- Comment-driven tools like TypeDoc document exports and comments; they do not automatically express runtime behavior matrices like “global rules are single-file backed, not directory backed”.

## Why This Repo Should Not Use A Hand-Maintained Registry

**Recommendation:** Do not create a second manual target registry for docs.

Reasons:

- The current README tables already drift from implementation. Examples visible today:
  - `README.md` lists Antigravity global skills as `~/.gemini/antigravity/global_skills/`, while `src/targets/adapters.ts` resolves `~/.gemini/antigravity/skills`.
  - `README.md` lists Antigravity local commands as `.agent/commands`, while code resolves `.agent/workflows`.
  - `README.md` presents several global rules directories that code intentionally models as non-directory-backed with `''`.
- Once paths/capabilities are duplicated in markdown, drift is guaranteed unless every behavior change updates code, docs, and tests together.

## How To Keep Generated Docs And Tests Aligned

Use one pipeline:

1. Extract `ReferenceModel` from code.
2. Assert the model with focused unit tests.
3. Render markdown from the same model.
4. Snapshot-test the markdown output.
5. Add a CI check that fails if regeneration changes tracked docs unexpectedly.

Recommended test layers:

| Layer | What it proves | Example |
|------|----------------|---------|
| Model unit tests | Extractor logic matches runtime semantics | `codex` global MCP config is TOML and local MCP config is `null` |
| Behavioral cross-check tests | Doc model stays tied to existing implementation tests | Rule capability rows match `getRuleCapability` outputs |
| Snapshot tests | Rendered markdown stays stable and reviewable | Generated adapter matrix page matches checked-in snapshot |
| Link/source tests | Generated docs remain navigable | Every official-doc link in supplement metadata is non-empty and every generated file is referenced from the overview page |

Implementation detail:

- Normalize platform-dependent output before snapshotting. Qoder’s global path is OS-specific, so the doc generator should either:
  - render per-platform rows explicitly, or
  - snapshot a normalized placeholder form such as `<platform-app-data>/Qoder/...`

## What Not To Do

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Source of truth | Runtime-derived reference model | Hand-maintained markdown tables | Already drifting in `README.md`; duplicates create guaranteed drift. |
| Supplemental data | Minimal typed note metadata | Full parallel target registry | A second registry will diverge from `adapters.ts` and transform modules. |
| Extraction | Import executable modules | AST scraping / regex over `.ts` files | Brittle, harder to test, and built on an API TypeScript documents as unstable. |
| Rendering | Local deterministic templates | Heavy docs-site toolchain first | Unnecessary for a CLI repo that mainly needs generated reference markdown committed to git. |
| Validation | Unit tests + snapshots + CI diff check | Manual spot-checking only | Manual review cannot reliably catch matrix drift across nine adapters and multiple format transforms. |
| API docs | Optional sidecar TypeDoc | TypeDoc as primary behavior-doc generator | TypeDoc is designed for exports/comments and reflection output, not implementation-derived compatibility matrices. |

## Proposed File Shape

Recommended additions:

- `src/docs/reference-model.ts`
  - exports `buildReferenceModel()`
- `src/docs/reference-notes.ts`
  - typed supplement metadata only
- `src/docs/render-reference.ts`
  - pure markdown rendering
- `scripts/generate-reference-docs.ts` or `src/commands/docs/generate.ts`
  - writes markdown files
- `tests/reference-model.test.ts`
  - asserts extracted semantics
- `tests/reference-docs.test.ts`
  - snapshot-tests rendered markdown

This keeps docs generation in the same language, runtime, and test system the repo already uses.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Primary generator | Local TS/Bun generator | TypeDoc markdown output | Good for API docs, wrong abstraction for runtime behavior matrices. |
| Extraction strategy | Runtime imports + typed supplements | Compiler API introspection | Higher maintenance cost and weaker fit for behavior encoded in functions/conditionals. |
| Supplemental explanations | Tiny colocated metadata | README-only prose | Hard to test and easy to forget during implementation changes. |

## Installation

```bash
# Required for the recommended approach
# No new dependency is strictly required; use the repo's existing Bun + TypeScript stack.

# Optional only if you later want sidecar API docs for exported modules
bun add -d typedoc
```

## Sources

### Local codebase

- `src/targets/adapters.ts`
- `src/util/agent-transform.ts`
- `src/util/rule-transform.ts`
- `src/util/mcp-transform.ts`
- `src/util/mcp-config-io.ts`
- `tests/adapters.test.ts`
- `tests/rule-transform.test.ts`
- `tests/mcp-transform.test.ts`
- `tests/mcp-config-io.test.ts`
- `README.md`

### External sources

- TypeDoc homepage: https://typedoc.org/
  - TypeDoc states it converts TypeScript source comments into HTML documentation or a JSON model, which supports using it only as an API-doc sidecar here.
- TypeDoc output docs: https://typedoc.org/documents/Options.Output.html
  - Official docs confirm built-in outputs are `html` and `json`, with markdown requiring a plugin.
- TypeDoc validation docs: https://typedoc.org/documents/Options.Validation.html
  - Useful if API-doc generation is later added and validation warnings should fail CI.
- Bun test docs: https://bun.sh/docs/test
  - Official docs confirm snapshot support and `--update-snapshots`.
- Bun snapshot docs: https://bun.sh/docs/test/snapshots
  - Official guidance supports reviewing snapshot diffs and cleaning up unused snapshots.
- TypeScript Compiler API wiki: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
  - Official TypeScript wiki warns that the compiler API is not yet a stable API, which argues against making AST introspection the primary docs pipeline.
