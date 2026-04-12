# Architecture Patterns

**Domain:** Generated reference documentation for target paths, capabilities, formats, and sync behavior  
**Researched:** 2026-04-12

## Recommended Architecture

This repo should use **generated Markdown committed into `docs/`**, not a docs site framework as the first step.

Reason:
- The repo currently has **no `docs/` tree or docs build pipeline**.
- The real source of truth already lives in code such as `src/targets/adapters.ts`, `src/util/agent-transform.ts`, `src/util/command-transform.ts`, `src/util/rule-transform.ts`, and `src/util/mcp-transform.ts`.
- `README.md` already contains hand-maintained compatibility tables, and those tables have started to drift from implementation. A second hand-maintained docs layer would make this worse.

Recommended output layout:

```text
docs/
  reference/
    index.md
    artifacts/
      skills.md
      agents.md
      commands.md
      rules.md
      mcp.md
    targets/
      cursor.md
      gemini.md
      codex.md
      claude-code.md
      antigravity.md
      openskills.md
      agents.md
      opencode.md
      qoder.md
    matrices/
      support.md
      paths.md
      formats.md
      mcp-capabilities.md
    _generated/
      reference-manifest.json
      verification.json
```

`README.md` should stay hand-written, but only as an overview. It should link into:
- `docs/reference/index.md`
- `docs/reference/matrices/paths.md`
- `docs/reference/matrices/support.md`
- the most important artifact pages (`rules.md`, `mcp.md`)

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `src/docs/model/manifest.ts` | Define the normalized docs data model | renderer, verifier, tests |
| `src/docs/model/extract-targets.ts` | Read target ids, labels, aliases, path resolvers, MCP config specs from `src/targets/adapters.ts` | `manifest.ts` |
| `src/docs/model/extract-artifacts.ts` | Read artifact-specific behavior from transform/store modules | `agent-transform.ts`, `command-transform.ts`, `rule-transform.ts`, `mcp-transform.ts`, `mcp-config-io.ts`, `core/*-store.ts` |
| `src/docs/verify/vendor-sources.ts` | Attach external verification status and official-doc URLs to selected claims | `verification.json`, renderer |
| `src/docs/render/*.ts` | Render Markdown pages and JSON manifests from the normalized model | output files only |
| `scripts/generate-reference.ts` | Orchestrate extraction, verification, rendering, diffing, and writes | all docs modules |
| `scripts/check-reference.ts` | CI/test-mode assertion that generated docs are up to date | tests / CI |
| `README` link updater | Update one managed block or one short static section in root `README.md` | generated docs only |

Use a **thin script + pure library modules** split. The generator should live outside the runtime CLI path so documentation work does not add risk to command execution.

## Data Flow

1. `extract-targets.ts` builds `TargetFacts` from `getAdapters()` and the existing filter helpers.
2. It resolves paths using sentinel inputs like `__PROJECT_ROOT__` and `__HOME__`, then normalizes them to `<project>` and `~` so generation is deterministic.
3. `extract-artifacts.ts` enriches each target with artifact-specific facts:
   - Skills: directory support from `TargetAdapter.resolveSkillsDir`
   - Agents: directory support plus format from `TargetAdapter.agentFormat` and `src/util/agent-transform.ts`
   - Commands: path support from adapters and form-conversion behavior from `src/util/command-transform.ts`
   - Rules: capability and extension rules from `src/util/rule-transform.ts`, plus managed/special-file cases from `src/commands/rules/sync.ts`, `src/util/cursor-user-rules.ts`, and `src/util/global-rules-store.ts`
   - MCP: config location from `resolveMcpConfig`, field/transport compatibility from `src/util/mcp-transform.ts`, and file-format behavior from `src/util/mcp-config-io.ts`
4. The combined `ReferenceManifest` is written to `docs/reference/_generated/reference-manifest.json`.
5. Markdown renderers generate:
   - Artifact pages: one page per managed artifact
   - Target pages: one page per target
   - Matrix pages: one page per cross-target concern
6. A small README integration step updates only the root navigation links, not large reference tables.

## Mapping From Current Code To Generated Pages

### `src/targets/adapters.ts` -> target pages + support/path matrices

This file should drive:
- target identity
- display label
- aliases
- local/global path templates
- agent format
- MCP config file path, key name, and config format
- coarse support filtering through `filterAgentAdapters`, `filterCommandAdapters`, `filterRuleAdapters`, and MCP filtering

It should **not** be rendered directly. First map it into a normalized model like:

```ts
type TargetFacts = {
  id: string;
  label: string;
  aliases: string[];
  artifacts: {
    skills?: { localPath: string; globalPath: string };
    agents?: { localPath: string; globalPath: string; format: 'filesystem-markdown' | 'codex-toml' };
    commands?: { localPath: string; globalPath: string };
    rules?: { localPath?: string; globalPath?: string; mode: 'directory' | 'managed-store' | 'unsupported' };
    mcp?: { localPath?: string; globalPath?: string; format: 'json' | 'toml'; serversKey: string };
  };
};
```

That normalized layer is the key safety boundary. It prevents page renderers from spreading repo knowledge across multiple places.

### `src/util/agent-transform.ts` and `src/core/agent-store.ts` -> `docs/reference/artifacts/agents.md`

This page should explain:
- central canonical form: `agent.toml` + `prompt.md` + optional `resources/`
- target output form per adapter
- Codex TOML special case
- resource-copy behavior
- stale-format cleanup behavior already covered by tests such as `tests/agents-collect-canonical.test.ts`

### `src/util/command-transform.ts` and `src/core/command-store.ts` -> `docs/reference/artifacts/commands.md`

This page should explain:
- central `directory-form` vs `file-form`
- target flat-form output
- resource directory behavior
- collection back to central form

This logic is page-worthy because it is behavioral, not just path metadata.

### `src/util/rule-transform.ts` and `src/commands/rules/sync.ts` -> `docs/reference/artifacts/rules.md` + `docs/reference/matrices/formats.md`

Rules are the highest-risk area for drift. Generated docs must include:
- prompt-rule vs exec-rule vs unsupported target classification
- extension differences (`.mdc`, `.md`, `.rules`)
- Cursor global user-rules special handling
- Claude global `CLAUDE.md` / rule-file distinction
- Qoder managed local file behavior (`agent-plugins-global.md`)

The page should explicitly separate:
- **implementation behavior in this repo**
- **vendor-documented behavior**
- **verification status**

### `src/util/mcp-transform.ts` and `src/util/mcp-config-io.ts` -> `docs/reference/artifacts/mcp.md` + `docs/reference/matrices/mcp-capabilities.md`

These files should drive:
- transport support matrix
- lossy field matrix
- incompatible transport notes
- config file path + `serversKey`
- JSON vs TOML write behavior, including the known TOML comment-loss risk

This is a good fit for a dedicated matrix page because the data is highly tabular.

## Suggested Build Order For Brownfield Safety

1. **Introduce the normalized docs model and extractor tests first**
   - Add pure tests that snapshot `ReferenceManifest`.
   - Do not write Markdown yet.
   - This isolates drift detection from presentation.

2. **Generate machine-readable outputs next**
   - Add `docs/reference/_generated/reference-manifest.json`.
   - Add `verification.json` for external-doc URLs and confidence flags.
   - This gives maintainers one inspectable intermediate artifact.

3. **Render artifact pages before target pages**
   - Start with `commands`, `agents`, `rules`, and `mcp`.
   - These pages depend on the non-trivial transform logic that is currently hardest to keep correct.

4. **Render target pages and matrices from the same manifest**
   - Do not build separate queries for matrix pages.
   - Every page family must derive from the same `ReferenceManifest`.

5. **Shrink `README.md` last**
   - Replace large hand-maintained tables with a short overview plus links only after generated pages exist.
   - Safer in brownfield because users do not lose navigability during the transition.

6. **Add a regeneration check in CI or local test flow**
   - `bun test` should include at least one docs-model contract test.
   - Add a `docs:check` script that fails if generated files are stale.

## Patterns To Follow

### Pattern 1: One Manifest, Many Views

Generate one normalized manifest, then render all Markdown from it.

Why:
- fixes drift between artifact pages and matrices
- makes snapshot testing straightforward
- keeps the generator explainable

### Pattern 2: Derived Facts, Not String Scraping

Import and call the real helper functions wherever possible instead of scraping existing README tables or stdout.

Use:
- `getAdapters()`
- `resolveMcpConfig(...)`
- `getRuleCapability(...)`
- transform helpers and store definitions

Avoid:
- parsing `README.md`
- shelling out to CLI commands like `ap ... show`
- re-encoding support rules in a docs-only lookup table

### Pattern 3: Verification Metadata Beside Implementation Facts

For claims that depend on vendor docs, store:
- `sourceUrl`
- `checkedAt`
- `confidence`
- `notes`

This repo needs that boundary because some current path assumptions appear to differ from vendor docs. Example: the current repo uses `~/.opencode/...`, while current OpenCode docs describe config locations under `.opencode.json` and XDG-style config directories.

## Anti-Patterns To Avoid

### Anti-Pattern 1: Rendering Directly From `README.md`

Why bad:
- README is already the drifting surface
- it inverts the source-of-truth direction

Instead:
- render README links from the generated docs plan, not the other way around

### Anti-Pattern 2: Generator Logic Inside Command Handlers

Why bad:
- command modules are mutation-oriented and user-flow-oriented
- docs generation needs pure, deterministic extraction

Instead:
- keep generator code in `src/docs/*` plus `scripts/*`

### Anti-Pattern 3: Using Real Home/Project Paths During Generation

Why bad:
- output changes by machine
- tests become flaky

Instead:
- generate from placeholders and normalize

## Scalability Considerations

| Concern | Current repo (9 targets) | If target count doubles | If behavior complexity grows |
|---------|---------------------------|-------------------------|------------------------------|
| Page count | Fine as committed Markdown | Still manageable with generated pages | Keep index pages concise |
| Drift risk | Already visible in README | Increases sharply | Require manifest snapshots |
| Verification load | Manual checks are possible | Need `verification.json` discipline | Add per-claim confidence flags |
| Maintenance cost | Low with one manifest | Acceptable if renderers stay thin | High if page logic forks from extractor logic |

## Sources

### Repo sources

- `src/targets/adapters.ts`
- `src/util/agent-transform.ts`
- `src/core/agent-store.ts`
- `src/util/command-transform.ts`
- `src/core/command-store.ts`
- `src/util/rule-transform.ts`
- `src/commands/rules/sync.ts`
- `src/util/cursor-user-rules.ts`
- `src/util/mcp-transform.ts`
- `src/util/mcp-config-io.ts`
- `src/core/config.ts`
- `README.md`
- `tests/adapters.test.ts`
- `tests/command-transform.test.ts`
- `tests/rule-transform.test.ts`
- `tests/mcp-transform.test.ts`
- `tests/rules-sync-qoder.test.ts`
- `tests/agents-collect-canonical.test.ts`

### Official / reliable external sources

- OpenAI Codex configuration docs: `https://developers.openai.com/codex/config-basic`
- OpenAI Codex advanced config: `https://developers.openai.com/codex/config-advanced`
- OpenAI Codex sample config: `https://developers.openai.com/codex/config-sample`
- Cursor rules docs: `https://cursor.com/docs/rules`
- Cursor rules help page: `https://cursor.com/help/customization/rules`
- Claude Code memory / project instruction docs: `https://code.claude.com/docs/en/memory`
- OpenCode config docs: `https://opencode.ai/docs/config/`
- Qoder rules docs: `https://docs.qoder.com/user-guide/rules`
- Gemini CLI configuration docs: `https://geminicli.com/docs/reference/configuration/`
- Gemini CLI MCP docs: `https://geminicli.com/docs/tools/mcp-server/`
