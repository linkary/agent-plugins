# Roadmap: agent-plugins Documentation Reliability

## Overview

This roadmap turns the repo's target behavior into one code-derived reference layer that maintainers can trust. It follows the research summary's manifest-first approach, treats verification as part of the feature, and delays README reduction until generated reference pages and cross-target navigation are complete.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Reference Manifest Foundation** - Derive one normalized model of target behavior from the existing runtime code.
- [ ] **Phase 2: Verification Contracts & Evidence** - Make manifest claims testable, sourced, and safe to publish.
- [ ] **Phase 3: Generated Artifact Reference Pages** - Render committed reference pages for each artifact family from the shared model.
- [ ] **Phase 4: Cross-Target Navigation & README Migration** - Add target-wide views and reduce the root README to an overview plus links.

## Phase Details

### Phase 1: Reference Manifest Foundation
**Goal**: Maintainers can derive one normalized, code-grounded reference model for supported targets without reading scattered adapters and transform utilities by hand.
**Depends on**: Nothing (first phase)
**Requirements**: REF-01, REF-02, REF-03, REF-04
**Success Criteria** (what must be TRUE):
  1. A maintainer can run one extraction flow and produce a normalized manifest for every supported target.
  2. The manifest shows per-target local, global, central, and shared-location semantics where those scopes exist.
  3. The manifest records storage format and transform behavior for skills, commands, agents, rules, and MCP.
  4. Unsupported and lossy behaviors, including repo-specific special cases, appear as structured data instead of prose-only notes.
**Plans**: 2 plans

Plans:
- [ ] 01-01: Define the manifest schema and deterministic path/scope normalization boundaries.
- [ ] 01-02: Build composed extractors over adapters, transform helpers, and special-case stores with focused tests.

### Phase 2: Verification Contracts & Evidence
**Goal**: Maintainers can trust generated reference facts because implementation evidence, external confirmation state, and drift failures are part of the documentation pipeline.
**Depends on**: Phase 1
**Requirements**: VER-01, VER-02, VER-03, VER-04
**Success Criteria** (what must be TRUE):
  1. Verification fails if manifest facts stop matching the adapter and transform behavior implemented in the repo.
  2. Important claims record whether they are implementation-only, externally confirmed, or disputed.
  3. High-risk claims include recorded source links so a maintainer can audit external confirmation without guesswork.
  4. The docs verification flow fails when rendered outputs drift from the manifest or when required coverage is missing.
**Plans**: 2 plans

Plans:
- [ ] 02-01: Add verification metadata, provenance, and dispute-state handling beside manifest facts.
- [ ] 02-02: Add implementation checks, external-check recording, and coverage gates for high-risk claims.

### Phase 3: Generated Artifact Reference Pages
**Goal**: Maintainers can read committed generated reference pages for each artifact family instead of reverse-engineering behavior from source files and README tables.
**Depends on**: Phase 2
**Requirements**: DOC-02, DOC-03, DOC-04, DOC-05, DOC-06, DOC-07
**Success Criteria** (what must be TRUE):
  1. Generated reference pages for skills, commands, agents, rules, and MCP exist in-repo and are regenerated from the shared manifest.
  2. Each artifact page shows target-specific locations, supported scopes, format and transform behavior, and unsupported or lossy cases.
  3. Nontrivial claims on generated pages include source provenance instead of relying on unsourced prose.
  4. A maintainer can regenerate the artifact docs and review deterministic markdown output rather than hand-editing family reference pages.
**Plans**: 3 plans
**UI hint**: yes

Plans:
- [ ] 03-01: Generate machine-readable reference outputs that the markdown renderer can reuse consistently.
- [ ] 03-02: Render per-family markdown pages for skills, commands, agents, rules, and MCP.
- [ ] 03-03: Add snapshot or structural checks that keep artifact pages stable and reviewable.

### Phase 4: Cross-Target Navigation & README Migration
**Goal**: The repo entry points guide maintainers from a concise README into generated target-wide reference views without duplicate compatibility tables.
**Depends on**: Phase 3
**Requirements**: DOC-01, READ-01, READ-02, READ-03
**Success Criteria** (what must be TRUE):
  1. A maintainer can open one generated target-wide matrix page to compare supported targets, scopes, locations, formats, and major exceptions.
  2. Generated docs are organized so maintainers can find answers by target and by artifact family from stable navigation links.
  3. The root README gives a short project overview and links into generated reference docs instead of carrying the primary target matrix inline.
  4. README and generated-reference links stay usable through link and anchor checks during the docs validation flow.
**Plans**: 2 plans
**UI hint**: yes

Plans:
- [ ] 04-01: Generate cross-target matrix and navigation pages from the same manifest used by artifact docs.
- [ ] 04-02: Reduce README to an overview plus reference links and add navigation smoke checks.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Reference Manifest Foundation | 0/2 | Not started | - |
| 2. Verification Contracts & Evidence | 0/2 | Not started | - |
| 3. Generated Artifact Reference Pages | 0/3 | Not started | - |
| 4. Cross-Target Navigation & README Migration | 0/2 | Not started | - |
