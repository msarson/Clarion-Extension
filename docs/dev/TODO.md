# TODO - Clarion Language Extension

This file tracks all outstanding tasks, bugs, and improvements for the Clarion Language Extension.

---

## 🐛 Critical Bugs

### ~~Clarion Keywords Used as Field Names~~ ✅ FIXED (Dec 7, 2024)
**Priority:** ~~HIGH~~ RESOLVED  
**Status:** ✅ Fixed and Tested  
**Date Added:** Dec 6, 2024  
**Date Fixed:** Dec 7, 2024

#### Problem
When Clarion keywords are used as field names (e.g., `nts:record`, `nts:case`, `file:loop`), the parser misidentified them as keyword tokens instead of field references, leading to false positive validation errors.

#### Solution
- Added negative lookbehinds `(?<![:\w.])` to all structure keywords: CASE, IF, LOOP, RECORD
- Added negative lookbehinds to ConditionalContinuation keywords: ELSE, ELSIF, OF
- Added negative lookbehinds to regular keywords: RETURN, THEN, UNTIL, WHILE, etc.
- Modified tokenizer to test STRUCTURE_PATTERNS individually (instead of combining with `|`) to preserve lookbehind functionality
- Added comprehensive test suite covering:
  - `nts:case`, `nts:record`, `hold:nts:case`
  - `myObj:end`, `myObj:if`, `myObj:loop`, `myObj:case`
  - `myObject.case`, `myObject.end`
  - Verification that standalone keywords still work correctly

**Test Results:** All 5 new tests passing ✅

**Files Modified:**
- `server/src/ClarionTokenizer.ts` - Added runtime check for keywords preceded by `:` or `.`
- `server/src/tokenizer/TokenPatterns.ts` - Already had negative lookbehinds in patterns
- `server/src/test/tokenizer-keyword-qualifier.test.ts` - New comprehensive test suite
- `server/src/test/DiagnosticProvider.test.ts` - Added test for RECORD keyword as field name

---

## 📝 Testing & Quality
- **Severity:** HIGH - Common pattern in Clarion code, causes confusing errors
- **Affected Keywords:** Any structural keyword that could be used as field name
  - `CASE`, `LOOP`, `IF`, `END`, `MAP`, `MODULE`, `CLASS`, `RECORD`, `GROUP`, `FILE`, `QUEUE`, `WINDOW`, etc.
- **User Experience:** False positive "unterminated structure" errors on valid code

#### Next Steps (Updated Dec 6, 2024)
1. ✅ Identified root cause: Missing negative lookbehind in pattern definitions
2. ✅ Confirmed RECORD already has correct pattern
3. 📋 Create comprehensive test suite covering all keywords as field names
4. 🔧 Implement Option 1: Add `/(?<![:\w.])` to all affected patterns in `TokenPatterns.ts`:
   - STRUCTURE_PATTERNS (CASE, IF, LOOP, MAP, FILE, QUEUE, etc.)
   - tokenPatterns[TokenType.Keyword] (RETURN, THEN, UNTIL, etc.)
   - tokenPatterns[TokenType.ConditionalContinuation] (ELSE, ELSIF, OF)
   - tokenPatterns[TokenType.WindowElement]
   - tokenPatterns[TokenType.Attribute]
5. ✅ Run full test suite
6. ✅ Verify with real-world code examples (friend's build log issues)

#### Related Files
- `server/src/ClarionTokenizer.ts` - Main tokenization logic
- `server/src/tokenizer/TokenPatterns.ts` - Keyword pattern definitions
- `server/src/providers/DiagnosticProvider.ts` - Validation that reports errors

---

### ~~Build Error Diagnostics Not Showing Correct File Location (Dec 2024)~~ ✅ FIXED
**Priority:** ~~HIGH~~ **COMPLETE**  
**Status:** ~~Not Started~~ **RESOLVED (Dec 4, 2024)**

#### Problem
When building a Clarion solution/project with compile errors, the errors appeared in the Problems pane but pointed to the wrong file location.

**Expected Behavior:**
- Errors should link to the actual source file where the error occurred
- Clicking the error should navigate to the correct file and line number
- Error should be clickable and actionable

**Previous Behavior:**
- Error pointed to temporary build output log: `C:/Users/msars/AppData/Local/Programs/Microsoft VS Code/BuildOutput.log`
- Error location showed line 1, column 1 (incorrect)
- Error message showed project file path in brackets: `[f:\\Playground\\ArrayInteger\\ArrayInteger.cwproj]`

#### Root Cause
The issue was caused by MSBuild parameters that suppressed detailed output:
1. `/consoleloggerparameters:ErrorsOnly` - Limited console output to errors only
2. Shell redirection (`> log 2>&1`) - Captured output but lost formatting
3. The combination prevented proper file location extraction from compiler messages

#### Solution Implemented
**Fixed MSBuild logging configuration:**
- Removed `/consoleloggerparameters:ErrorsOnly`
- Removed shell redirection in favor of MSBuild's native `/fileLogger`
- Added `/fileLoggerParameters` with detailed verbosity
- Updated regex patterns to handle both prefixed (`3> file.clw`) and non-prefixed (`file.clw`) formats

**Changes:**
- `buildTasks.ts`: Updated MSBuild arguments to use `/fileLogger` with proper parameters
- `processBuildErrors.ts`: Made task prefix (`3>`) optional in error regex patterns

**Result:**
- Build log now contains properly formatted errors with full file paths
- Diagnostics correctly point to source files
- Errors are clickable and navigate to the correct line/column
- Problems panel now functional for build errors

**Related Issue:** https://github.com/msarson/Clarion-Extension/issues/20

---

### ~~RECORD Keyword in Field Names (Dec 2024)~~ ✅ FIXED
**Priority:** ~~HIGH~~ **COMPLETE**  
**Status:** ~~Not Started~~ **RESOLVED (Dec 6, 2024)**

#### Problem
When using `record` as part of a field name (e.g., `nts:record`, `hold:nts:record`), the tokenizer was incorrectly identifying it as a RECORD structure keyword and flagging it as unterminated.

**Example Code:**
```clarion
TestProc PROCEDURE()
nts:record      LONG
hold:nts:record LONG
  CODE
  if GlobalResponse=RequestCancelled
    nts:record      = hold:nts:record
  else hold:nts:record = nts:record
  end
  RETURN
```

**Previous Behavior:**
- Diagnostics showed "RECORD statement is not terminated with END or ." for lines with field names
- `nts:record` and `hold:nts:record` were incorrectly flagged as structure declarations

#### Root Cause
The tokenizer was creating RECORD Structure tokens when processing substrings of lines:
1. Pattern `/\bRECORD\b/i` matched `record` at word boundaries
2. When tokenizing from position N (e.g., after `hold:nts:`), substring was `record LONG`
3. Negative lookbehind `(?<![:\w])` couldn't check the original line's context
4. RECORD was tokenized as Structure even though preceded by `:` in original line

#### Solution Implemented
**Added runtime reclassification in tokenizer:**
- Enhanced `ClarionTokenizer.ts` to check preceding character in original line
- When RECORD Structure token is found, checks `line[position - 1]`
- If preceded by `:` or word character, reclassifies as Variable
- Prevents false positives while maintaining true structure detection

**Changes:**
- `ClarionTokenizer.ts`: Added RECORD-specific reclassification logic
- `TokenPatterns.ts`: Updated RECORD pattern with negative lookbehind (partial fix)
- `DiagnosticProvider.test.ts`: Added comprehensive test case for field names with RECORD

**Result:**
- Field names like `nts:record` and `hold:nts:record` no longer flagged as unterminated structures
- True RECORD structure declarations still properly detected
- Test suite: 224 passing (was 223), 9 failing (was 10)

---

### Structure View - Method Implementation Issues (Dec 2024)
**Priority:** HIGH  
**Status:** Partially Fixed - Needs More Work

#### What Was Fixed (Session Dec 2, 2024)
- ✅ Method implementations now detected (StringTheory._Method pattern)
- ✅ Class hierarchy created (StringTheory (Implementation) → Methods)
- ✅ Variable scoping fixed (procedures don't inherit each other's variables)
- ✅ CODE filtering works (items after CODE don't appear in structure)
- ✅ Fixed spurious variable symbols for class name labels
- ✅ Tests: 188 passing (was 185), 5 failing (was 9)

#### What Was Fixed (Session Dec 3, 2024)
- ✅ Variable type display now shows correct types in outline (e.g., `x long` shows as "long" not "STRING")
- ✅ String initializers shown in type (e.g., `string('ABC...')` displays properly)
- ✅ Fixed hard-coded attribute keywords - now using tokenizer definitions
- ✅ Removed SIGNED/UNSIGNED from attributes (they are data types, not attributes)
- ✅ Added SIZE as special case (function that can be used in declarations)
- ✅ Created comprehensive test suite for variable type extraction
- ✅ Created utility module for attribute keyword detection (`AttributeKeywords.ts`)
- ✅ **FIXED: Unlabeled GROUP structures now nest correctly**
  - Example: `GROUP,OVER(bits),PRE()` without a label
  - Fields `triplet1`, `triplet2`, `triplet3` now correctly appear as children of the GROUP
  - Fixed symbol builder to properly handle unlabeled groups and their END terminators
  - Group fields no longer appear as siblings of the GROUP
- ✅ **FIXED: Method implementation hover now shows correct overload**
  - Hovering over `StringTheory.Instring Procedure(...)` now uses parameter count to find matching declaration
  - Uses same overload resolution logic as method call hover (e.g., `self.Instring(...)`)
  - Searches both current file and INCLUDE files for best matching overload
  - Returns exact match when parameter counts match, or closest match otherwise

#### Remaining Issues - Complete! ✅
- ✅ **F12 (Go to Definition) uses same overload resolution as hover** (Dec 3, 2024)
  - ✅ Pressing F12 on a method implementation (e.g., `StringTheory.Instring Procedure(...)`) now finds the correct overload
  - ✅ Uses parameter matching to find the correct overload, same as hover provider
  - ✅ Handles omittable parameters `<Long SomeVar>` and default values `Long SomeVar=1`
  - ✅ Created shared `MethodOverloadResolver` utility used by both HoverProvider and DefinitionProvider
  - ✅ Removed duplicate overload resolution code (~300 lines)
  - ✅ Searches both current file and INCLUDE files for best matching overload
  - ✅ Returns exact match when parameter counts match, or closest match otherwise

**Test files created:**
- `server/src/test/MethodImplementation.test.ts` - TDD tests for method structure
- `server/src/test-tokenizer-debug.ts` - Debug script for tokenization

**Key files involved:**
- `server/src/providers/ClarionDocumentSymbolProvider.ts` - Main symbol provider
- `server/src/DocumentStructure.ts` - Handles procedure/method detection (lines 605-640)
- `server/src/ClarionTokenizer.ts` - Tokenization logic

**Important Notes:**
- CODE statements MUST be indented, not at column 0
- Dot (`.`) used for: structure field access (Class.Method) AND structure terminator
- Label + Variable + PROCEDURE pattern = method implementation
- Need to respect Clarion's column 0 rules for labels

#### Next Steps
1. Review actual user workflow with method implementations
2. Check real-world StringTheory.clw structure view
3. Identify specific navigation/usability issues
4. Fix symbol hierarchy organization
5. Improve method display names
6. Test with actual Clarion projects

---

### ~~Fix Method Declaration Parsing in Classes~~ ✅ FIXED (Dec 2024)
**Priority:** ~~HIGH~~ **COMPLETE**  
**Status:** ~~In Progress~~ **RESOLVED**

#### Problem
Method definitions inside CLASS structures were being incorrectly parsed as properties/variables instead of methods.

**Example:**
```clarion
CLASS (StringTheory)
  ! ... other members ...
  Flush  PROCEDURE (StringTheory pStr),long, proc, virtual  ! <-- Was incorrectly parsed
```

#### Solution Implemented
Fixed in 3 commits (a63e88a, ea780ba, 69416e7):
1. **Fixed token type check**: Changed `handleVariableToken` to check `TokenType.Procedure` instead of `TokenType.Keyword`
2. **Fixed pattern matching order**: Moved `Type` before `Function` in pattern matching to prevent `STRING(50)` being tokenized as function call
3. **Fixed procedure name extraction**: Use `token.label` property instead of `prevToken`

#### Results
- ✅ CLASS methods now parse correctly in structure view
- ✅ All 170 tests passing
- ✅ StringTheory.Flush now appears as Method, not Property

---

#### Related
- Recent tokenizer changes for inline dot (`.`) terminators may have affected this
- Variable tokenization was working before these changes

---

## 🚀 Features

### Centralized Logging Configuration with Release Mode ✅ COMPLETE
**Priority:** ~~HIGH~~ **COMPLETE**  
**Status:** ~~Not Started~~ **IMPLEMENTED (Dec 5, 2024)**  
**Date Added:** Dec 5, 2024

#### Problem (RESOLVED)
Previously, logging levels were scattered throughout the codebase on both client and server sides. Before publishing a release, we needed to manually find and update log levels across many files to reduce verbosity for production users. This was error-prone and time-consuming.

#### Solution Implemented

Created a centralized logging configuration system with automatic release mode detection.

**Implementation Details:**

1. ✅ **Created `common/LoggingConfig.ts`**
   - Centralized configuration for all logging
   - Detects release mode via `VSCODE_RELEASE_MODE` environment variable
   - Development mode: `warn` level logging
   - Release mode: `error` level only
   - Automatic environment-based selection

2. ✅ **Updated Client Logger** (`client/src/logger.ts`)
   - Imports `LoggingConfig`
   - `LoggerManager.getLogger()` now uses `LoggingConfig.getDefaultLogLevel()`
   - Backward compatible - can still override level per-logger if needed

3. ✅ **Updated Server Logger** (`server/src/logger.ts`)
   - Same changes as client logger
   - Consistent behavior across both sides of LSP

4. ✅ **Updated `package.json`**
   - Added `compile:release` script with `VSCODE_RELEASE_MODE=true`
   - Added `package:release` script for packaging with release mode
   - Installed `cross-env` for cross-platform environment variable support

5. ✅ **Updated `PUBLISHING_GUIDE.md`**
   - Added pre-publishing checklist
   - Documented release mode build process
   - Clear instructions: always use `npm run compile:release` or `npm run package:release`

6. ✅ **Updated `STARTUP_AI_PROMPT.md`**
   - AI assistants now aware of release mode requirement
   - Integrated into version management process
   - Clear warnings about never publishing without release mode

**Benefits Achieved:**
- ✅ One-line change to switch between dev and release logging
- ✅ Consistent logging behavior across entire extension
- ✅ Less verbose output for end users
- ✅ Easier to maintain and update logging strategy
- ✅ Eliminates risk of shipping with excessive logging
- ✅ Zero changes needed to existing code - all automatic!

**Usage:**
```bash
# Development (normal work)
npm run compile

# Release (before publishing)
npm run compile:release
npm run package:release
```

**Migration:** Zero impact - all existing `LoggerManager.getLogger()` calls automatically use the appropriate log level based on mode!

---

### Structure View - Follow Cursor
**Priority:** MEDIUM  
**Status:** Complete ✅

Follow cursor functionality has been implemented with:
- Toggle via right-click menu: "Disable Follow Cursor" / "Enable Follow Cursor"
- Automatically reveals the current symbol in the structure view as cursor moves
- Uses `getParent()` method for proper nested tree item resolution

---

## 📋 Enhancements

### ~~Remove Original Solution View Welcome Screen~~ ✅ COMPLETE
**Priority:** ~~MEDIUM~~ **COMPLETE**  
**Status:** ~~Not Started~~ **RESOLVED (Dec 4, 2024)**

**Task:**
Replace the old welcome screen with a simple "Extension Loading..." message, as the new folder-based workflow automatically takes over once loaded.

**Solution Implemented:**
The `WelcomeViewProvider.ts` file was removed as it was completely unused. The `SolutionTreeDataProvider` already handles all necessary states:

1. **During activation**: Shows "Open Solution" node when `globalSolutionFile` not set
2. **No folder open**: Shows recent solutions from global history + action buttons
3. **Folder with no solutions**: Shows "No Solutions Detected" + browse option
4. **Folder with solutions**: Shows detected solutions with auto-selection

No additional loading message needed - the existing view provider handles all cases smoothly.

**Files Removed:**
- `client/src/WelcomeViewProvider.ts` - Completely unused, deleted

**Result:**
- Cleaner codebase with ~157 lines of dead code removed
- No duplicate/conflicting view providers
- Solution view seamlessly handles all loading and detection states

---

### ~~Diagnostics - Unterminated Structure Detection~~ ✅ COMPLETE (Dec 2024)
**Priority:** ~~MEDIUM~~ **COMPLETE**  
**Status:** Complete ✅

Added diagnostic provider that detects:
- ✅ IF statements not terminated with END or `.`
- ✅ LOOP statements not terminated with END, WHILE, or UNTIL
- ✅ Supports inline dot terminators (e.g., `IF A=B THEN C=D.`)
- ✅ Properly handles LOOP...WHILE and LOOP...UNTIL variations
- ✅ OMIT/COMPILE blocks not terminated with matching terminator string
- ✅ Fixed parser state corruption in large files (Dec 2024)

### Diagnostics - RETURN Statement Validation ✅ COMPLETE (Dec 2024)
**Priority:** ~~HIGH~~ **COMPLETE**  
**Status:** Complete ✅

Implementation complete and working:
- ✅ Validates procedures/methods with return types have RETURN statements
- ✅ Handles CLASS method declarations (return type in CLASS)
- ✅ Handles MAP procedure declarations (return type in MAP)
- ✅ Detects missing RETURN statements
- ✅ Detects empty RETURN statements (no value)
- ✅ **Properly extracts return types from any position in attribute list** (Dec 5, 2024)
  - `PROCEDURE(),LONG,NAME('Start')` ✅
  - `PROCEDURE(),NAME('Start'),LONG` ✅
  - `PROCEDURE(),PROC,LONG,NAME('Test')` ✅
- ✅ Added `extractReturnType()` utility function
- ✅ Removed `NAME` from Type token pattern (it's an attribute, not a data type)
- ✅ 219 tests passing (up from 216)

**Known to work:**
- CLASS methods: `MyClass.MyProc PROCEDURE(),LONG`
- MAP procedures: `MyProcedure PROCEDURE(),LONG`
- Return types in any attribute position

**Note:** Feature is complete and ready for real-world usage. User feedback will guide any future refinements.

### Performance Optimizations ✅ COMPLETE (Dec 2024)
**Priority:** HIGH  
**Status:** Complete ✅

Major performance improvements for large files:
- ✅ **Symbol caching**: Document symbols cached during editing, only recomputed on debounce
- ✅ **Folding range caching**: Folding ranges cached during editing, only recomputed on debounce  
- ✅ **Result**: ~1.5 second delay eliminated on every keystroke in large files (e.g., StringTheory.clw with 14K lines)
- ✅ Smooth editing experience - no more freezing while typing

**Before optimization:**
- Each keystroke triggered 1.5s full re-tokenization for symbol/folding updates
- Editing large files was extremely sluggish

**After optimization:**
- Symbols: `⚡ Document being edited, returning cached symbols`
- Folding: `⚡ Document being edited, returning cached folding ranges`
- Re-tokenization only happens once after 500ms of no edits (debounce)

---

## 📝 Documentation

### Clarion Language Knowledge Base
**Priority:** HIGH  
**Status:** ✅ Complete (Dec 2024)

Located at: `docs/clarion-knowledge-base.md`

Current coverage:
- ✅ Source file structure (PROGRAM/MEMBER)
- ✅ Data scope (Global, Module, Local, Routine Local)
- ✅ Statement terminators (END, `.`)
- ✅ Column 0 rules for labels
- ✅ IF/ELSIF/ELSE structure rules
- ✅ LOOP termination rules
- ✅ PROCEDURE/MEMBER/ROUTINE rules
- ✅ MAP structure rules
- ✅ MODULE termination context rules
- ✅ Character encoding (ANSI/ASCII only)
- ✅ OMIT/COMPILE conditional compilation directives (Dec 2024)
- ✅ CASE structure (Dec 2024)
- ✅ CHOOSE function (Dec 2024)
- ✅ EXECUTE structure (Dec 2024)
- ✅ GET statement - FILE/QUEUE operations (Dec 2024)
- ✅ SET statement - FILE/VIEW operations (Dec 2024)
- ✅ FILE declaration structure (Dec 2024)
- ✅ QUEUE structure (Dec 2024)
- ✅ GROUP structure (Dec 2024)
- ✅ VIEW structure (Dec 2024)
- ✅ CLASS and INTERFACE definitions (Dec 2024)

**Knowledge base is now comprehensive!**

---

## 🧪 Testing

### Unit Tests for Syntax Validation
**Priority:** MEDIUM  
**Status:** In Progress

Test files created:
- ✅ `docs/clarion-tests/test_clarion_syntax.clw` - Example syntax patterns
- ✅ `docs/clarion-tests/test_clarion_syntax_fixed.clw` - Valid compilation test
- ✅ `server/src/test/diagnostics.test.ts` - Diagnostic provider tests

Needs coverage:
- [ ] More complex nested structures
- [ ] Edge cases with dot terminators
- [ ] Method vs procedure differentiation
- [ ] Class inheritance and interfaces

---

## 🔧 Technical Debt

### ~~Code Refactoring - Large TypeScript Files~~ ✅ COMPLETE
**Priority:** ~~HIGH~~ **COMPLETE**  
**Status:** ~~Not Started~~ **COMPLETE (Dec 6, 2024)**  
**Date Added:** Dec 5, 2024  
**Date Completed:** Dec 6, 2024

#### Problem (RESOLVED)
The `client/src/extension.ts` file had grown to **2520 lines**, making it difficult to navigate, understand, and maintain.

#### Solution Implemented
Conducted comprehensive 6-phase refactoring using temporary branch workflow:

**Phase 1 - Extract Utility Functions** (59 lines)
- Created `client/src/utils/ExtensionHelpers.ts`
- Extracted 3 utility functions

**Phase 2 - Extract Status Bar Management** (75 lines)
- Created `client/src/statusbar/StatusBarManager.ts`
- Extracted 5 status bar functions

**Phase 3 - Extract Commands** (multiple sub-phases, 360 lines)
- Created `client/src/commands/NavigationCommands.ts` (4 commands)
- Created `client/src/commands/BuildCommands.ts` (6 commands)
- Created `client/src/commands/SolutionCommands.ts` (4 commands)
- Created `client/src/commands/ViewCommands.ts` (2 commands)
- Created `client/src/commands/MiscCommands.ts` (4 commands)

**Phase 4 - Extract Providers and Initialization** (570 lines)
- Created `client/src/views/ViewManager.ts` (tree view registration)
- Created `client/src/providers/LanguageFeatureProviders.ts` (LSP features)
- Created `client/src/watchers/FileWatcherManager.ts` (file system watchers)

**Phase 5 - Extract Complex Logic** (667 lines)
- Created `client/src/solution/SolutionOpener.ts` (solution opening logic)
- Created `client/src/solution/QuickOpenManager.ts` (quick open functionality)
- Created `client/src/initialization/ExtensionInitializer.ts` (initialization)
- Created `client/src/languageserver/LanguageServerManager.ts` (LSP client)

**Phase 6 - Final Activation Refactor** (150 lines)
- Created `client/src/activation/ExtensionActivator.ts` (orchestration)
- Reduced `extension.ts` to minimal entry point

#### Final Results
- ✅ **extension.ts: 2520 → 153 lines** (94% reduction!)
- ✅ Created **15 focused, well-documented modules**
- ✅ All **218 tests still passing**
- ✅ Clean compilation, no errors
- ✅ All functionality preserved and verified

#### Modules Created (Total: ~2,367 lines organized)
1. `utils/ExtensionHelpers.ts` (94 lines)
2. `statusbar/StatusBarManager.ts` (128 lines)
3. `commands/NavigationCommands.ts` (128 lines)
4. `commands/BuildCommands.ts` (168 lines)
5. `commands/SolutionCommands.ts` (139 lines)
6. `commands/ViewCommands.ts` (85 lines)
7. `commands/MiscCommands.ts` (180 lines)
8. `views/ViewManager.ts` (183 lines)
9. `providers/LanguageFeatureProviders.ts` (186 lines)
10. `watchers/FileWatcherManager.ts` (201 lines)
11. `solution/SolutionOpener.ts` (297 lines)
12. `solution/QuickOpenManager.ts` (246 lines)
13. `initialization/ExtensionInitializer.ts` (124 lines)
14. `languageserver/LanguageServerManager.ts` (187 lines)
15. `activation/ExtensionActivator.ts` (126 lines)

#### Benefits Achieved
- ✅ **Dramatically easier to navigate** - Find code in seconds, not minutes
- ✅ **Clear separation of concerns** - Each module has single responsibility
- ✅ **Better testability** - Can test modules independently
- ✅ **Faster IDE performance** - Small files load instantly
- ✅ **Easier onboarding** - New contributors can understand structure quickly
- ✅ **Reduced merge conflicts** - Changes isolated to specific modules
- ✅ **Maintainability** - Changes to one area don't affect others

#### Workflow Used
Successfully used user's preferred temporary branch workflow:
1. Create branch (e.g., `refactor/phase-1-utilities`)
2. Make changes and commit
3. User tests thoroughly
4. Merge to version branch
5. Delete temporary branch
6. Repeat for next phase

All 6 phases completed using this cycle, with user testing between each phase.

---

### Architecture - Navigation Provider Duplication
**Priority:** MEDIUM  
**Status:** Not Started  
**Date Added:** Dec 5, 2024

#### Problem
MAP procedure and CLASS method navigation is split between client and server with significant duplication:

**Current State:**
- **SERVER SIDE:** Has tokens, document structure, symbols for ALL declarations (including PROCEDURE)
- **CLIENT SIDE:** Re-parses documents to extract MAP procedures and CLASS methods for navigation
- **Result:** Duplicate parsing, inconsistent data, confusing architecture

**Why It's Currently Client-Side:**
- DocumentManager was built for INCLUDE/MODULE file links (needs file system access)
- MAP/CLASS navigation was added to existing DocumentManager
- Client-side made sense at the time for file system access

#### Proposed Solution
**Option 1: Move Navigation to Server** (Recommended)
- Server already has DocumentSymbols with all declarations
- Add MAP block tracking to server-side tokenizer/symbol provider
- Move Definition/Implementation providers to server
- Keep only INCLUDE/MODULE/MEMBER on client (file system needs)

**Option 2: Consolidate Without Moving**
- Server sends MAP/CLASS metadata to client via custom LSP notification
- Client uses that data for navigation (no duplicate parsing)

#### Benefits
- ✅ Eliminate duplicate parsing
- ✅ Single source of truth for declarations
- ✅ Consistent behavior across features
- ✅ Easier to maintain
- ✅ Better performance

#### Impact
- Requires refactoring Definition, Implementation, and Hover providers
- Need to handle cross-file navigation in server context
- May need custom LSP protocol extensions

#### Related Files
- `client/src/documentManager.ts` - Client-side declaration tracking
- `client/src/providers/definitionProvider.ts` - Client-side navigation
- `client/src/providers/implementationProvider.ts` - Client-side navigation
- `server/src/providers/ClarionDocumentSymbolProvider.ts` - Server-side symbols
- `server/src/ClarionTokenizer.ts` - Server-side tokenization

---

### Code Organization
- ✅ **COMPLETE:** Separated tokenizer logic into smaller, focused modules
  - Created `server/src/tokenizer/` directory with modular structure:
    - `TokenTypes.ts` - Type definitions
    - `TokenPatterns.ts` - Pattern definitions
    - `PatternMatcher.ts` - Pattern matching logic
    - `StructureProcessor.ts` - Structure processing utilities
  - Reduced main tokenizer file from 837 to 482 lines (~42% reduction)
  - Improved maintainability and testability
- [ ] Add more inline documentation for complex parsing logic
- ✅ **COMPLETE:** Optimized performance bottlenecks (Dec 2024)
  - Eliminated duplicate tokenization in diagnostic validation (50% reduction)
  - Reduced excessive logging overhead (9 high-frequency loggers: info/debug → error)
  - Test suite: 79ms → 65ms (18% faster)
  - Should dramatically improve responsiveness for large files like StringTheory.clw
  - Performance logging enhanced with [PERF] tags for visibility

### Logging
- ✅ **COMPLETE:** Review and standardize logging levels across codebase (Dec 2024)
  - Set all hot-path providers to "error" level only
  - Performance metrics still visible via console.log
  - Eliminates thousands of unnecessary log calls per document change

---

## 📦 Repository Organization

### Documentation Structure ✅ COMPLETE (Dec 2024)
**Status:** Complete ✅

Reorganized documentation with clear separation:
- ✅ User-facing docs remain in `docs/` root
- ✅ Developer/technical docs moved to `docs/dev/`
- ✅ Created `docs/README.md` as user-facing index
- ✅ Created `docs/dev/README.md` as developer guide
- ✅ "What Goes Where" guidelines for future docs

**User docs** (`docs/`):
- CheatSheet.md, BuildSettings.md (guides)
- clarion-knowledge-base.md, CLARION_LANGUAGE_REFERENCE.md (language ref)
- RELEASE_NOTES_*.md (user release notes)
- clarion-tests/ (example code)

**Developer docs** (`docs/dev/`):
- Bug fix analyses (FIX_*.md, HOTFIX_*.md)
- Feature development (DIAGNOSTIC_*.md, SYMBOL_PROVIDER_*.md)
- Test summaries (TDD_SESSION_*.md, TEST_*.md)
- Technical fixes (TOKENIZER_BUG_*.md, UNICODE_FIX.md)

### Recent Changes
- ✅ Created `docs/clarion-tests/` for test Clarion code
- ✅ Created `docs/clarion-knowledge-base.md` for language reference
- ✅ Consolidated documentation in `docs/` directory
- ✅ Separated user and developer documentation (Dec 2024)

---

## 📋 Documentation Cleanup ✅ COMPLETE
**Priority:** ~~HIGH~~ **COMPLETE**  
**Status:** ~~Not Started~~ **COMPLETE (Dec 5, 2024)**  
**Date Added:** Dec 5, 2024

#### Problem (RESOLVED)
The repository root had accumulated too many documentation files that made it hard to find important information:
- Multiple README files (README.md, README-old.md)
- Multiple CHANGELOG files (CHANGELOG.md, CHANGELOG-old.md, CHANGELOG-0.7.1.md)
- Session documentation files at root level
- Various performance tracking documents
- Multiple .vsix release files cluttering the root
- **README.md was too large** (472 lines) due to extensive feature documentation
- **CHANGELOG.md was too large** (785 lines) with complete history of all versions

#### Solution Implemented

**1. ✅ Archived Old Documentation:**
- Created `docs/archive/` directory
- Moved `README-old.md` → `docs/archive/`
- Moved `CHANGELOG-old.md`, `CHANGELOG-0.7.1.md` → `docs/archive/`
- Moved `AUDIT_2024-12-02.md` → `docs/archive/`
- Moved `REPOSITORY_REORGANIZATION.md` → `docs/archive/`
- Moved performance tracking docs → `docs/archive/`
  - `PERFORMANCE_IMPROVEMENTS_2025-12-01.md`
  - `PERFORMANCE_METRICS.md`
  - `PERFORMANCE_SESSION_2024-12-01.md`
- Backed up full README → `docs/archive/README-full-v0.7.3.md`

**2. ✅ Archived Release Files:**
- Created `releases/` directory
- Moved 14 old .vsix files to `releases/`
- Only current version (0.7.3) remains in root

**3. ✅ Split Large Files:**

**README.md** - Reduced from 472 to 112 lines (76% reduction):
- Brief overview and quick start
- Key features summary
- What's new highlights
- Links to detailed documentation
- Preserved dedication to Brahn Partridge
- Preserved contributing section

**CHANGELOG.md** - Reduced from 785 to 380 lines (52% reduction):
- Contains only versions 0.7.0 and newer
- Older versions moved to `docs/archive/CHANGELOG-HISTORICAL.md`
- Added reference link to historical changelog

**New Documentation Files Created:**
- **`docs/FEATURES.md`** - Complete feature documentation organized by category
- **`docs/GETTING_STARTED.md`** - Detailed setup guide with configuration and troubleshooting

**4. ✅ Moved Development Files:**
- Created `test-programs/dev-tests/` directory
- Moved 9 test files from root:
  - `test-group-structure.js`
  - `test-local-alignment.clw`
  - `test-local-data-alignment.clw`
  - `test-method-tokens.js`
  - `test-solution-history.js`
  - `test-structure-view.clw`
  - `test-tokenizer-unlabeled.js`
  - `test-unlabeled-group.clw`
  - `test-variable-types.clw`
- Moved `GettingStarted.md` → `docs/archive/GettingStarted-old.md`
- Moved `FEATURE_SMART_DETECTION.md` → `docs/dev/`
- Moved `tree-output.txt` → `docs/archive/`

#### Results

**Root Directory:**
- ✅ Cleaner, easier to navigate
- ✅ Only essential files remain
- ✅ README.md is concise and scannable
- ✅ CHANGELOG.md focuses on current releases

**Documentation:**
- ✅ Well-organized in `docs/` directory
- ✅ Separated by audience (users vs developers)
- ✅ Historical information preserved in `docs/archive/`
- ✅ Easy to find relevant documentation

**Files Organized:**
- 10 old docs archived
- 14 .vsix files archived
- 9 test files moved
- 2 new documentation files created
- README: 472 → 112 lines
- CHANGELOG: 785 → 380 lines

---

## 🔧 Technical Debt
- Always run tests before committing
- Update CHANGELOG.md with user-facing changes
- Only increment version after merge to main and marketplace publish
- Commit often, push only when requested
