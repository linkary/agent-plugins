# Quick Task 260425-omy Summary

**Task:** Improve `ap skills update` repo diagnostics, parallel update progress, and credential-prompt behavior
**Date:** 2026-04-25
**Code commit:** 8cd2739

## Completed

- Added captured/non-interactive git execution support for credential preflight.
- Changed `ap skills update` to preflight HTTPS repos, print the repo that requires credentials, and use one provided credential set through `GIT_ASKPASS` without re-prompting during clone.
- Parallelized repo scanning with bounded concurrency and a TTY progress bar.
- Kept repo clone/checkout/check failures isolated so successful repos still update.
- Extended `skills update` tests for clone-failure isolation and credential diagnostics.

## Verification

- `git diff --check` passed.
- `bun test tests/skills-update.test.ts` could not run because `bun` is not installed in this shell.
