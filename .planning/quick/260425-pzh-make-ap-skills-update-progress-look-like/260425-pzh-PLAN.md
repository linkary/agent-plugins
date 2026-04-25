# Quick Task 260425-pzh: Make ap skills update progress look like uv style progress

**Date:** 2026-04-25
**Status:** In progress

## Goal

Improve `ap skills update` progress display so repo scanning feels closer to `uv`: a compact single-line progress indicator with activity, completion count, failures, and elapsed time.

## Tasks

1. Replace the simple fixed bar helper with a TTY-only dynamic progress renderer.
   - Files: `src/commands/skills/update.ts`
   - Verify: non-TTY output remains clean and TTY output clears/reuses a single line.

2. Update repo scan call sites to report structured success/failure instead of embedding colored status strings.
   - Files: `src/commands/skills/update.ts`
   - Verify: failed repos are still counted and reported after scanning.

3. Run available checks and document any unavailable project test tooling.
   - Verify: `git diff --check`; `bun test tests/skills-update.test.ts` if Bun is available.
