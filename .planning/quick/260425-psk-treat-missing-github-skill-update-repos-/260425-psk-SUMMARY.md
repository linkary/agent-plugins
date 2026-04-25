# Quick Task 260425-psk Summary

**Task:** Treat missing GitHub skill update repos as failed instead of prompting for credentials
**Date:** 2026-04-25
**Code commit:** bd61c8f

## Completed

- Changed `ap skills update` preflight to return both credential prompts and repo access failures.
- Stopped classifying GitHub `Repository not found` as a credential-required condition.
- Failed preflight repos are now skipped during parallel scanning and reported as failed repo entries.
- Added regression coverage for missing GitHub repos to ensure no username prompt is printed.

## Verification

- `git diff --check` passed.
- `bun test tests/skills-update.test.ts` could not run because `bun` is not installed in this shell.
