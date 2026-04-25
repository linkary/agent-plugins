# Quick Task 260425-q8r Summary

**Task:** Keep failed repo entries visible in parallel `ap skills update` progress
**Date:** 2026-04-25
**Code commit:** 84e7c9c

## Completed

- Failed repo rows are now retained as visible progress entries instead of being overwritten by reused worker slots.
- Failure rows include a short stderr-derived detail in the form `fail [error] repo`.
- Running repo rows continue to display parallel indeterminate progress bars.
- Git clone/fetch/checkout during repo checks now use captured git output so progress rows and final errors can show useful failure summaries.
- Updated the existing test mock to support captured clone behavior.

## Verification

- `git diff --check` passed.
- `bun test tests/skills-update.test.ts` could not run because `bun` is not installed in this shell.
