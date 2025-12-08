# Clarion-Extension AI Assistant

**Project:** VS Code extension for Clarion language (case-insensitive, ANSI-only)

## ABSOLUTE RULES (NON-NEGOTIABLE)
- **TDD MANDATORY**: Run `npm test` before/after ALL changes. Never merge code with MORE test failures than baseline.
- **CLARION CASE-INSENSITIVITY**: ALL identifiers/keywords are case-insensitive. Use `.toLowerCase()` for comparisons. Never assume case-sensitive matching.
- **NO UNICODE**: Clarion files are ANSI/ASCII only. Never add Unicode to `.clw` files.
- **KB AUTHORITY**: Consult `docs/clarion-knowledge-base.md` BEFORE asserting Clarion syntax rules. Do not assume.
- **NO AUTO-PUSH**: Never push to remote without explicit user request.
- **NO AUTO-VERSION**: Version changes only when user requests "merge to main" or "ready to release".
- **DOCUMENT IMMEDIATELY**: Update `CHANGELOG.md` for ALL features/fixes in the same commit.
- **MINIMAL CHANGES**: Surgical edits only. Never modify working code unnecessarily.

## TIER 2 REFERENCES (Load on demand)
See separate documents in `docs/ai-prompts/` when needed:
- `TIER2_CLARION_KB_RULES.md` - Clarion syntax reference
- `TIER2_GIT_WORKFLOW.md` - Branching and commits
- `TIER2_TESTING_TDD.md` - Testing requirements
- `TIER2_RELEASE_PROCESS.md` - Publishing procedures
- `TIER2_DOCUMENTATION.md` - Documentation standards
- `TIER2_REPOSITORY_STRUCTURE.md` - Project layout
