# Requirements: agent-plugins Documentation Reliability

**Defined:** 2026-04-12
**Core Value:** Anyone changing target behavior in `agent-plugins` can find one reliable, code-derived source of truth for path, scope, format, and compatibility rules.

## v1 Requirements

### Reference Model

- [ ] **REF-01**: System derives a normalized reference manifest from runtime code for every supported target
- [ ] **REF-02**: Reference manifest captures per-target local, global, central, and shared-location semantics where supported
- [ ] **REF-03**: Reference manifest captures storage format and transform behavior for skills, commands, agents, rules, and MCP
- [ ] **REF-04**: Reference manifest captures unsupported and lossy behaviors as first-class data instead of prose-only notes

### Reference Docs

- [ ] **DOC-01**: System generates a target-wide matrix page covering supported targets, scopes, locations, formats, and major exceptions
- [ ] **DOC-02**: System generates a skills reference page from implementation data
- [ ] **DOC-03**: System generates a commands reference page from implementation data
- [ ] **DOC-04**: System generates an agents reference page from implementation data
- [ ] **DOC-05**: System generates a rules reference page from implementation data
- [ ] **DOC-06**: System generates an MCP reference page from implementation data
- [ ] **DOC-07**: Generated reference pages include source provenance for nontrivial claims and special-case behavior

### Verification

- [ ] **VER-01**: Unit tests verify that manifest facts match target adapter and transform behavior in code
- [ ] **VER-02**: Verification data records whether a claim is implementation-only, externally confirmed, or disputed
- [ ] **VER-03**: High-risk claims are checked against official docs or other reliable web sources with recorded source links
- [ ] **VER-04**: Verification fails when generated reference outputs drift from the manifest or when required coverage is missing

### Documentation UX

- [ ] **READ-01**: Root `README.md` provides a short overview of the project and links to generated reference docs
- [ ] **READ-02**: Root `README.md` no longer serves as the primary hand-maintained target matrix
- [ ] **READ-03**: Generated docs are organized so maintainers can quickly find answers by artifact family and by target

## v2 Requirements

### Diagnostics

- **DIAG-01**: System generates a disagreement report when implementation and vendor docs conflict
- **DIAG-02**: Generated docs expose confidence badges at section or claim level
- **DIAG-03**: System provides diff-oriented views for comparing target support across artifact families

## Out of Scope

| Feature | Reason |
|---------|--------|
| New target integrations unrelated to documentation reliability | This initiative is about trusted docs for existing behavior first |
| Full docs website or docs framework migration | Generated markdown in-repo is sufficient for v1 and lower risk in this brownfield repo |
| Tutorial-heavy product documentation | The immediate need is maintainers' behavioral reference, not end-user onboarding content |
| Hand-maintained duplicate compatibility tables in multiple files | Duplicate docs would recreate the current drift problem |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REF-01 | Phase 1 | Pending |
| REF-02 | Phase 1 | Pending |
| REF-03 | Phase 1 | Pending |
| REF-04 | Phase 1 | Pending |
| DOC-01 | Phase 4 | Pending |
| DOC-02 | Phase 3 | Pending |
| DOC-03 | Phase 3 | Pending |
| DOC-04 | Phase 3 | Pending |
| DOC-05 | Phase 3 | Pending |
| DOC-06 | Phase 3 | Pending |
| DOC-07 | Phase 3 | Pending |
| VER-01 | Phase 2 | Pending |
| VER-02 | Phase 2 | Pending |
| VER-03 | Phase 2 | Pending |
| VER-04 | Phase 2 | Pending |
| READ-01 | Phase 4 | Pending |
| READ-02 | Phase 4 | Pending |
| READ-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 after roadmap creation*
