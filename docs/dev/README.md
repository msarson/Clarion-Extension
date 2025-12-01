# Developer Documentation

This folder contains internal documentation for developers working on the Clarion Extension.

## Contents

### Bug Fixes & Hotfixes
- `FIX_GOTO_DEFINITION_PREFIX.md` - Fix for Go to Definition with prefixes
- `FIX_STRUCTURE_PREFIX.md` - Structure prefix handling fixes
- `HOTFIX_0.6.0.md` - Emergency fixes for version 0.6.0
- `TOKENIZER_BUG_ARRAY_SUBSCRIPT_DOT.md` - Array subscript dot terminator bug
- `UNICODE_FIX.md` - Unicode/encoding issue resolution

### Feature Development
- `DIAGNOSTIC_FEATURE_ANALYSIS.md` - Analysis of diagnostic features
- `DIAGNOSTIC_INTEGRATION.md` - Diagnostic system integration plan
- `SYMBOL_PROVIDER_REFACTORING_PLAN.md` - Symbol provider refactoring notes

### Test Documentation
- `TDD_SESSION_SUMMARY.md` - Test-driven development session notes
- `TEST_RESULTS.md` - Test execution results
- `TEST_VALIDATION_SUMMARY.md` - Validation test summaries

### Release Documentation
- `RELEASE_SUMMARY.md` - Internal release summaries and notes

## What Goes Where

### `/docs/` (Root - User-Facing)
Documentation that **end users** of the extension need:
- Feature guides (CheatSheet.md, GettingStarted.md, etc.)
- Language reference (clarion-knowledge-base.md, CLARION_LANGUAGE_REFERENCE.md)
- Release notes for users (RELEASE_NOTES_*.md)
- Build configuration help (BuildSettings.md)

### `/docs/dev/` (This Folder - Developer-Facing)
Documentation that **developers/contributors** need:
- Bug fix analyses and solutions
- Refactoring plans and architectural decisions
- Test summaries and TDD sessions
- Internal release notes
- Technical deep-dives

### Root Directory
High-level project documentation:
- `README.md` - Project overview, installation, marketplace info
- `TODO.md` - Outstanding tasks and feature tracking
- `CHANGELOG.md` - User-facing version history
- `TESTING.md` - How to run tests
- `PUBLISHING_GUIDE.md` - How to publish updates

### `/prompt/`
AI assistant context and startup information

## Contributing

When adding new documentation, ask:
- **"Is this for extension users?"** → `/docs/`
- **"Is this for extension developers?"** → `/docs/dev/`
- **"Is this about the project itself?"** → Root directory
