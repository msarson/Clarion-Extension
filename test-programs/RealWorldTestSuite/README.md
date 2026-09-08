# Real-World Test Suite

This directory contains real Clarion projects used for automated testing of the Clarion VS Code extension.

## Purpose

Unlike unit tests that use mocked or in-memory documents, these test suites use actual Clarion projects with real `.sln`, `.cwproj`, and `.clw` files to validate real-world scenarios.

## Test Projects

### CrossFileScope/
Tests cross-file scope resolution, including:
- MEMBER/PROGRAM relationships
- Global vs module-local variable access
- MAP declarations and procedure navigation
- F12 (Go to Definition) and Ctrl+F12 (Go to Implementation)

**Test files:**
- `server/src/test/SolutionBased.CrossFileScope.test.ts`
- `server/src/test/CrossFileScope.test.ts` (TEST 7 only)

### UpdatePYAccount_IBSCommon.clw — a sample without its MEMBER parent

This is a real generated ABC module copied in **without the PROGRAM it belongs to**.
It declares `MEMBER('IBSCommon.clw')`, `IBSCommon.clw` is not in this suite, and the
file is not listed in `CrossFileScope.cwproj`.

So the 13 `'GlobalRequest' is not declared in this file.` /
`'GlobalResponse' is not declared in this file.` diagnostics it produces are
**expected and correct**: those are ABC framework globals declared in the real
`IBSCommon` PROGRAM, and with no parent to resolve there is nothing for the
undeclared-variable check's MEMBER-parent tier to find. They are not a regression of
[#334](https://github.com/msarson/Clarion-Extension/issues/334) (globals pulled in via
`INCLUDE(...),ONCE`, fixed separately) and not an instance of
[#396](https://github.com/msarson/Clarion-Extension/issues/396).

Written down because the file reads as an ordinary real-world sample, and working out
that the missing parent *is* the point has cost more than one reader an hour.

## Structure

Each test project has its own subfolder with:
- `*.sln` - Solution file  
- `*.cwproj` - Project file
- `*.clw` - Source files
- README (if needed for manual testing)

## ⚠️ Important Guidelines

### DO NOT modify test files without updating tests!

These files are referenced by line numbers in automated tests. Changes to:
- Line numbers
- Variable names
- Structure declarations
- Comments (in some cases)

Will cause test failures.

### If you must change a test file:
1. Update the corresponding test expectations in `server/src/test/`
2. Verify all related tests pass: `npm test`
3. Document the change in commit message

## Adding New Test Projects

When adding a new real-world test project:

1. Create a new subfolder (e.g., `HoverTests/`)
2. Create `.sln` and `.cwproj` files
3. Add warning comments to `.clw` files referencing the test file
4. Update this README with the new project
5. Create/update test files in `server/src/test/`

## Running Tests

All tests using these projects:
```bash
npm test
```

Specific test suite:
```bash
npm test -- --grep "Cross-File"
```

## Solution Manager

Tests load these solutions using `SolutionManager` to simulate real VS Code workspace behavior:
- Solution/project parsing
- File resolution via redirection files
- Workspace-wide symbol navigation
