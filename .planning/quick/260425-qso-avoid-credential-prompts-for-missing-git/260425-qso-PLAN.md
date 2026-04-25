# Quick Task 260425-qso: Avoid credential prompts for missing GitHub skill update repos

**Date:** 2026-04-25
**Status:** In progress

## Goal

Avoid prompting for credentials when a tracked GitHub skill repo is missing, even if `git ls-remote` reports a generic username prompt failure.

## Tasks

1. Add a GitHub repo existence preflight before credential prompting.
   - Files: `src/commands/skills/update.ts`
   - Verify: GitHub API 404 becomes a repo failure, not a credential prompt.

2. Extend update tests to mock GitHub existence checks.
   - Files: `tests/skills-update.test.ts`
   - Verify: credential failure tests do not hit the network; missing repo test remains no-prompt.

3. Run available checks.
   - Verify: `git diff --check`; `bun test tests/skills-update.test.ts` if Bun is available.
