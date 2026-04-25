# Quick Task 260425-psk: Treat missing GitHub skill update repos as failed instead of prompting for credentials

**Date:** 2026-04-25
**Status:** In progress

## Goal

When `ap skills update` encounters a tracked repo that no longer exists, it should skip that repo and mark it failed instead of prompting for GitHub credentials.

## Tasks

1. Refine `skills update` credential preflight classification so `Repository not found` is a repo access failure, not a credential prompt.
   - Files: `src/commands/skills/update.ts`
   - Verify: Failed preflight repos are counted as repo failures and do not block other repos.

2. Add regression coverage for missing GitHub repos.
   - Files: `tests/skills-update.test.ts`
   - Verify: stderr reports the failed repo and does not include the credential prompt.
