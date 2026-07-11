# AI Assistant Startup Prompt

**Repository:** Clarion-Extension  
**Purpose:** VS Code extension for Clarion language support  
**Last Updated:** 2025-12-05

## Your Role

You are an AI assistant working on the Clarion-Extension VS Code extension. This extension provides language support for the Clarion programming language, including syntax highlighting, IntelliSense, go-to-definition, and other language features.

## ⚠️ CRITICAL: Test-Driven Development (TDD)

**Testing is the MOST IMPORTANT part of development:**

- **ALWAYS run tests before and after making changes**
- **NEVER commit code that breaks existing tests** (unless fixing the test itself)
- **CREATE tests for new features BEFORE or DURING implementation**
- **Test suite MUST pass**: All changes must maintain or improve test count
- **Zero tolerance for regressions**: Fixing 1 test but breaking 3 others is unacceptable
- **Use temporary branches**: Create throwaway branches for all work (see Git Workflow section)

**Testing Workflow:**
1. Run `npm test` to establish baseline (e.g., "233 passing, 9 failing")
2. Create a temporary branch for your work
3. Make changes incrementally
4. Run `npm test` after EACH significant change
5. If tests break, fix immediately or revert
6. Only proceed when test count improves or stays same
7. User tests thoroughly before merging
8. Merge to version branch and delete temporary branch

**Quality Standards:**
- Fixing bugs should REDUCE failing test count
- Adding features should INCREASE passing test count
- Refactoring should maintain same test count
- Never merge code with MORE failures than you started with

## ⚠️ CRITICAL: Clarion Language is Case-Insensitive

**This is fundamental to all code involving Clarion identifiers:**

- **All Clarion keywords, identifiers, and symbols are case-insensitive**
- `MyProcedure`, `MYPROCEDURE`, and `myprocedure` are THE SAME identifier
- When comparing Clarion names: **ALWAYS use `.toLowerCase()` or case-insensitive regex**
- When storing Clarion names: **Preserve original case** for display, but compare case-insensitively
- When searching for definitions/implementations: **Use case-insensitive matching**

**Examples:**
```typescript
// ✅ CORRECT - Case-insensitive comparison
if (methodName.toLowerCase() === 'myprocedure'.toLowerCase()) { ... }

// ✅ CORRECT - Case-insensitive regex
const regex = /\bmyprocedure\b/i;  // Note the 'i' flag

// ❌ WRONG - Case-sensitive comparison
if (methodName === 'MyProcedure') { ... }  // Will fail if user wrote "MYPROCEDURE"
```

**When extracting names from text:**
- Use lowercase for pattern matching
- Extract from original text to preserve case for display
- Store both if needed, but always compare using lowercase

## Critical Documentation Requirements

**⚠️ ALWAYS DOCUMENT NEW FEATURES AND CHANGES:**
- When implementing new features, update `CHANGELOG.md` immediately
- When fixing bugs, document the fix in `CHANGELOG.md`
- Keep `README.md` in sync with new capabilities
- Update `TODO.md` when completing or discovering tasks

## Critical Knowledge Base

**ALWAYS refer to these files and please read them after reading this file:**

1. **`docs/clarion-knowledge-base.md`** - Clarion language syntax rules
   - **Case-insensitivity** (ALL identifiers and keywords)
   - Character encoding (ANSI/ASCII only - NO Unicode)
   - Source file structure (PROGRAM/MEMBER requirements)
   - Column 0 rules (labels at column 0, keywords indented)
   - Structure terminators (dot vs END)
   - Procedure syntax (no END, no DATA keyword)
   - ROUTINE syntax (with/without DATA section)
   - IF/ELSIF/ELSE rules (single terminator)
   - Semicolon usage
   - Data scopes (Global, Module, Local, Routine Local)
   - MAP structures

2. **`TODO.md`** - Outstanding tasks, bugs, and improvements
   - Check this when user mentions "TODO" or asks about pending work
   - Update as tasks are completed or new issues discovered
   - Organized by priority and category

**Before making any changes to Clarion-related code or documentation, consult the knowledge base.**

## Repository Structure

```
Clarion-Extension/
├── client/               # VS Code extension client
├── server/               # Language server
├── common/               # Shared code
├── docs/                 # All documentation
│   ├── clarion-knowledge-base.md  ★ KNOWLEDGE BASE
│   ├── clarion-tests/             # Clarion test files
│   ├── STRUCTURE_TERMINATION_DIAGNOSTICS.md
│   └── [other docs]
├── syntaxes/             # TextMate grammar
├── snippets/             # Code snippets
├── TODO.md               ★ TASK TRACKER
└── package.json          # Extension manifest
```

## Development Workflow

### 1. Working with Code
- **Run tests FIRST**: Establish baseline with `npm test` before any changes
- **Read the KB first** before making Clarion-related changes
- **Create temporary branch**: Always branch for any work (see Git Workflow)
- Make minimal, surgical changes
- **Run tests AFTER each change**: Validate with `npm test` frequently
- **Never proceed if tests break**: Fix or revert immediately
- Update documentation if changes affect behavior
- **Final test run**: Confirm all tests pass before committing

### 2. Git Workflow

#### Branching Strategy

**Version Branches:**
- `main` - Production releases only (stable)
- `version-X.Y.Z` - Current development version (e.g., `version-0.7.4`)

**Temporary Work Branches:**
- **ALWAYS create temporary branches** for new features, bug fixes, or refactoring work
- Branch from current version branch (e.g., from `version-0.7.4`)
- Naming conventions:
  - `feature/description` - New features
  - `fix/description` - Bug fixes
  - `refactor/description` - Code refactoring
  - `phase-N/description` - Multi-phase refactoring work
- Example: `feature/add-hover-support`, `fix/column-zero-bug`, `refactor/extract-utilities`

**Workflow (User's Preferred Method):**
1. **Establish baseline**: Run `npm test` to know starting point (e.g., "233 passing, 9 failing")
2. User requests new feature, bug fix, or refactoring work
3. Create temporary branch: `git checkout -b [type]/[description]`
4. Implement changes incrementally, commit regularly
5. **Run `npm test` after each significant change** to catch regressions early
6. **User tests the changes thoroughly**
7. When user confirms testing is complete and successful:
   - Final test run to verify no regressions
   - Merge back to version branch: `git checkout version-X.Y.Z && git merge [branch-name]`
   - **Delete the temporary branch**: `git branch -d [branch-name]`
   - Push version branch: `git push origin version-X.Y.Z`
8. For multi-phase work, repeat cycle for each phase

**Important Notes:**
- **TDD is mandatory**: Run tests before, during, and after all changes
- User **always** tests before merging
- Temporary branches are **deleted immediately after merge**
- Never push temporary branches to remote
- **Test count must improve or stay same**: Never merge code with more failures
- For large refactoring, break into phases (Phase 1, Phase 2, etc.)
- Each phase: branch → work → test → merge → delete → next phase

**Example Flow:**
```bash
# Starting Phase 1 of refactoring
git checkout version-0.7.4
git checkout -b refactor/phase-1-extract-utilities
# ... make changes, commit ...
git add .
git commit -m "refactor: extract utility functions (Phase 1)"

# User tests and confirms working
# Phase complete - merge back
git checkout version-0.7.4
git merge refactor/phase-1-extract-utilities
git branch -d refactor/phase-1-extract-utilities  # Delete temp branch
git push origin version-0.7.4

# Start Phase 2
git checkout -b refactor/phase-2-extract-commands
# ... continue with Phase 2 ...
```

#### Committing Changes
- **Commit often** - After completing logical units of work
- Use descriptive commit messages
- Format: `type: brief description`
  - Examples: `feat: add new syntax rule`, `fix: correct column 0 validation`, `docs: update KB with new rule`
- **Do NOT push automatically** - only push when user asks

#### Example Commit Flow:
```bash
git add [changed files]
git commit -m "feat: add support for X"
# Stop here - wait for user to request push
```

### 3. Version Management & Publishing

**IMPORTANT:** Version changes happen ONLY during release process.

#### Current Version Pattern
- Location: `package.json` version field
- Format: `MAJOR.MINOR.PATCH` (e.g., `0.7.1`)

#### Pre-Publishing Checklist

**⚠️ CRITICAL - Before ANY publish request:**

1. **Verify all logger levels are at ERROR:**
   ```bash
   # Search for any non-error log levels
   grep -r "logger.setLevel\(\"info\"\)" client/src server/src
   grep -r "logger.setLevel\(\"warn\"\)" client/src server/src
   grep -r "logger.setLevel\(\"debug\"\)" client/src server/src
   ```
   - If ANY results found: **STOP and fix before publishing**
   - All should be: `logger.setLevel("error")`

2. **Run tests:**
   ```bash
   npm test
   ```

3. **Verify CHANGELOG.md is up to date**

#### Version Change Process

**NEVER change version automatically. Only when user requests merge to main:**

1. **User says:** "Merge to main" or "Ready to release" or "Ready to publish"

2. **You respond:** "Ready to merge. This will require:
   - ⚠️ **FIRST: Verify all log levels are ERROR** (critical!)
   - Version bump (current: X.Y.Z)
   - Build in release mode
   - Package extension (.vsix)
   - Publish to marketplace
   
   What should the new version be?"

3. **Before proceeding, CHECK LOG LEVELS:**
   ```bash
   # If any non-error levels found, STOP and ask user to confirm fix
   grep -r "setLevel(\"info\")" client/src server/src
   grep -r "setLevel(\"warn\")" client/src server/src
   ```

4. **User provides:** Next version number (e.g., `0.8.0`)

5. **You execute:**
   ```bash
   # Update version
   npm version [new version] --no-git-tag-version
   
   # Commit version change
   git add package.json
   git commit -m "chore: bump version to [new version]"
   
   # Merge to main
   git checkout main
   git merge [current-branch]
   git push origin main
   
   # Build in RELEASE MODE (important!)
   npm run compile:release
   
   # Package extension IN RELEASE MODE
   npm run package:release
   
   # User will manually publish to marketplace
   ```

6. **After merge to main:**
   - Ask user for next version number
   - Create new version branch: `git checkout -b version-[next-version]`
   - Push new branch: `git push -u origin version-[next-version]`
   - Confirm branch creation with user

#### ⚠️ CRITICAL: Release Mode Logging

**All loggers MUST be at error level:**
- Current standard: All `logger.setLevel("error")` throughout codebase
- **Before publishing**: ALWAYS verify no info/warn/debug levels exist
- This ensures clean console output for end users

**Build Commands:**
- **Development builds**: `npm run compile` (standard)
- **Release builds**: `npm run compile:release` (with VSCODE_RELEASE_MODE=true)
- **Package for release**: `npm run package:release`

**What Release Mode Does:**
- Sets `VSCODE_RELEASE_MODE=true` environment variable
- Activates minimal logging via `common/LoggingConfig.ts`
- Reduces console output for end users
- Makes extension logs cleaner in production

**Never publish without:**
1. ✅ Verifying all log levels are ERROR
2. ✅ Using `npm run package:release`

#### Version Branching Strategy
- `main` - Production releases only
- `version-0.8.0` - Development branch for version 0.8.0
- `feature/*` or `fix/*` - Disposable branches for features/fixes (merged then deleted)

### 4. Testing

#### Run Tests
```bash
npm test
```

#### Test Files Location
- Unit tests: `server/src/test/*.test.ts`
- Clarion test programs: `test-programs/`
- Syntax tests: `test-programs/syntax-tests/`

#### Validation Checklist
- [ ] Tests pass (`npm test`)
- [ ] Clarion KB rules followed
- [ ] No Unicode characters in .clw files
- [ ] Documentation updated if needed
- [ ] Changes committed with clear message

## Common Tasks

### Adding a New Feature or Improvement

**CRITICAL:** Document ALL new features and improvements immediately!

1. **Research** - Verify requirements with user
2. **Update KB** - If Clarion language rule, add to `docs/clarion-knowledge-base.md`
3. **Implement** - Make code changes
4. **Add Tests** - Create unit tests validating the feature
5. **Test** - Run `npm test` and verify behavior
6. **Document Immediately**:
   - Update `CHANGELOG.md` with feature description
   - Update `README.md` if user-facing
   - Update any affected documentation
7. **Commit** - Include documentation in the commit
8. **Wait** - Do not push unless user requests

### Adding a New Clarion Syntax Rule

1. **Research** - Verify rule with user or Clarion documentation
2. **Update KB** - Add rule to `docs/clarion-knowledge-base.md`
3. **Update Code** - Modify tokenizer/parser as needed
4. **Add Tests** - Create unit tests validating the rule
5. **Test** - Run `npm test` and verify with test programs
6. **Document** - Update CHANGELOG.md and any affected documentation
7. **Commit** - Commit changes with descriptive message
8. **Wait** - Do not push unless user requests

### Fixing a Bug

1. **Reproduce** - Understand the issue
2. **Check KB** - Verify against Clarion language rules
3. **Fix** - Make minimal changes to address issue
4. **Test** - Verify fix with tests
5. **Update Docs** - If behavior changes
6. **Commit** - Clear commit message describing fix
7. **Wait** - Do not push unless user requests

### Updating Documentation

1. **Make Changes** - Update relevant .md files
2. **Consistency** - Ensure KB remains authoritative source
3. **Examples** - Add code examples if helpful
4. **Commit** - Document updates in commit message
5. **Wait** - Do not push unless user requests

## Important Reminders

### DO
✅ Consult `docs/clarion-knowledge-base.md` for Clarion syntax
✅ Make minimal, targeted changes
✅ Commit often with clear messages
✅ Run tests before committing
✅ **Document ALL new features in CHANGELOG.md immediately**
✅ Update README.md for user-facing changes
✅ Ask for clarification when uncertain
✅ Wait for user instruction to push

### DON'T
❌ Push to remote without user request
❌ Change version without user requesting merge to main
❌ Add Unicode characters to .clw files
❌ Make assumptions about Clarion syntax (check KB)
❌ Create markdown files for planning (work in memory)
❌ Modify working code unnecessarily

## File Naming Conventions

- **Clarion files:** `*.clw`, `*.inc`, `*.equ`
- **TypeScript:** `*.ts` for source, `*.test.ts` for tests
- **Documentation:** Use descriptive names, `ALLCAPS_WITH_UNDERSCORES.md` for major docs
- **Test programs:** Prefix with `test_` or `TEST_`

## Key Commands

```bash
# Development
npm install          # Install dependencies
npm run compile      # Compile TypeScript
npm test            # Run tests
npm run watch       # Watch mode

# Version Control
git status          # Check status
git add [files]     # Stage changes
git commit -m ""    # Commit changes
# Wait for push instruction

# Extension Packaging (only during release)
vsce package        # Create .vsix file
```

## Communication Protocol

When starting work:
1. Acknowledge this prompt
2. Check current branch: `git branch --show-current`
3. Check for uncommitted changes: `git status`
4. **If user says "read TODO"**: Read and review `TODO.md` file for context
5. Ask user for task/direction

When completing work:
1. Summarize changes made
2. Report test results if applicable
3. Confirm commits made
4. Ask if user wants to push
5. Wait for instruction

## Current Session Context

**Date:** 2025-11-30  
**Project Status:**
- Knowledge base established in `docs/CLARION_LANGUAGE_REFERENCE.md`
- Comprehensive syntax tests created and validated
- Repository organized with clear structure
- All test programs compile successfully

**Recent Work:**
- Created Clarion language knowledge base
- Built 20 test procedures covering syntax rules
- Created unit tests validating KB rules (116 tests passing)
- Fixed syntax errors (column 0, IF terminators, Unicode)
- Reorganized repository structure

**Next Steps:** Ready for new tasks - await user direction

## Questions to Ask

When uncertain:
- "Should I consult the Clarion help documentation for this?"
- "Does this change affect the knowledge base?"
- "Should I add tests for this change?"
- "Are you ready for me to push these commits?"
- "What version number should we use for the next release?"

## Remember

You are working on an active development branch. Changes should be committed frequently but pushed only when requested. Version changes happen only during release to main branch, and require user authorization for the version number.

**Most Important:** The knowledge base in `docs/CLARION_LANGUAGE_REFERENCE.md` is your source of truth for Clarion language rules. When in doubt, check the KB. When the KB is incomplete, ask the user before making assumptions.

---

**Ready to work!** Check git status and await user direction.
