# TODO - Clarion Language Extension

This file tracks all outstanding tasks, bugs, and improvements for the Clarion Language Extension.

---

## 🐛 Critical Bugs

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

### Code Refactoring - Large TypeScript Files
**Priority:** HIGH  
**Status:** Not Started  
**Date Added:** Dec 5, 2024

#### Problem
Several TypeScript files have grown too large and complex:
- `client/src/extension.ts` - **3000+ lines** - Main extension entry point
- `client/src/documentManager.ts` - Large and complex
- Other large files may need similar treatment

#### Impact
- Difficult to navigate and understand
- Hard to locate specific functionality
- Increased risk of bugs during modifications
- Harder for new contributors
- Slower IDE performance with large files

#### Proposed Solution
**Break down `extension.ts` into focused modules:**
- `extensionActivation.ts` - Activation logic and phases
- `commandRegistration.ts` - Command registration
- `solutionManagement.ts` - Solution initialization and management
- `providerRegistration.ts` - Language feature providers
- `watcherManagement.ts` - File system watchers
- Keep `extension.ts` as thin orchestrator/entry point

**Similar refactoring for `documentManager.ts`:**
- `documentCache.ts` - Document caching logic
- `statementParser.ts` - INCLUDE/MODULE/MEMBER parsing
- `methodTracker.ts` - MAP procedure and CLASS method tracking
- Keep `documentManager.ts` as coordinator

#### Benefits
- ✅ Easier to understand and maintain
- ✅ Better separation of concerns
- ✅ Easier to test individual components
- ✅ Faster IDE performance
- ✅ Easier onboarding for contributors
- ✅ Reduced merge conflicts

#### Related Files
- `client/src/extension.ts` (3000+ lines)
- `client/src/documentManager.ts` (large/complex)
- Consider similar refactoring for other large files

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

## 📋 Documentation Cleanup
**Priority:** HIGH  
**Status:** Not Started  
**Date Added:** Dec 5, 2024

#### Problem
The repository root has accumulated too many documentation files that make it hard to find important information:
- Multiple README files (README.md, README-old.md)
- Multiple CHANGELOG files (CHANGELOG.md, CHANGELOG-old.md, CHANGELOG-0.7.1.md)
- Session documentation files at root level
- Various performance tracking documents
- Multiple .vsix release files cluttering the root
- **README.md has become too large** due to extensive feature documentation across many versions
- **CHANGELOG.md has become too large** with complete history of all versions

#### Impact
- Hard for developers to find relevant documentation
- Cluttered repository makes navigation difficult
- Historical documents mix with current documentation
- README.md and CHANGELOG.md are difficult to navigate due to size
- New users overwhelmed by amount of information in README
- README scrolling is tedious - takes long time to find specific features

#### Proposed Solution

**1. Archive Old Documentation:**
- Create `docs/archive/` directory for historical docs:
  - Move `README-old.md` → `docs/archive/`
  - Move `CHANGELOG-old.md`, `CHANGELOG-0.7.1.md` → `docs/archive/`
  - Move `AUDIT_2024-12-02.md` → `docs/archive/`
  - Move session/performance docs → `docs/archive/`
  - Move `REPOSITORY_REORGANIZATION.md` → `docs/archive/`

**2. Move Session Documents:**
- Session*.md files should be in `docs/dev/sessions/` (not root)
- Move performance tracking docs to `docs/dev/performance/`

**3. Archive Release Files:**
- Create `releases/` directory for old .vsix files
- Move all old .vsix files to `releases/`
- Keep only latest .vsix in root (or move all to releases/)

**4. Consolidate Large Files:**

**README.md - Split into Multiple Files:**
- **Main README.md** (keep brief):
  - Quick overview (2-3 paragraphs)
  - Installation instructions (keep simple)
  - Link to docs/FEATURES.md
  - Link to docs/GETTING_STARTED.md
  - Basic "Quick Start" section
- **docs/FEATURES.md** (detailed feature documentation):
  - Move all feature descriptions from README
  - Organize by category
  - Include screenshots/examples
- **docs/GETTING_STARTED.md**:
  - Detailed setup guide
  - Configuration options
  - Tutorial/walkthrough
- **docs/FAQ.md**:
  - Common questions
  - Troubleshooting
  - Tips and tricks

**CHANGELOG.md - Split by Time Period:**
- **CHANGELOG.md** (keep current):
  - Only recent releases (last 6-12 months)
  - Keep versions 0.7.x and newer
  - Clear and concise
- **docs/archive/CHANGELOG-2024.md**:
  - Move older 2024 releases
- **docs/archive/CHANGELOG-HISTORICAL.md**:
  - All pre-2024 releases
  - Complete version history preserved

**5. Prioritize Information for Different Audiences:**
- **Users** need: Quick start, features, installation
- **Contributors** need: Architecture, dev setup, coding standards
- **Maintainers** need: Release process, versioning, testing
- Organize documentation accordingly

#### Benefits
- ✅ Cleaner repository root
- ✅ Easier to find current documentation
- ✅ Historical information preserved but organized
- ✅ Better separation of user vs developer documentation
- ✅ Easier for new contributors to navigate
- ✅ README.md more digestible for new users
- ✅ CHANGELOG.md easier to browse for recent changes
- ✅ Documentation better organized by audience (users/contributors/maintainers)

---

## Notes
- Always run tests before committing
- Update CHANGELOG.md with user-facing changes
- Only increment version after merge to main and marketplace publish
- Commit often, push only when requested
