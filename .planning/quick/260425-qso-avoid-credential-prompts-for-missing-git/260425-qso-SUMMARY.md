# Quick Task 260425-qso Summary

**Task:** Avoid credential prompts for missing GitHub skill update repos
**Date:** 2026-04-25
**Code commit:** 8f8a9a1

## Completed

- Added a GitHub API existence check before prompting for credentials when `git ls-remote` reports a generic username failure.
- GitHub API 404 now marks the repo as failed with `GitHub repository not found` and skips the username/token prompt.
- The check uses `GITHUB_TOKEN` or `GH_TOKEN` when present, so authenticated environments can still see repos the token can access.
- Updated `skills-update` tests to mock `fetch` and avoid real network calls.

## Verification

- `git diff --check` passed.
- `bun test tests/skills-update.test.ts` could not run because `bun` is not installed in this shell.
