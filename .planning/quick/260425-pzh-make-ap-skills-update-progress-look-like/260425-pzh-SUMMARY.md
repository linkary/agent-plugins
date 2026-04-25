# Quick Task 260425-pzh Summary

**Task:** Make `ap skills update` progress look like uv style progress
**Date:** 2026-04-25
**Code commit:** ba07893

## Completed

- Replaced the simple fixed repo scan bar with a TTY-only single-line progress renderer.
- Added spinner frames, elapsed time, completion count, running count, failure count, and truncated current repo context.
- Preserved clean non-TTY output by only rendering progress control characters when stdout is a TTY.
- Updated repo scan call sites to report structured `checked`/`failed` progress events.

## Verification

- `git diff --check` passed.
- `bun test tests/skills-update.test.ts` could not run because `bun` is not installed in this shell.
