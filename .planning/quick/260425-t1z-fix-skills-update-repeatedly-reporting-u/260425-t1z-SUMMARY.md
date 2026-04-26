# Quick Task 260425-t1z Summary

**Task:** Fix `ap skills update` repeatedly reporting updated skills
**Date:** 2026-04-25
**Code commit:** pending

## Completed

- Identified the cause: duplicate skill names were tracked under multiple repos, while the central skill record has only one current `source.url`.
- `ap skills update` now filters each repo's skill list to skills whose registry source URL matches that repo.
- Stale duplicate repo entries are skipped before clone/compare, so they no longer produce permanent update prompts.
- Added regression coverage to assert stale duplicate repos are not cloned.

## Verification

- `git diff --check` passed.
- `bun test tests/skills-update.test.ts` could not run because `bun` is not installed in this shell.
