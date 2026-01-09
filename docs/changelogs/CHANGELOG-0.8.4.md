# Version 0.8.4 - Unreleased

[← Back to Changelog](../../CHANGELOG.md)

## 🏗️ Architecture Refactoring (January 2026)

### SymbolFinderService - Unified Symbol Finding
- **New centralized service** - Created `SymbolFinderService` to eliminate code duplication between HoverProvider and DefinitionProvider
- **~510 lines of duplicate code eliminated** - Parameter, local, module, and global variable finding logic unified
- **Comprehensive test coverage** - 12 unit tests for SymbolFinderService (100% passing)
- **Consistent behavior** - Hover and F12 now use identical logic for finding symbols
- **Performance improvement** - Global variable search now efficient (searches max 2 files instead of entire project)
- **Architecture correctness** - Follows Clarion MEMBER semantics (MEMBER files reference ONE parent only)

### Bug Fixes from Refactoring
- **Fixed: Global scope detection** - Variables in procedures no longer incorrectly identified as global when CODE token missing
- **Fixed: Colon-handling in labels** - F12 now works on labels like `BRW1::View:Browse` (searches full word first, then strips prefix)
- **Fixed: MEMBER file module variables** - Correctly finds module variables in MEMBER files with MAP blocks
- **Improved: Cross-provider consistency** - All variable finding uses same search hierarchy and logic

## 🎨 Template Language Support (January 2026)

### New Language: Clarion Template
- **Separate language definition** - `.tpl` and `.tpw` files now recognized as "Clarion Template" language
- **Comprehensive TextMate grammar** - Full syntax highlighting with 100+ template keywords
- **Template statements** - `#IF`, `#FOR`, `#CASE`, `#PROCEDURE`, `#CODE`, `#CONTROL`, `#EXTENSION`, `#GROUP`, etc.
- **Symbol management** - `#DECLARE`, `#SET`, `#EQUATE`, `#ADD`, `#FIX`, `#DELETE`, `#FIND`, etc.
- **Code generation** - `#GENERATE`, `#AT`, `#EMBED`, `#INSERT`, `#CALL`, `#INVOKE`
- **File operations** - `#CREATE`, `#OPEN`, `#APPEND`, `#CLOSE`, `#REDIRECT`
- **Prompts & UI** - `#PROMPT`, `#DISPLAY`, `#FIELD`, `#BUTTON`, `#BOXED`, `#ENABLE`
- **Control flow** - Full support for template loops, conditionals, and case statements
- **Template symbols** - `%Application`, `%File`, `%Field`, `%Procedure` and all built-in symbols highlighted
- **Comments** - `#!` (template), `#####` (aligned), `#??` (editor) comment types
- **Operators** - Logical (AND, OR, NOT), comparison, string concatenation, arithmetic
- **Target code embedding** - Clarion code within templates properly highlighted with `%symbol%` interpolation
- **Code folding** - Support for `#IF/#ENDIF`, `#FOR/#ENDFOR`, `#PROCEDURE`, and other structures
- **Configuration** - Color decorators disabled by default to prevent false positives on hex-like patterns

## 🎯 Major Performance Improvements

### MAP Resolution & Navigation Performance (January 2026)
- **Eliminated scanning hundreds of MEMBER files** during procedure lookups
- **Fast direct MODULE resolution** - Detects `MODULE('xxx.CLW')` references and resolves immediately
- **Smart fallback search** - Parent MAP searched directly when MODULE reference not found
- All three navigation features (Hover, F12, Ctrl+F12) now blazing fast

### Cross-File Navigation Enhancements (January 2026)
- **MAP INCLUDE source tracking** - Tokens from INCLUDE files now properly attributed for accurate navigation
- Added support for **START() procedure references** - Hover, F12, and Ctrl+F12 now work on procedure names inside START() calls
- Improved **DLL/LIB MODULE handling** - Automatically finds source files for compiled modules across projects

## ✨ Features

### Scope-Aware Navigation (December 2025)
- **New ScopeAnalyzer service** - Comprehensive scope analysis for Clarion code
- **Scope-aware F12 (Go to Definition)** - Correctly prioritizes procedure-local variables over globals with same name
- **Accurate scope determination** - Distinguishes global, module-local, procedure-local, and routine-local scope
- **Routine variable access** - Variables in routines accessible from parent procedure
- **Module-local scope** - MEMBER files have correct isolated scope
- **Variable shadowing** - Handles local variables hiding global variables correctly

### Build System Improvements (January 2026)
- **Fixed build configuration persistence** - Status bar changes now save correctly
- **Fixed MSBuild parameter handling** - Proper Configuration|Platform splitting (e.g., Debug|Win32)
- **Fixed PowerShell command escaping** - Semicolons and pipes in parameters no longer cause errors
- **Terminal reuse** - Build tasks now reuse terminal instead of creating new ones
- **Separate keyboard shortcuts** - Different behavior for keyboard (Ctrl+Shift+B) vs context menu builds
- **Auto-migration** - Old-style configurations (e.g., "Debug") automatically upgraded to "Debug|Win32"

### Navigation & IntelliSense (January 2026)
- **ProcedureCallDetector utility** - Centralized procedure call detection logic
- **Consistent CrossFileResolver usage** - All providers (Hover, Definition, Implementation) now use same service pattern
- **Enhanced MAP procedure lookup** - Handles both PROCEDURE and FUNCTION keywords interchangeably
- **Better MODULE extraction** - Upward search algorithm handles nested structures and indented declarations

### Documentation (January 2026)
- **Complete documentation restructure** - Created user-friendly guide structure
- **New guides/** - quick-start.md, common-tasks.md, installation.md
- **New features/** - navigation.md, signature-help.md, solution-management.md, diagnostics.md, code-editing.md
- **New reference/** - commands.md, settings.md, snippets.md
- **Streamlined README** - Now a hub linking to detailed docs (361 → 160 lines)
- **Critical accuracy fixes** - Removed false IntelliSense claims, corrected solution opening process
- **Feature clarifications** - Documented what works without a solution, same-file vs cross-file navigation
- **Navigation links** - All docs link back to main README

## 🐛 Bug Fixes

### Critical MAP Resolution Fixes (January 2026)
- Fixed **CrossFileResolver token filter** - Was checking `type` instead of `subType` for FUNCTION tokens
- Fixed **ImplementationProvider MEMBER support** - Now checks parent files like other providers
- Fixed **MAP INCLUDE source tracking** - Tokens from INCLUDE files now properly attributed
- Fixed **DLL reference hanging** - Immediate DLL check after redirection prevents infinite loops
- Fixed **heavily indented MAP structures** - Generated code with deep indentation now parsed correctly

### Build System Fixes (January 2026)
- Fixed configuration not persisting when changed via status bar
- Fixed MSBuild configuration/platform separation (Debug|Win32 split)
- Fixed PowerShell command parameter escaping (semicolons/pipes)
- Fixed terminal reuse for build tasks
- Fixed build completion messages showing when log file missing
- Fixed timing issue where configuration change event read stale data

### Documentation Fixes (January 2026)
- **Fixed unicode quote bug** - Paste as Clarion String now converts smart quotes to ASCII
- **Removed false auto-indentation claims** - Extension does not provide smart indentation
- **Fixed broken links** - Updated intellisense.md references to signature-help.md

## 🏗️ Architecture & Code Quality

### Service Pattern Improvements (December 2025 - January 2026)
- **ScopeAnalyzer service** - New scope analysis infrastructure (248 lines, 29 tests)
- Eliminated code duplication - All providers use **CrossFileResolver** service consistently
- Followed established service architecture from December refactoring
- **ProcedureCallDetector** utility class extracts reusable call detection logic

### Logging
- **All loggers set to error level** for production (minimal overhead)
- Logging only enabled during shutdown/deactivation for troubleshooting
- Removed 11 temporary debug logging statements from performance work

## 🧪 Testing

- **ScopeAnalyzer.test.ts** - 29 tests for scope analysis (December 2025)
- **DefinitionProvider integration tests** - 6 tests for scope-aware navigation (December 2025)
- **MapTokenType.test.ts** - Validates FUNCTION tokens have correct type/subType (January 2026)
- **CrossFileScope.test.ts** - Tests for START() procedure references (January 2026)
- Enhanced scope test suite with MODULE resolution examples
- **492 tests passing** throughout all changes

[← Back to Changelog](../../CHANGELOG.md)
