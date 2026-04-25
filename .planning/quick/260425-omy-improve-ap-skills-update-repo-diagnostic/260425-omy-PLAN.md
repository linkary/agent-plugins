# Quick Task 260425-omy: Improve ap skills update repo diagnostics, parallel update progress, and credential-prompt behavior

**Date:** 2026-04-25
**Status:** In progress

## Goal

Make `ap skills update` friendlier for multi-repo updates:
- Identify which repo needs credentials before any git prompt.
- Scan/update repos in parallel with visible progress.
- Keep failures isolated so working repos still update.
- Avoid repeated credential prompts after the user provides credentials once.

## Tasks

1. Update git execution utilities for non-interactive/captured calls used by update preflight.
   - Files: `src/util/git-utils.ts`
   - Verify: Existing callers still compile and tests can mock the new helper.

2. Refactor `skills update` repo scanning to preflight credentials, run clone/compare work with bounded concurrency, and report progress/errors.
   - Files: `src/commands/skills/update.ts`
   - Verify: Existing missing-skill behavior remains intact; failed repos do not abort successful updates.

3. Extend unit coverage for failed repo isolation and credential prompt diagnostics.
   - Files: `tests/skills-update.test.ts`
   - Verify: `bun test tests/skills-update.test.ts`
