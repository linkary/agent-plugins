# Testing Patterns

**Analysis Date:** 2026-04-12

## Test Framework

**Runner:**
- Bun test runner via `bun test`
- Config: no dedicated `jest.config.*`, `vitest.config.*`, or Bun config file was detected; the only repo test script is `"test": "bun test"` in `package.json`.

**Assertion Library:**
- `expect` from `bun:test`

**Run Commands:**
```bash
bun test              # Run the full suite
```
```bash
# No separate watch-mode script is defined in `package.json`
```
```bash
# No coverage script or threshold config is defined in the repo
```

## Test File Organization

**Location:**
- Tests live in the top-level `tests/` directory, not co-located with source files.
- The suite mirrors production modules and behaviors, for example `tests/options.test.ts`, `tests/command-store.test.ts`, `tests/skills-sync-preview.test.ts`, and `tests/mcp-config-io.test.ts`.

**Naming:**
- Use `<subject>.test.ts`.
- Group-level command flows often use `<group>-<behavior>.test.ts`, for example `tests/skills-update.test.ts`, `tests/rules-sync-qoder.test.ts`, and `tests/commands-collect-resource.test.ts`.

**Structure:**
```text
tests/
├── options.test.ts
├── command-store.test.ts
├── skills-collect.test.ts
├── skills-sync-preview.test.ts
├── mcp-config-io.test.ts
└── ...
```

## Test Structure

**Suite Organization:**
```typescript
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apg-test-cmd-store-'));
  process.env.APG_HOME = tmpDir;
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('command-store', () => {
  describe('detectCommandForm', () => {
    it('should detect directory-form', async () => {
      expect(form).toBe('directory');
    });
  });
});
```
- Pattern above comes directly from `tests/command-store.test.ts`.

**Patterns:**
- Use nested `describe(...)` blocks to separate module-level behavior from scenario-level behavior, as in `tests/mcp-config-io.test.ts` and `tests/repo-tracking.test.ts`.
- Prefer async `it(...)` blocks with real filesystem setup and teardown, especially for command handlers and stores, as in `tests/skills-collect.test.ts`, `tests/command-store.test.ts`, and `tests/item-utils.test.ts`.
- Assertions check both exit codes and persisted artifacts, not just return values. Example: `tests/skills-collect.test.ts` verifies command return code, rewritten `SKILL.md`, removed stale files, and preserved target `.git`.

## Mocking

**Framework:** `mock.module` from `bun:test`, plus direct monkeypatching

**Patterns:**
```typescript
mock.module('../src/util/prompt.js', () => ({
  promptMultiSelect: async (params) => {
    capturedPromptParams = params;
    return options.map((option) => option.value);
  },
  promptConfirm: async () => {
    throw new Error('promptConfirm should not be called in this test');
  },
}));
```
- This pattern is used in `tests/skills-sync-preview.test.ts` and `tests/prompt-review-confirm.test.ts`.

**What to Mock:**
- Prompt and Ink boundaries in `src/util/prompt.ts` and `src/ui/render.tsx`, so command tests can inspect prompt payloads without opening an interactive TUI: `tests/prompt-review-confirm.test.ts`, `tests/skills-sync-preview.test.ts`, `tests/skills-rm-review.test.ts`.
- TTY state via `Object.defineProperty(process.stdin, 'isTTY', ...)` and `process.stdout.isTTY`, as in `tests/prompt-review-confirm.test.ts` and `tests/skills-sync-preview.test.ts`.
- Network fetchers via lightweight inline stubs, as in `tests/remote-find.test.ts`.
- Stdout/stderr selectively when message content matters, as in `tests/mcp-collect.test.ts`.

**What NOT to Mock:**
- Filesystem layout and persistence. Most tests create real temporary directories and files with `fs.mkdtemp`, `fs.writeFile`, `fs.mkdir`, and `fs.rm`.
- Path resolution and command orchestration. Command tests usually call the real handler, for example `cmdSkillsCollect`, `cmdRulesSync`, and `cmdMcpCollect`.

## Fixtures and Factories

**Test Data:**
```typescript
const sourceSkillDir = path.join(tmpProjectRoot, '.cursor', 'skills', 'demo-skill');
await fs.mkdir(path.join(sourceSkillDir, '.git'), { recursive: true });
await fs.writeFile(path.join(sourceSkillDir, 'SKILL.md'), '# Demo\nsource body\n', 'utf-8');
```
- This inline-fixture pattern is used repeatedly in `tests/skills-collect.test.ts`, `tests/commands-collect-git.test.ts`, and `tests/rules-sync-qoder.test.ts`.

**Location:**
- There is no shared `tests/fixtures/` or factory library.
- Small one-off helpers live inside the owning test file, for example `makeFetcher(...)` in `tests/remote-find.test.ts`, `captureStderr(...)` in `tests/mcp-collect.test.ts`, and `writeSkill(...)` in `tests/skills-sync-preview.test.ts`.

## Coverage

**Requirements:** None enforced
- No coverage thresholds, LCOV setup, or coverage config files were detected.
- Coverage is behavioral rather than metric-driven: the suite emphasizes command flows, filesystem transforms, metadata parsing, and prompt payloads.

**View Coverage:**
```bash
# Not configured in-repo
```

## Test Types

**Unit Tests:**
- Dominant test style.
- Pure helpers and stores are covered heavily: `tests/options.test.ts`, `tests/rule-transform.test.ts`, `tests/global-rules-lines.test.ts`, `tests/command-meta.test.ts`, `tests/mcp-transform.test.ts`, and `tests/repo-tracking.test.ts`.
- These tests assert normalization, hashing, metadata parsing, path handling, and small state transitions.

**Integration Tests:**
- Command handlers are exercised against temporary project trees and environment overrides instead of end-to-end shell execution.
- Representative files: `tests/skills-collect.test.ts`, `tests/commands-collect-git.test.ts`, `tests/rules-sync-qoder.test.ts`, `tests/mcp-collect.test.ts`, and `tests/agents-collect-canonical.test.ts`.
- Integration scope usually includes filesystem writes, env vars like `HOME` and `APG_HOME`, and adapter-specific path resolution.

**E2E Tests:**
- Not used.
- No tests invoke `bin/ap.js`, `dist/cli.mjs`, npm packaging, or a spawned interactive terminal session.
- No browser, Playwright, or snapshot test suite was detected.

## Common Patterns

**Async Testing:**
```typescript
const exitCode = await cmdSkillsCollect(
  ['demo-skill'],
  { target: 'cursor', scope: 'local', cwd: tmpProjectRoot, force: true, overwrite: true },
  { cwd: tmpProjectRoot },
);

expect(exitCode).toBe(0);
expect(await fs.readFile(path.join(centralSkillDir, 'SKILL.md'), 'utf-8')).toBe('# Demo\nsource body\n');
```
- Pattern taken from `tests/skills-collect.test.ts`.

**Error Testing:**
```typescript
let firstErr: unknown;

try {
  normalizeRulePath('../escape.mdc');
} catch (err) {
  firstErr = err;
}

expect(firstErr instanceof InvalidRulePathError).toBe(true);
```
- Pattern taken from `tests/rule-utils.test.ts`.

## Current Suite Posture

- Running `bun test` on 2026-04-12 executed 347 tests across 46 files.
- Current result is not green: 342 passed, 5 failed, and 2 errored.
- Observed failures are in `tests/skills-update.test.ts`, `tests/skills-rm-review.test.ts`, `tests/agents-file-form.test.ts`, and `tests/rules-rm.test.ts`.
- The suite currently catches real regressions in command orchestration and module wiring, not just pure logic errors.

## What Is Well Tested

- CLI metadata and option parsing: `tests/help.test.ts`, `tests/options.test.ts`, and `tests/command-path.test.ts`.
- Filesystem-backed stores and canonical transforms: `tests/command-store.test.ts`, `tests/agent-store.test.ts`, `tests/item-utils.test.ts`, `tests/command-transform.test.ts`, and `tests/mcp-store.test.ts`.
- Rule normalization and item-level merge behavior: `tests/global-rules-lines.test.ts`, `tests/rule-transform.test.ts`, `tests/rules-collect.test.ts`, and `tests/rules-sync-qoder.test.ts`.
- Adapter-specific path resolution and target compatibility: `tests/adapters.test.ts`, `tests/select-targets.test.ts`, and `tests/mcp-collect.test.ts`.
- Prompt payload shaping for interactive flows: `tests/prompt-multi-select.test.ts`, `tests/prompt-review-confirm.test.ts`, and `tests/skills-sync-preview.test.ts`.

## What Is Not Well Tested

- Packaged CLI entry points are not exercised. `bin/ap.js` and built output `dist/cli.mjs` have no direct test coverage.
- There is no end-to-end smoke test that shells out to `ap ...` with real argv parsing and process I/O.
- Interactive Ink rendering is only tested through prompt adapter mocks; component rendering behavior in `src/ui/*.tsx` is only lightly covered (`tests/multi-select.test.ts` and `tests/review-confirm.test.ts` focus on helper logic, not full terminal interaction).
- No dedicated coverage gate protects large command modules such as `src/commands/commands/rm.ts`, `src/commands/mcp/rm.ts`, `src/commands/skills/rm.ts`, and `src/util/remote-find.ts`, which are among the largest files in the repo.
- The presence of current red tests means “has tests” does not equal “safe to change”; rerun `bun test` after touching command orchestration, prompt mocks, or git-related helpers.

---

*Testing analysis: 2026-04-12*
