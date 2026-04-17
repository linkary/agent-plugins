---
name: reference-docs-maintainer
description: Maintain and validate the agent-plugins reference docs in docs/reference. Use when updating target/surface docs, verifying official links, auditing paths or formats against src/targets/adapters.ts, checking shared .agents support, or reconciling repo behavior with vendor docs.
---

# Reference Docs Maintainer

Use this skill for work on `docs/reference/*.md` in this repo.

This repo's documentation policy is:
- `docs/reference/*.md` are the canonical docs
- family pages are canonical; do not recreate `docs/reference/targets/*`
- official vendor docs are the primary source of truth
- current repo code is fallback-only and must be labeled when used

## Read First

Inspect only the files relevant to the requested surfaces:
- `docs/reference/*.md`
- `src/targets/adapters.ts`
- `src/util/organize-compat.ts` for shared skills behavior
- the relevant transform or command modules when a repo behavior claim is involved:
  - `src/util/command-transform.ts`
  - `src/util/agent-transform.ts`
  - `src/util/rule-transform.ts`
  - `src/util/mcp-transform.ts`
  - `src/util/mcp-config-io.ts`
  - `src/commands/skills/organize.ts`

Use `rg` first. Do not assume older generated docs or deleted helper files still exist.

## Update Rules

When editing the reference docs:
- update the family page directly; do not add generated artifacts
- keep `Target` links pointed at the primary official source for that surface when one exists
- if no credible official source exists for that target/surface, leave the target name unlinked instead of inventing a destination
- keep `Format` storage-oriented: `markdown`, `toml`, `json`, `package`, `.rules`, `mdc + text`, `webhook`, or `—`
- keep `Reliability` tied to evidence quality, not confidence in repo code

Use these evidence interpretations:
- `High`: official docs directly cover the feature plus the relevant path/format
- `Medium`: official docs cover the feature, but exact path or format still needs repo interpretation
- `Low`: implementation-only, reverse-engineered, or disputed

## Shared .agents Policy

Treat shared `.agents` support as a separate concept from native target paths.

Valid statuses:
- `native`
- `compatibility`
- `repo-only`
- `not documented`
- `unsupported`

Rules:
- only `skills` currently has real shared-destination behavior in repo code
- do not generalize `.agents/<surface>` support from skills to commands, agents, rules, or MCP
- for Gemini skills, `.agents/skills` is repo-only promotion behavior unless Gemini docs explicitly say otherwise
- for Codex skills, `.agents/skills` is native official behavior
- for OpenCode skills, `.agents/skills` is official compatibility/discovery behavior
- for the `agents` target, `.agents/skills` is a repo/target convention and shared owner destination, not broad vendor proof for other surfaces

## Validation Workflow

After edits:
1. Verify the changed official URLs still resolve.
2. Check that the updated family page has no stale internal links such as `./targets/...`.
3. Re-scan the page for mismatches between:
   - table row
   - detailed target block
   - cited official source
4. Re-scan relevant repo files so repo-only notes still match current implementation.

Useful checks:
- `rg -n '\\./targets/' docs/reference`
- `rg -n 'Shared \\.agents support|Sources:|Reliability:|Format:' docs/reference/<page>.md`
- `rg -n '\\.agents|shared' docs/reference src/targets src/util src/commands`

## Avoid

Do not:
- recreate `docs/reference/_generated`
- cite deleted generator files or stale target landing pages
- upgrade a repo convention into official support without a vendor source
- hide doc-vs-repo mismatches; call them out explicitly in the affected section

## Output Expectations

A good update leaves:
- a compact, readable family table
- detail blocks that say exactly what is official, what is repo-only, and what is uncertain
- source links that actually exist
- no duplicate reference layers
