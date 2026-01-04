# Change Log

All notable changes to the "clarion-extension" extension will be documented in this file.

This changelog contains versions **0.7.0 and newer**. For older releases (0.6.x and earlier), see [docs/archive/CHANGELOG-HISTORICAL.md](docs/archive/CHANGELOG-HISTORICAL.md).

---

## [0.8.4] - Unreleased

### 🎨 Template Language Support (January 2026)

#### New Language: Clarion Template
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

### 🎯 Major Performance Improvements

#### MAP Resolution & Navigation Performance (January 2026)
- **Eliminated scanning hundreds of MEMBER files** during procedure lookups
- **Fast direct MODULE resolution** - Detects `MODULE('xxx.CLW')` references and resolves immediately
- **Smart fallback search** - Parent MAP searched directly when MODULE reference not found
- All three navigation features (Hover, F12, Ctrl+F12) now blazing fast

#### Cross-File Navigation Enhancements (January 2026)
- **MAP INCLUDE source tracking** - Tokens from INCLUDE files now properly attributed for accurate navigation
- Added support for **START() procedure references** - Hover, F12, and Ctrl+F12 now work on procedure names inside START() calls
- Improved **DLL/LIB MODULE handling** - Automatically finds source files for compiled modules across projects

### ✨ Features

#### Scope-Aware Navigation (December 2025)
- **New ScopeAnalyzer service** - Comprehensive scope analysis for Clarion code
- **Scope-aware F12 (Go to Definition)** - Correctly prioritizes procedure-local variables over globals with same name
- **Accurate scope determination** - Distinguishes global, module-local, procedure-local, and routine-local scope
- **Routine variable access** - Variables in routines accessible from parent procedure
- **Module-local scope** - MEMBER files have correct isolated scope
- **Variable shadowing** - Handles local variables hiding global variables correctly

#### Build System Improvements (January 2026)
- **Fixed build configuration persistence** - Status bar changes now save correctly
- **Fixed MSBuild parameter handling** - Proper Configuration|Platform splitting (e.g., Debug|Win32)
- **Fixed PowerShell command escaping** - Semicolons and pipes in parameters no longer cause errors
- **Terminal reuse** - Build tasks now reuse terminal instead of creating new ones
- **Separate keyboard shortcuts** - Different behavior for keyboard (Ctrl+Shift+B) vs context menu builds
- **Auto-migration** - Old-style configurations (e.g., "Debug") automatically upgraded to "Debug|Win32"

#### Navigation & IntelliSense (January 2026)
- **ProcedureCallDetector utility** - Centralized procedure call detection logic
- **Consistent CrossFileResolver usage** - All providers (Hover, Definition, Implementation) now use same service pattern
- **Enhanced MAP procedure lookup** - Handles both PROCEDURE and FUNCTION keywords interchangeably
- **Better MODULE extraction** - Upward search algorithm handles nested structures and indented declarations

### 🐛 Bug Fixes

#### Critical MAP Resolution Fixes (January 2026)
- Fixed **CrossFileResolver token filter** - Was checking `type` instead of `subType` for FUNCTION tokens
- Fixed **ImplementationProvider MEMBER support** - Now checks parent files like other providers
- Fixed **MAP INCLUDE source tracking** - Tokens from INCLUDE files now properly attributed
- Fixed **DLL reference hanging** - Immediate DLL check after redirection prevents infinite loops
- Fixed **heavily indented MAP structures** - Generated code with deep indentation now parsed correctly

#### Build System Fixes (January 2026)
- Fixed configuration not persisting when changed via status bar
- Fixed MSBuild configuration/platform separation (Debug|Win32 split)
- Fixed PowerShell command parameter escaping (semicolons/pipes)
- Fixed terminal reuse for build tasks
- Fixed build completion messages showing when log file missing
- Fixed timing issue where configuration change event read stale data

### 🏗️ Architecture & Code Quality

#### Service Pattern Improvements (December 2025 - January 2026)
- **ScopeAnalyzer service** - New scope analysis infrastructure (248 lines, 29 tests)
- Eliminated code duplication - All providers use **CrossFileResolver** service consistently
- Followed established service architecture from December refactoring
- **ProcedureCallDetector** utility class extracts reusable call detection logic

#### Logging
- **All loggers set to error level** for production (minimal overhead)
- Logging only enabled during shutdown/deactivation for troubleshooting
- Removed 11 temporary debug logging statements from performance work

### 📝 Documentation
- Added comprehensive MAP INCLUDE testing documentation
- Updated scope test suite with START() procedure examples
- Added scope analysis implementation documentation

### 🧪 Testing
- **ScopeAnalyzer.test.ts** - 29 tests for scope analysis (December 2025)
- **DefinitionProvider integration tests** - 6 tests for scope-aware navigation (December 2025)
- **MapTokenType.test.ts** - Validates FUNCTION tokens have correct type/subType (January 2026)
- **CrossFileScope.test.ts** - Tests for START() procedure references (January 2026)
- Enhanced scope test suite with MODULE resolution examples

---

## [0.8.3] - 2025-12-31

### 🎉 Major Improvements

#### Package Size Optimization (50% Reduction!)
- **Reduced from 37.9 MB to 18.84 MB** - 19.06 MB savings
- **File count reduced by 46%** - From 20,651 to 11,082 files
- **Node modules reduced by 95%** - From 10,118 to 549 files
- Removed telemetry infrastructure (215 packages: applicationinsights, @azure/*, @opentelemetry/*)
- Removed unused tree-sitter dependencies (2 packages)
- Consolidated xml2js duplicates using npm dedupe

#### Procedure Call Navigation (New Feature!)
- **F12 (Go to Definition)** on procedure calls navigates to MAP declaration
- **Ctrl+F12 (Go to Implementation)** on procedure calls navigates to PROCEDURE implementation
- **Enhanced Hover** shows both MAP declaration and implementation (up to 10 lines of context)
- Works with MEMBER files (automatically checks parent file's MAP)
- Respects parameter overloading for correct resolution
- Includes navigation hints in hover tooltips

### ✨ Features
- Complete navigation support for procedure calls matching class method workflow
- Enhanced procedure hover to show implementation context (signature, LOCAL DATA, CODE, first statement)
- Smart stopping in hover display (at RETURN, next procedure, or max 10 lines)

### 🐛 Bug Fixes
- Fixed release mode detection to check source file existence instead of runtime environment variable
- Fixed procedure call detection to check after word range end, not cursor position  
- Fixed URI decoding in hover provider (properly decode %3A to colon in file paths)
- Fixed implementation finding by using MAP declaration position instead of call position
- Fixed Debug Console logging configuration in launch.json

### 🧹 Cleanup & Quality
- Replaced all debug console.log statements with proper logger calls
- Removed all telemetry tracking code and related imports
- Cleaned up obsolete debug configurations (Launch Server, Attach to Server, etc.)
- Simplified launch.json to single Launch Client configuration
- Updated logging to respect production/development mode automatically

### 📝 Documentation
- Added explicit copy-data scripts for JSON file deployment  
- Documented syntax support (261 items: 148 builtins, 82 attributes, 31 controls)
- Updated build process documentation

### 🔧 Technical Improvements  
- Release mode auto-detected in packaged VSIX (checks if source files excluded)
- Logger levels properly configured (error-only in production, warn in development)
- Build scripts explicitly copy data files (builtins, attributes, controls, datatypes JSON)

---

## [0.8.2] - 2025-12-30

### ⚡ Performance Improvements

#### Massive Performance Boost for Large Files
- **58x faster incremental updates** - Keystroke response time reduced from 820-880ms to 10-15ms
  - **Root cause**: Token cache was rebuilding DocumentStructure indexes on every keystroke
  - **Fix**: DocumentStructure now built on-demand only when providers need it
  - **Impact**: Signature help, hover, and completions now appear almost instantly in large files (13K+ lines)
  
- **Optimized folding provider**
  - Fixed crash when folding ranges exceeded string serialization limits
  - Added range limit of 10,000 to prevent excessive memory usage
  - Large files now fold smoothly without crashes

### 📚 Language Support Expansion

#### New Keywords & Built-in Functions Added
- **Data Types**: `UNSIGNED`, `INT64`, `UINT64`
- **Keywords**: `PRAGMA`, `EQUATE`, `ONCE`, `PROCEDURE`, `FUNCTION`, `EXECUTE`, `BEGIN`, `ASSERT`, `SELF`, `PARENT`, `ALL`, `TIMES`, `NULL`, `BREAK`, `PEEK`, `ADDRESS`, `END`, `NOT`, `?` (debug marker)
- **Logical Operators**: `BAND`, `BOR`, `BXOR`, `BNOT`, `BSHIFT`
- **Built-in Functions**: `INT`, `ROUND`, `VAL`, `CHR`, `INSTRING`, `CLOCK`, `TODAY`, `DAY`, `MONTH`, `YEAR`
- **Procedure Attributes**: `RAW`, `PASCAL`, `PROC`, `NAME`, `DLL`, `C`, `STDCALL`, `PRIVATE`, `PROTECTED`, `VIRTUAL`, `DERIVED`

#### Context-Aware Documentation
- `TO` keyword now shows different help based on context (LOOP vs CASE OF)
- Enhanced hover documentation for procedures with multiple usage contexts

---

## [0.8.0] - 2025-12-30

### 🐛 Critical Bug Fixes

#### Unreachable Code Detection - Complete Fix for Branching Structures
- **Fixed incorrect unreachable detection in branching control flow**
  - ELSE/ELSIF branches now correctly reset termination flags
  - CASE OF/OROF/ELSE branches now properly handled
  - EXECUTE/BEGIN blocks now correctly scoped
  - ROUTINE with EXIT now properly terminates only the routine
  - **Impact**: Eliminates false positives where reachable code was incorrectly dimmed
  
- **Root causes identified and fixed**:
  1. ELSE was tokenized as `ConditionalContinuation` but code checked for `Keyword` type
  2. OROF was missing from tokenizer pattern entirely
  3. BEGIN was treated as "grouping only" causing parent EXECUTE to be incorrectly terminated
  4. ROUTINE didn't push itself onto structure stack, so EXIT had no context
  5. END statements were being marked unreachable (now correctly excluded)

- **Clarion semantics now properly implemented**:
  - **Branching structures**: IF/ELSIF/ELSE, CASE/OF/OROF/ELSE, EXECUTE/BEGIN, ROUTINE
    - Terminator (RETURN/EXIT/HALT) only affects that branch
  - **Looping structures**: LOOP, ACCEPT
    - Terminator affects entire procedure
  - **Branch keywords**: ELSE, ELSIF, OF, OROF
    - Reset terminated flag when entering new branch

- **Example cases now working**:
  ```clarion
  IF condition
    RETURN TRUE
  ELSE
    DO Something    ! ✓ No longer incorrectly marked unreachable
  END
  RETURN FALSE      ! ✓ Correctly reachable
  
  EXECUTE a
    BEGIN
      RETURN
      x = 1         ! ✓ Correctly unreachable (inside BEGIN)
    END
    x = 2           ! ✓ Correctly reachable (different EXECUTE branch)
  END
  
  TestRoutine ROUTINE
    EXIT
    x = 1           ! ✓ Correctly unreachable (after EXIT)
  x = 2             ! ✓ Correctly reachable (procedure code after ROUTINE)
  ```

### 🔧 Technical Improvements

- **Added OROF to tokenizer pattern** (`server/src/tokenizer/TokenPatterns.ts`)
  - Now recognized as ConditionalContinuation alongside OF
- **Enhanced branch detection logic** (`server/src/providers/UnreachableCodeProvider.ts`)
  - Checks both Keyword and ConditionalContinuation token types
  - Properly resets termination flags for ELSE/ELSIF/OF/OROF/ELSE
- **Fixed BEGIN scoping** 
  - Now treated as branching structure (like IF/CASE)
  - RETURN inside BEGIN only terminates that BEGIN block
- **Fixed ROUTINE handling**
  - ROUTINE now pushed onto structure stack
  - EXIT properly terminates ROUTINE but not procedure
  - ROUTINE code now analyzed for unreachability

---

## [0.7.9] - 2025-12-29

### 🚀 Major Improvements

#### Unreachable Code Detection - Refactored for Accuracy
- **Complete architectural refactoring** - Uses server-side token analysis instead of client-side parsing
  - Leverages proven `finishesAt` properties from DocumentStructure
  - No more manual depth tracking or complex parsing
  - Eliminates entire class of false positive bugs
  - **57% code reduction** (322 → 138 lines) with improved accuracy
  - Simple algorithm: Check if terminator is inside structure using finishesAt boundaries
  - Automatically handles all edge cases (single-line IF, nested structures, etc.)

#### Tokenizer Performance Optimizations
- **40-50% faster tokenization** for typical Clarion files
  - **Structure pattern early-exit guards** (~90% test reduction)
    - Skip tests in CODE execution sections (structures are declarations)
    - Skip if not first token on line
    - Skip if column > 30 (structures near left margin)
    - Keyword pre-check before expensive regex
  - **Procedure analysis caching** (30-40% faster)
    - Track analyzed procedures to avoid re-scanning
    - Early exit for procedures without local variables
  - **Context-based pattern gating** (5-10% reduction)
    - LineContinuation: only test at line end or with & | characters
    - ImplicitVariable: only test where suffix characters present
    - Class: only test when dot follows
  - See `TOKENIZER_PERF_IMPROVEMENTS.md` for detailed analysis

### 🐛 Critical Bug Fixes

- **Fixed false positives in unreachable code detection**
  - Conditional RETURN inside IF/LOOP/CASE no longer marks following code as unreachable
  - Example: `IF x THEN RETURN END` followed by reachable code now works correctly
  - Root cause: Single-line IF detection was matching multi-line IFs
  - **Impact**: Affects common early-return guard pattern used throughout Clarion code

### 🏗️ Architecture Improvements

- **Server-side unreachable code provider** (new)
  - Uses token finishesAt to determine structure containment
  - Simple logic: Is RETURN inside a structure? Check boundaries!
  - If `structure.line < returnLine && structure.finishesAt > returnLine` → conditional
  - Handles ROUTINE blocks, nested structures, all control flow automatically
  
- **Simplified client-side decorator**
  - Requests ranges from server via LSP custom request
  - Debounced updates (500ms) to reduce server load
  - No parsing, no depth tracking, no edge case handling

### 📚 Documentation

- Added `TOKENIZER_PERF_IMPROVEMENTS.md` - Performance optimization details
- Added `docs/UNREACHABLE_CODE_REFACTOR.md` - Architecture and algorithm explanation
- Added test case: `test-programs/unreachable-code/test-conditional-return.clw`

---

## [0.7.8] - 2025-12-29

### ✨ Major Features

#### Smart IntelliSense for Built-in Functions
- **62 Clarion built-in functions** with comprehensive IntelliSense support
  - Parameter hints with data type information and descriptions
  - Optional parameter support with `<>` notation
  - Smart attribute completion for functions like `WHO()`, `WHAT()`, `WHERE()`
  - **Data type system** - Complete type definitions for parameters and return values
  - Function categories: String, Numeric, Date/Time, File I/O, System, Memory, Conversion, and more
  - Examples: `CLIP()`, `SUB()`, `INSTRING()`, `FORMAT()`, `CHOOSE()`, `POINTER()`, `WHO()`, `WHAT()`, `WHERE()`

#### Unreachable Code Detection (Phase 1)
- **Visual dimming** of provably unreachable code in procedures, methods, and functions
  - Detects code after unconditional RETURN, EXIT, or HALT statements at top execution level
  - Respects Clarion semantics: ROUTINE blocks are always reachable, STOP is not a terminator
  - Handles complex nested structures: ACCEPT, LOOP, CASE, IF, EXECUTE, BEGIN
  - **Now supports FUNCTION declarations** in addition to PROCEDURE and METHOD
  - Non-intrusive visual dimming with 40% opacity
  - Zero false positives by design - conservative detection only
  - Linear O(n) performance with no editor impact
  - Configurable via `clarion.unreachableCode.enabled` setting (default: enabled)

#### MODULE/MEMBER Cross-file Navigation
- **Enhanced MODULE file support** with bidirectional navigation
  - Go to Definition (F12) from CLASS with MODULE attribute navigates to implementation file
  - Go to Implementation (Ctrl+F12) from MAP MODULE declaration navigates to source file
  - Reverse lookup: From MEMBER file, navigate back to parent MAP declaration
  - **Global variable lookup** - Hover and definition support for variables declared in parent MODULE files
  - Intelligent file path resolution supporting both absolute and redirection paths
  - Hover tooltips show parent MAP declarations when in MEMBER files

#### Enhanced SECTION Support in INCLUDE Files
- **SECTION navigation and hover** improvements
  - Hover on `INCLUDE('file.inc', 'SectionName')` shows exact SECTION content from file
  - Go to Definition (F12) navigates directly to SECTION line, not just file top
  - Skips comments when searching for SECTION declarations
  - Visual preview of SECTION content in tooltips

### 🔧 Major Improvements

#### Method Overload Resolution with Parameter Type Matching
- **Intelligent overload resolution** based on actual parameter types
  - Distinguishes between `STRING`, `*STRING`, `&STRING`, `<STRING>` overloads
  - Handles custom types and class references correctly
  - Works across: Hover tooltips, Go to Definition (F12), Go to Implementation (Ctrl+F12)
  - Example: `Str(STRING)` vs `Str(SystemStringClass)` now resolve to correct implementations
  - **Add Method Implementation** now creates correct overload instead of duplicating

#### Provider Refactoring and Performance
- **HoverProvider refactoring** - Complete rewrite for maintainability and performance
  - Eliminated duplicate code paths and legacy methods
  - Server-side and client-side coordination to prevent duplicate tooltips
  - Unified resolver pattern for consistent behavior
  - Better caching with TokenCache system
- **ImplementationProvider refactoring** - Enhanced cross-file navigation
  - Uses DocumentStructure semantic APIs for accurate MAP block detection
  - Improved MODULE and MEMBER file handling
  - Better error handling and fallback mechanisms
- **DefinitionProvider refactoring** - Extracted specialized resolvers for maintainability
  - Dedicated resolvers for MAP procedures, includes, members, and more
  - Better separation of concerns and code organization

#### Token System Enhancements
- **Token positioning improvements** - Accurate start positions for all tokens with leading whitespace
- **finishesAt property** - Better tracking of structure boundaries to prevent hover overflow
- **referencedFile property** - Unified file reference tracking for MODULE/LINK/INCLUDE tokens
- **Structure lifecycle fixes** - Proper validation of unterminated structures with finishesAt

### 🐛 Bug Fixes

- **Fixed unreachable code detection for FUNCTION declarations** - FUNCTIONs were not recognized, causing incorrect dimming
- **Fixed hover duplicates** - Eliminated duplicate hover information from client and server providers
- **Fixed token start positions** - All tokens now have correct positions accounting for leading whitespace
- **Fixed MAP procedure hover** - No longer triggers implementation check on declaration line
- **Fixed FUNCTION keyword support** - FUNCTION declarations now properly recognized throughout extension
- **Fixed structure keyword matching** - Structure keywords (REPORT, FILE, etc.) no longer match inside template parameters
- **Fixed F12 behavior on declarations** - Returns null per LSP spec instead of staying in place
- **Fixed MEMBER file resolution** - Proper support for local paths without full solution context
- **Fixed method implementation preview length** - Shows appropriate number of lines in hovers
- **Fixed nested MODULE handling** - Proper detection in MAP blocks for hover and navigation
- **Fixed stale content issues** - Hover and navigation now read from workspace, not just disk
- **Fixed MAP declaration formats** - Handles both indented and column 0 MAP declarations
- **Fixed document link exclusions** - Test files properly excluded from .mocharc.json

### 📚 Documentation
- Added `docs/UNREACHABLE_CODE_PHASE1.md` - Complete feature documentation
- Added `IMPLEMENTATION_SUMMARY.md` - Implementation details and architecture
- Added `TESTING_CHECKLIST.md` - Comprehensive testing guide
- Added test files in `test-programs/unreachable-code/` directory
- Updated hover provider and definition provider documentation

---

## [Unreleased]

### ✨ Features
- TBD

### 🔧 Improvements  
- TBD

### 🐛 Bug Fixes
- **Fixed hover and Go to Definition for overloaded methods with parameter type matching**
  - Resolved issue where overloaded methods with same parameter count but different types would navigate to wrong overload
  - Example: `Str(STRING)` and `Str(SystemStringClass)` now correctly resolve to their specific implementations
  - **Hover improvements:**
    - Added dynamic detection of method implementation lines in client-side hover provider
    - Client defers to server for complete type information to avoid duplicates
    - Hover now works on both declarations (INC) and implementations (CLW)
    - Properly matches overloaded methods by parameter types when showing hover
  - **Go to Definition improvements:**
    - F12 on method implementations now navigates to correct overload based on parameter types
    - Type-based matching finds exact overload signature (not just parameter count)
    - Handles pointer (`*`), reference (`&`), and omittable (`<>`) parameter modifiers correctly
- **Fixed Go to Implementation for multiple classes** - Resolved issue where Go to Implementation failed when multiple classes were defined in the same INC/CLW file pair
  - Fixed regex offset calculation for class position tracking

### 🧪 Testing
- Added comprehensive test suite for method overload resolution (`MethodOverloading.test.ts`)
  - Tests for parameter type parsing (STRING, *STRING, &STRING, custom types)
  - Tests for parameter signature matching
  - Tests for hover and definition provider overload resolution
  - Tests for multiple overloads with same method name
  - All 313 tests passing
  - Corrected class name start position to account for leading whitespace
  - Now properly matches method implementations to their class context
- **Fixed LINK statement parsing** - Enhanced LINK pattern to support optional DLL linking parameters
  - Pattern now handles: `LINK('file.lib')` and `LINK('file.lib',_LinkMode_)`
  - Fixes issue where LINK statements with parameters weren't recognized
- **Fixed hover for missing implementations** - Added visual indicator when method implementation cannot be found
  - Shows ⚠️ "Implementation not found" message instead of hanging
  - Applies to both METHOD and MAP procedure declarations
- **Fixed overloaded method matching** - Go to Implementation and Add Method Implementation now correctly distinguish between overloaded methods with different parameter types (e.g., `STRING` vs `*STRING` vs `&STRING` vs `<STRING>`)
  - Previously only checked parameter count, causing wrong overload selection
  - Now uses full parameter type signature matching including omittable parameters
  - Fixes issue where pointer/reference/omittable overloads were not properly handled
- **Fixed duplicate implementation creation** - Add Method Implementation no longer creates duplicates when run multiple times without saving
  - Now reads from editor's current state instead of stale disk content
  - Correctly detects existing implementations even if unsaved
- **Fixed hover showing stale implementations** - Hover now shows correct implementation even with unsaved changes in MODULE files
  - Previously read from disk, missing unsaved edits in open files
  - Now reads from workspace for accurate hover information

---

## [0.7.7] - 2025-12-24

### 📚 Documentation
- **Updated FEATURES.md** - Added all features from v0.7.4-0.7.6
  - Create New Class command
  - Add Method Implementation command
  - Paste as Clarion String command
  - CODE statement markers
  - CLASS/QUEUE property validation
  - Recent bug fixes section
- **Created COMMANDS_AND_SETTINGS.md** - Comprehensive reference for all commands and settings
- **Reorganized documentation structure**
  - Moved developer docs to `docs/dev/`
  - Moved AI context to `docs/ai/`
  - Created README files for each section

### 🧹 Cleanup
- **Removed 60+ debug test files** from root directory
  - test-*.js, test-*.clw files
  - test-programs/* development files
  - Significantly smaller package size
- **Removed commercial StringTheory.inc file**
  - Copyright violation - accidentally included in v0.7.5/v0.7.6
  - Added to .gitignore to prevent re-inclusion
- **Improved .vscodeignore**
  - Package size reduced from 32,790 files (51.96 MB) to 20,578 files (37.61 MB)
  - 37% fewer files, 27% smaller package
  - Excludes all documentation, test files, and development artifacts
  - Only ships runtime-required files

### ⚠️ Important Note
- v0.7.5 and v0.7.6 accidentally included a commercial StringTheory.inc file
- File has been removed from all branches and added to .gitignore
- v0.7.7 and all future releases will not contain this file

---

## [0.7.6] - 2025-12-24

### 📚 Documentation
- **Fixed README.md** - Added missing v0.7.5 section and corrected year to 2025
- No functional changes from v0.7.5

---

## [0.7.5] - 2024-12-24

### ✨ Features
- **Create New Class Command**
  - New command: "Clarion: Create New Class" with interactive wizard
  - Creates both `.inc` and `.clw` files simultaneously
  - Interactive prompts for:
    - Class name (validated as Clarion identifier)
    - Include filename (editable, defaults to `ClassName.inc`)
    - Source filename (editable, defaults to `ClassName.clw`)
    - Add Construct method (Yes/No)
    - Add Destruct method (Yes/No)
    - Location (current folder or browse for folder)
  - File conflict detection with error and cancel
  - Respects user tab/space editor settings
  - Proper Clarion formatting and alignment
  - Opens both files in tabs after creation
  - Eliminates manual file creation and ensures naming consistency
- **Add Method Implementation Command**
  - New command: "Clarion: Add Method Implementation" with keybinding `Ctrl+Shift+I`
  - Works when cursor is on a method declaration line in `.inc` file
  - Automatically finds the corresponding `.clw` file via MODULE attribute
  - Checks if implementation already exists (with parameter matching for overloads)
  - If exists: Jumps to existing implementation
  - If not exists: Generates and adds implementation at end of file
  - Respects user tab/space settings
  - Includes return type as comment `!,ReturnType` on PROCEDURE line (not in signature)
  - Developer adds RETURN statement as needed
  - Only works within CLASS context (errors outside)
  - Perfect for quickly adding method implementations without manual copying
- **Paste as Clarion String Command**
  - New command: "Clarion: Paste as String" with keybinding `Ctrl+Shift+Alt+V`
  - Converts clipboard text into properly formatted Clarion string with continuation
  - Automatically escapes single quotes (converts `'` to `''`)
  - Adds Clarion string continuation syntax (`& |`)
  - Aligns all opening quotes at the same column position
  - Configurable line terminator via `clarion.pasteAsString.lineTerminator`:
    - `"space"` (default) - Adds trailing space to each line (ideal for SQL queries)
    - `"crlf"` - Adds `<13,10>` line break to each line
    - `"none"` - No separator between lines
  - Configurable whitespace trimming via `clarion.pasteAsString.trimLeadingWhitespace`:
    - `true` (default) - Removes leading whitespace from each line (ideal for pasting code)
    - `false` - Preserves original indentation inside strings
  - Only active in Clarion files for safety
  - Perfect for pasting SQL queries, HTML, or any multi-line text into Clarion code
  - Demo file: `ExampleCode/demo-paste-as-string.clw`
- **Extension Status Command**
  - New command: "Clarion: Show Extension Status" (accessible via Ctrl+Shift+P)
  - Displays comprehensive extension status in Output panel
  - Shows language server status, workspace info, solution status, and more
  - On-demand checking replaces old passive status view
  - Better formatted output with clear sections and status indicators
- **Improved Outline View - Flattened Structure**
  - All symbols now appear at root level for easier navigation
  - Class method implementations show with fully-qualified names (e.g., `MyClass.MyMethod`)
  - Interface method implementations show with full path (e.g., `MyClass.IInterface.Method`)
  - Methods labeled as "Method Implementation" instead of "Global Procedure"
  - Container nodes (Classes, Methods, Properties, etc.) removed for cleaner view
  - CODE markers no longer displayed in outline
- **Enhanced Structure View - Hierarchical Grouping**
  - Class method implementations now grouped under class containers
  - Methods grouped in "Methods" folder within each class
  - Interface method implementations grouped under interface folders within classes
  - Maintains hierarchical class structure for better organization
  - Clicking items navigates correctly without bounce issues
  - Follow cursor highlights the correct method when editing
- **Added CLASS property validation diagnostic**
  - QUEUE structures are not allowed as direct CLASS properties
  - Only QUEUE references (&QUEUE) are permitted in CLASS
  - New diagnostic error shows when QUEUE is used incorrectly
  - GROUP structures remain valid as CLASS properties
- **Added QUEUE nesting validation diagnostic**
  - QUEUE structures cannot be nested inside other QUEUE structures
  - Only QUEUE references (&QUEUE) are permitted inside QUEUE
  - New diagnostic error shows when nested QUEUE is used incorrectly
  - GROUP structures remain valid inside QUEUE

### � Improvements
- **Removed Extension Status View from sidebar**
  - Status view replaced with on-demand command for cleaner UI
  - Reduces sidebar clutter
  - Status checking now only when needed, improving performance

### �🐛 Bug Fixes
- **Fixed stale diagnostics after document changes**
  - Force full re-tokenization on document changes to prevent stale token structures
  - Fixes issue where CLASS was incorrectly flagged as unterminated after adding QUEUE
  - Incremental tokenization cache could cause structure hierarchy issues
- **Fixed ROUTINE DATA section variables hierarchy**
  - Variables declared in ROUTINE DATA sections now appear as children of the ROUTINE in outline
  - Fixed DATA keyword recognition when appearing as Label token (at column 0)
  - Both DocumentStructure and ClarionDocumentSymbolProvider updated to handle ROUTINE variables correctly
- **Fixed MODULE structure hierarchy in MAP blocks**
  - MODULE inside MAP now correctly becomes a child of MAP instead of the containing PROCEDURE
  - Improves navigation and structure understanding in document outline
  - Preserves MODULE as non-structure when used in CLASS attribute lists
- **Corrected MODULE termination validation rules**
  - Removed incorrect assumption that MODULE can appear inside CLASS/INTERFACE body
  - MODULE only appears as CLASS attribute or inside MAP blocks (per Clarion language spec)
  - Removed invalid test cases for MODULE inside CLASS body
- **Fixed RETURN statement validation**
  - Fixed END statement detection to work with indented END keywords (not just column 0)
  - Fixed case-insensitive matching of procedure/method names
  - Now correctly validates procedures/methods with return types have RETURN statements with values
  - Fixes 3 failing tests for RETURN validation
- **Removed invalid ELSE validation test**
  - Removed test that incorrectly flagged valid ELSE with multiple statements
  - ELSE clauses can have multiple statements and are terminated by ELSIF, ELSE, or END
- **Fixed GROUP/QUEUE/RECORD field display in outline view**
  - Structure fields (like GROUP properties in CLASS) now properly show in outline/structure view
  - Field labels are now added as children of their parent structure during processing
  - GROUP/QUEUE structures inside CLASS are now added to the Properties container
  - Fixes issue where BoundBox GROUP inside CLASS didn't show its MaxX/MaxY properties
  - Fixes issue where GROUP appeared as direct child of CLASS instead of under Properties folder

### 💡 Technical Details

---

## [0.7.4] - 2024-12-06

### ✨ Features
- **Major codebase refactoring** - Improved maintainability and code organization
  - Reduced extension.ts from 975 lines to 175 lines (82% reduction!)
  - Extracted 15+ focused modules for better separation of concerns
  - Improved testability and future enhancement capabilities
  - All features tested and validated - no breaking changes

### 🐛 Bug Fixes
- **Fixed false positive IF statement validation errors** ([#24](https://github.com/msarson/Clarion-Extension/issues/24))
  - Single-line `IF...THEN` statements no longer incorrectly flagged as missing `END`
  - Complete `IF...THEN...END` structures on one line now correctly recognized
  - Example: `IF condition THEN statement` is now correctly recognized as valid
  - Example: `of ?field ; IF condition THEN action END` no longer triggers false error
  - Handles semicolon-separated multi-statement lines properly
  - Prevents spurious "IF Statement is not terminated with END" errors on valid code
  
- **Fixed false positive FILE validation errors** ([#23](https://github.com/msarson/Clarion-Extension/issues/23))
  - FILE declarations inside `COMPILE()` / `OMIT()` conditional blocks are now properly excluded from validation
  - Prevents "FILE statement missing DRIVER/RECORD" errors on conditionally compiled FILE declarations
  - Validator now understands only one of the conditional FILE definitions will be active

- **Fixed MSBuild logging parameters syntax**
  - Corrected `fileLoggerParameters` configuration for proper MSBuild logging output
  - Diagnostic messages now display correctly in build output

- **Fixed build error reporting**
  - No longer shows "Build Failed" message when build succeeds with warnings
  - Only reports failures when actual compilation errors occur

- **Fixed ROUTINE parsing**
  - ROUTINE keyword now correctly recognized in all contexts
  - Improved structure validation for ROUTINE sections

- **Fixed Structure View initialization**
  - Structure view now correctly follows cursor on startup
  - Resolved timing issue when Clarion Tools view is visible at launch

- **Fixed GROUP nesting tests**
  - Corrected test expectations for unlabeled GROUP symbols
  - Improved test coverage for nested GROUP structures

- **Fixed CASE validation**
  - CASE without OF clauses now correctly recognized as valid Clarion syntax
  - OROF without preceding OF correctly flagged as error

### 💡 Technical Details
- **Modular architecture** - Extension split into focused managers:
  - ActivationManager - Extension activation and initialization
  - ConfigurationManager - Settings and configuration
  - DocumentRefreshManager - Document state management
  - LanguageServerManager - Language server lifecycle
  - StatusBarManager - Status bar updates
  - SolutionOpener - Solution/project opening
  - QuickOpenManager - Quick open functionality
  - 15+ command modules for specific features
- **Improved testing** - Better test organization and coverage
- **Code quality** - Eliminated duplicate registrations and race conditions

---

## [0.7.3] - 2024-12-05

### ✨ Features
- **Centralized logging configuration with release mode** - Clean, minimal console output for production releases
  - Single environment variable (`VSCODE_RELEASE_MODE=true`) controls all logging
  - Development builds: error-level logging (minimal output)
  - Release builds: Use `npm run compile:release` or `npm run package:release`
  - All loggers standardized to error level for clean production output
  - Simplifies publishing workflow - no manual log level changes needed

- **Missing RETURN statement validation** - Validates procedures/methods with return types have proper RETURN statements
  - Correctly handles Clarion's declaration/implementation split
  - Return types only in declarations (CLASS/MAP/MODULE), never in implementations
  - Supports both CLASS methods and MAP procedures
  - **Properly extracts return types from any position in attribute list**
    - `PROCEDURE(),LONG,NAME('Start')` ✅
    - `PROCEDURE(),NAME('Start'),LONG` ✅
    - `PROCEDURE(),PROC,LONG,NAME('Test')` ✅
  - Flags procedures that have no RETURN statement
  - Flags procedures where all RETURN statements are empty
  - Examples:
    - CLASS: `MyClass.MyProc` declared with `, LONG` but no `RETURN value`
    - MAP: `MyProcedure PROCEDURE(),LONG` in MAP but no `RETURN value`
  - Prevents runtime errors and undefined behavior

- **Go to Implementation for single-file classes** - Navigate from CLASS method declarations to implementations
  - Now supports classes without MODULE('file') declarations
  - Works when CLASS and implementations are in the same file
  - Handles parameter matching with spaces (e.g., `PROCEDURE( ? param)` matches `PROCEDURE(? param)`)
  - Resolves "no implementation found" errors for single-file programs

- **SECTION-aware INCLUDE links** - Document links now navigate to specific SECTION blocks
  - Syntax: `INCLUDE('file.clw','SECTION NAME')` links directly to `SECTION('SECTION NAME')`
  - **Cursor positioning**: Opens file with cursor at the SECTION line (not at top)
  - **Smart hover preview**: Shows only the specified section, stops at next SECTION
  - Falls back to file start if section not found
  - Section names support spaces and special characters
  - Updated Knowledge Base with SECTION documentation

### 🐛 Bug Fixes
- **Fixed Go to Implementation for classes without MODULE** - Classes in same file as implementation now work
  - Previously required MODULE('file') declaration, causing "no implementation found" errors
  - Now handles single-file programs where CLASS and implementations are together
  - Parameter matching works correctly with spaces: `PROCEDURE( ? param)` matches `PROCEDURE(? param)`
  - Fixed moduleFile type handling (null vs undefined)

- **Fixed return type extraction in procedure declarations** - Return types now correctly detected regardless of attribute position
  - Previously only checked immediately after `PROCEDURE(),` 
  - Now scans entire attribute list for data type keywords
  - Added `extractReturnType()` utility function
  - Removed `NAME` from Type token pattern (it's an attribute, not a data type)
  - Fixed 3 failing RETURN validation tests

- **Fixed COMPILE/OMIT same-line terminator validation** - No longer shows false positive for terminators on same line
  - Example: `COMPILE('!** End **',expr) ; code !** End **` now validates correctly
  - Searches for terminator only AFTER the directive's closing paren
  - Handles both COMPILE and OMIT directives

- **Fixed Clarion Tools sidebar auto-reveal** - Follow Cursor now only works when Structure View is visible
  - Root cause: `treeView.reveal()` called by Follow Cursor was bringing sidebar into focus
  - Solution: Follow Cursor enabled by default BUT only works when Structure View pane is visible
  - Prevents sidebar from stealing focus when working in other views (Explorer, Source Control, etc.)
  - Preserves useful Follow Cursor functionality when Structure View is actually open
  - Users get best of both worlds: feature works when needed, doesn't interfere when not

### 💡 Technical Details
The file-specific behavior (ATSort_Window.clw vs ATSort_DATA.clw) was due to files with more structure (WINDOW controls) triggering more reveal() calls. Now reveal() only happens when the Structure View is visible.

---

## [0.7.3] - 2024-12-04

### 🚀 Major: Folder-Based Workflow (No Workspace Files Required)

#### Simplified Solution Management
- **Removed workspace file requirement** - Extension now works with simple folder opening
- **Folder-level settings** - All settings stored in `.vscode/settings.json` within solution folder
- **No more "Save Workspace As" prompts** - Just open folder containing solution
- **Team-friendly** - Settings can be committed to version control with solution

#### Global Solution History
- **Recent Solutions tracking** - Automatically remembers last 20 solutions opened across all folders
- **Quick access** - Solution View shows recent solutions when no folder is open
- **One-click reopening** - Click recent solution to open its folder and load it automatically
- **Smart validation** - Automatically cleans up references to deleted/moved solutions
- **Persistent across sessions** - History maintained in VS Code's global storage

#### Smart Solution Opening
- **Settings reuse** - Previously configured solutions open instantly without prompts
- **Automatic validation** - Detects when settings are stale (files moved/deleted)
- **Graceful fallback** - Auto-detection kicks in if settings invalid
- **No duplicate data** - Recent solutions reference existing folder settings, no duplication

#### Enhanced Solution View
- **Recent Solutions section** - Shows when no folder open with last opened timestamp
- **Folder context** - Each solution shows which folder it belongs to
- **Clean UI** - Separator between recent solutions and action buttons
- **Multiple options** - Open Folder, Browse for Solution, or pick from recent

### 🐛 Bug Fixes
- **Fixed build error diagnostics** - Errors now properly link to source files with correct line/column numbers instead of pointing to BuildOutput.log (fixes #20)
- **Fixed global solution history** - Manually opened solutions (via "Browse for Solution") now correctly appear in recent solutions list
- **Fixed infinite scrollbar** - Solution/Structure views no longer show constant progress indicator when no folder open
- **Fixed activation blocking** - Removed popup dialog that blocked extension activation
- **Concurrency control** - Prevented multiple simultaneous solution detection calls
- **Cache management** - 5-second cache with early returns for "no folder" state

### 🔧 Technical Improvements
- **Terminology consistency** - Changed all "workspace" references to "folder" throughout
- **Configuration target** - `getClarionConfigTarget()` helper ensures proper settings scope
- **Non-blocking activation** - Extension continues loading even when showing dialogs
- **Proper logging** - Added comprehensive logging for global solution history operations

### 📝 Code Quality
- **New utility class** - `GlobalSolutionHistory` manages cross-folder solution references
- **Cleaned up** - Removed ~85 lines of workspace file creation code
- **Removed dead code** - Deleted unused `WelcomeViewProvider.ts` (~157 lines) that was obsoleted by new folder-based workflow
- **Type safety** - `SolutionReference` interface for strongly-typed history entries
- **Error handling** - Graceful handling of missing files/folders in history

---

## [0.7.1] - 2025-12-03

### ⚠️ Documentation Update
**Note**: Version 0.7.1 was initially released with incomplete documentation. This update corrects the changelog to reflect all changes that were actually included in the 0.7.1 release.

### 🔧 ClarionCl.exe Integration (APP Generation)
- **Generate Applications**: Right-click context menu commands to generate Clarion applications
  - **Generate All Applications**: Right-click on Applications node to generate all APPs in solution
  - **Generate Application**: Right-click on individual app to generate single APP
  - Uses `ClarionCl.exe /win /ag` command with proper working directory
  - Streams output to dedicated "Clarion Generator" output channel
  - Shows success/error notifications on completion
  - Automatically resolves ClarionCl.exe path from solution's Clarion BIN directory

### 🌳 Solution Tree Improvements
- **Binary File Prevention**: Clicking on .APP files in tree no longer attempts to open them as text
  - APP nodes now use `TreeItemCollapsibleState.None` without resourceUri
  - Prevents VS Code from loading binary files in editor tabs
  - Cleaner user experience when navigating solution structure

### 🔍 Enhanced Solution Manager
- **Clarion Directory Detection**: Solution manager now provides Clarion BIN path
  - Extracts Clarion directory from .sln file configuration
  - Makes path available to all extension features
  - Enables reliable ClarionCl.exe execution

### 🐛 Bug Fixes
- **CASE Statement Validation**: Fixed validation to allow CASE statements with zero OF clauses
  - Previously incorrectly flagged valid empty CASE statements as errors
  - Now properly validates: `CASE TRUE` followed by `END` is valid Clarion syntax

### 📈 Performance & Quality (from November 2024)
The following improvements were included in 0.7.1 but not documented in the initial release:

- **Test Coverage**: 185 total tests, all passing (zero regressions)

#### Improved Structure View
- **FILE Hierarchy**: Shows KEY/INDEX as children, RECORD as container, MEMO/BLOB distinguished
- **VIEW Hierarchy**: Displays nested JOIN relationships and PROJECT fields
- **GROUP Attributes**: Shows OVER (memory overlay) and DIM (array dimensions)

#### New Keywords
- **CHOOSE**: Function now properly recognized in tokenizer

### 📊 Statistics
- **30,466 lines** added (code + documentation)
- **868 lines** removed
- **93 files** modified
- **Zero regressions** (185 tests passing)
- **80% feature completion** (8/10 planned items)

### 📚 Documentation
- Added `AUDIT_2024-12-02.md` - Implementation audit
- Added `SESSION_2024-12-02_KB_IMPROVEMENTS.md` - Detailed session summary
- Added `CHANGELOG-0.7.1.md` - Comprehensive changelog
- Added `docs/clarion-knowledge-base.md` - Language reference (~2,000 lines)

### 🎯 Implementation Status
- ✅ All high priority items complete (3/3)
- ✅ All medium priority items complete (3/3)
- ✅ Most low priority items complete (2/4)
- ⚠️ CLASS/INTERFACE validation - infrastructure only (requires symbol table)
- ❌ IntelliSense enhancements - deferred (requires completion provider)

**See [CHANGELOG-0.7.1.md](./CHANGELOG-0.7.1.md) for comprehensive details.**

---

## [Unreleased]

### Added - 2025-11-30

#### Clarion Language Knowledge Base
- **New Documentation**: Created comprehensive `docs/clarion-knowledge-base.md` documenting Clarion language syntax and rules
  - Column 0 rules: Labels must be at column 0, keywords (MAP, END, PROGRAM, MEMBER) must NOT be at column 0
  - Structure termination: END vs dot (.) terminators, when each is required
  - PROGRAM/MEMBER requirements: Must be first statement (line 1), no comments before
  - Data scope: PROGRAM (global), MEMBER (module), PROCEDURE (local), ROUTINE (routine local)
  - IF/ELSIF/ELSE: Only IF requires END/., ELSIF and ELSE do not
  - LOOP termination: Can be terminated with END/., UNTIL, or WHILE
  - MODULE context: In MAP requires END, in CLASS does not
  - PROCEDURE/METHOD: No END statement, terminated by next procedure/routine/EOF
  - ROUTINE: Optional DATA/CODE sections, implicit EXIT at end
  - THEN keyword: Always followed by statement (same line or next line)
  - Case insensitivity: Clarion is mostly case-insensitive
  - ANSI/ASCII only: No Unicode characters allowed in source files

#### Structure Termination Diagnostics
- **New Feature**: Real-time validation of unterminated structures
  - Detects IF statements not terminated with END or dot (.)
  - Detects LOOP statements not terminated with END, dot (.), UNTIL, or WHILE
  - Detects CLASS statements not terminated with END or dot (.)
  - Context-aware: Understands inline dot terminators (e.g., `IF x THEN y.`)
  - Scope-aware: Tracks nested structures correctly
  - Works with all Clarion file types (.clw, .inc, etc.)

#### Enhanced Tokenizer
- **Improved Dot Detection**: Tokenizer now properly identifies inline dot terminators
  - Detects dots that appear on same line as structure keywords
  - Distinguishes between statement separators (;) and structure terminators (.)
  - Supports both `END` and `.` as equivalent terminators

#### Structure View Enhancements
- **Follow Cursor Feature (WIP)**: Structure view can now track cursor position
  - Toggle command: `clarion.structureView.toggleFollowCursor`
  - Menu item in structure view title bar
  - Debounced selection tracking (100ms) for performance
  - **Known Limitation**: Tree reveal for nested items (functions under MAP/MODULE) not yet working
  - Checkmark indicator in menu needs fixing

#### Test Suite Enhancements
- **Created Test Files**: `docs/clarion-tests/test_clarion_syntax.clw` and `test_clarion_syntax_fixed.clw`
  - Tests for dot terminator syntax
  - Tests for IF/ELSIF/ELSE structures
  - Tests for LOOP variations (count TIMES, TO/BY, UNTIL, WHILE)
  - Tests for nested structures
  - Tests for column 0 rules
  - All test files compile successfully with Clarion compiler
- **Unit Tests**: `server/src/test/diagnostics/structureTermination.test.ts`
  - 13 test cases covering all structure types
  - Tests for inline dot terminators

#### Structure View Improvements
- **Cursor Synchronization**: Added "Follow Cursor" toggle command
  - Right-click menu option in Structure View
  - Successfully tracks cursor position and identifies current symbol
  - **Known Limitation**: Cannot reveal deeply nested items in collapsed tree nodes
  - Works perfectly for top-level symbols
  - Feature enabled by default
  - Tests for nested structures
  - Tests for MODULE context-awareness
  - All tests passing

#### Structure View Improvements
- **Cursor Sync**: Structure view now highlights current symbol as cursor moves through code
  - Matches VS Code's built-in Outline view behavior
  - Automatically selects the symbol containing the cursor
  - Improves code navigation and awareness

### Fixed - 2025-11-30

#### Folding Provider
- **Fixed Dot Terminator Folding**: Folding provider now correctly handles inline dot terminators
  - Single-line structures (e.g., `IF x THEN y.`) no longer create invalid fold ranges
  - Multi-line structures with dot terminators fold correctly
  - Prevents fold range corruption that broke subsequent folds

#### Knowledge Base Corrections
- **Fixed Column 0 Rules**: Corrected documentation about what must/must not be at column 0
- **Fixed END Rules**: Clarified that only structures require END, procedures/methods do not
- **Fixed MODULE Rules**: Documented context-dependent MODULE termination rules

### Developer Notes - 2025-11-30

#### Test-Driven Development
- Followed TDD approach: wrote tests first, then implemented features until tests passed
- Knowledge base serves as reference for both AI and developers
- All syntax rules validated against real Clarion compiler

#### Repository Organization
- Moved test files to `docs/clarion-tests/` directory
- Knowledge base in `docs/clarion-knowledge-base.md`
- Feature analysis in `docs/clarion-tests/structure-termination-diagnostics.md`

---

## [0.7.1] - 2025-11-24

### Major Enhancements

#### Code Refactoring and Architecture Improvements

**Significant internal refactoring to improve code maintainability and reduce duplication.**

- **New Shared Utilities**: Created reusable utility classes for common operations
  - `ClassMemberResolver`: Handles class member lookup with method overload resolution
  - `TokenHelper`: Provides scope navigation and word extraction utilities
  - Both HoverProvider and DefinitionProvider now use these shared utilities
  - Eliminated ~500+ lines of duplicate code

#### Method Overload Resolution

**Full support for Clarion method overloading with parameter counting.**

- **Smart overload detection**: Extension now correctly identifies which method overload to use
  - Counts parameters in method calls
  - Matches against method declarations
  - Selects best overload based on parameter count
  - Prefers methods with optional parameters when counts are close
  
- **Works in both Hover and Go to Definition**:
  - Hover shows the correct overload signature
  - F12 (Go to Definition) navigates to the correct overload
  - Ctrl+F12 (Go to Implementation) works with overloaded methods

**Example:**
```clarion
! Class has multiple SaveFile methods
SaveFile PROCEDURE(string fileName, bool append), long
SaveFile PROCEDURE(*string data, string fileName, bool append, long len=0), long

Code
  self.SaveFile('test.txt', true)           ! 2 params - uses first overload
  self.SaveFile(myData, 'test.txt', true)   ! 3 params - uses second overload (has optional 4th)
```

#### Performance Improvements

**Dramatically improved performance by disabling excessive debug logging.**

- **Reduced logging overhead**: Changed default log levels from "debug" to "error" for most components
  - HoverProvider: info → error (reduces log spam)
  - DefinitionProvider: info → error
  - Only performance metrics remain visible
  
- **Measurable impact**: 
  - Document symbol generation: ~100-150ms (was slower with excessive logging)
  - Extension no longer locks up VS Code on large files
  - Smoother editing experience

#### Bug Fixes

- **Fixed Goto Definition URI conversion**: F12 now correctly opens files from INCLUDE statements
  - Properly converts Windows paths to file:// URIs
  - Works correctly with drive letters
  
- **Fixed word extraction for dot notation**: Hover now works correctly when `getWordRangeAtPosition` returns full dotted names
  - Properly extracts field name from "self.Method" format
  - Maintains compatibility with improved TokenHelper

- **Fixed hover duplication**: Server-side hover now properly defers to client-side for method calls
  - Eliminated duplicate hover information
  - Shows only relevant information (declaration + implementation hint)

#### PREFIX and Structure Field Access Improvements

**Significant improvements to how Clarion PREFIX declarations are handled.**

This release includes major fixes for Go to Definition and Hover functionality when working with GROUP structures that use PREFIX:

- **Full PREFIX support**: Correctly handles all three ways to access prefixed structure fields:
  - Direct prefix notation: `LOC:MyVar`
  - Dot notation: `MyGroup.MyVar`
  - Bare field name: `MyVar` (when unambiguous)
  
- **Smart validation**: Extension now validates that structure fields are accessed correctly
  - Prevents incorrect "bare name" access when prefix is required
  - Understands when bare names are valid (e.g., within structure definition)
  
- **Improved Go to Definition**: Jump to definition now works correctly for all PREFIX scenarios
  - `LOC:MyVar` navigates to the field declaration
  - `MyGroup.MyVar` navigates to the field declaration
  - Proper scoping prevents false matches

- **Enhanced Hover**: Hover information correctly identifies prefixed fields
  - Shows all valid ways to reference the field
  - Displays full type information with GROUP context

**Example:**
```clarion
MyGroup  GROUP,PRE(LOC)
MyVar      STRING(100)
         END

Code
  LOC:MyVar = 'Works!'        ! Direct prefix
  MyGroup.MyVar = 'Works!'    ! Dot notation
  MyVar = 'Also works!'       ! Bare name (less common)
```

#### Tokenization Improvements

- **New DataTypeParameter token type**: Better parsing of parameterized types like `STRING(100)`, `CSTRING(255)`
- **Improved STRING/CSTRING handling**: More accurate tokenization of string types with size parameters
- **Symbol display fix**: Symbol outline now shows clean format like "MyVar STRING(100)" instead of duplicated labels

### Build Output Configuration

**New configurable settings for build output visibility and log file handling.**

This release adds new configuration options that give developers more control over how build output is displayed and managed:

#### New Settings:
- **Build Output Visibility**: Control when the build terminal is shown
  - Never show (default)
  - Always show
  - Only show on build errors
  
- **Log File Preservation**: Option to keep the build_output.log file after builds
  - Automatically deleted (default)
  - Preserved for inspection
  
- **Custom Log File Path**: Specify a custom location for build log files
  
- **Output Panel Integration**: Option to show build output in the Output panel
  - Problems panel only (default)
  - Both Problems and Output panels

#### Benefits:
- Better debugging of build issues
- More flexibility for different development workflows
- Improved visibility into the build process when needed

For detailed documentation on these settings, see [Build Settings Documentation](docs/BuildSettings.md)

### Telemetry and Performance

**Optional telemetry to help improve the extension.**

- **Application Insights integration**: Anonymous usage and performance data collection (opt-in)
- **Performance tracking**: Monitor document parsing and symbol processing times
- **Privacy-focused**: No personal information collected, fully respects VS Code's telemetry settings
- **Disabled by default**: Respects `telemetry.telemetryLevel` setting

The telemetry helps identify performance bottlenecks and improve the extension for large Clarion codebases.

---

## [0.7.0] - 2025-11-19

**🕯️ Dedicated to the memory of Brahn Partridge (4th January 1977 – 29th October 2021)**

This release integrates the language features from Brahn's fushnisoft.clarion extension, ensuring his work continues to serve the Clarion community and can be maintained going forward.

### Major Changes

#### Integrated Fushnisoft Language Support
- **Complete syntax highlighting**: All Clarion file types (.clw, .inc, .equ, .int, .txa, .txd, .tpl, .tpw) now have built-in syntax highlighting
- **Language configuration**: Bracket matching, auto-closing pairs, and comment support integrated
- **No external dependencies**: Extension is now fully self-contained
- **Removed dependency**: No longer requires fushnisoft.clarion extension
- **Migration assistance**: Automatic detection and optional uninstallation of fushnisoft.clarion

#### Why This Change?
Following Brahn Partridge's passing in October 2021, the fushnisoft.clarion extension could no longer receive updates. By integrating his excellent work into Clarion Extensions:
- His legacy continues to serve the community
- Language support can evolve with VS Code updates
- Installation is simplified (one extension instead of two)
- Full attribution is maintained for his contributions

### Technical Details
- Added `syntaxes/clarion.tmLanguage.json` (TextMate grammar from Fushnisoft)
- Added `syntaxes/clarion.configuration.json` (language configuration from Fushnisoft)
- Registered all Clarion file extensions with VS Code
- Updated LICENSE to include Fushnisoft MIT license attribution
- Smart migration: detects fushnisoft.clarion and offers automatic uninstallation

### Upgrading
- **Fresh install**: Just install Clarion Extensions v0.7.0
- **Existing users with fushnisoft.clarion**: 
  - Extension will detect and offer to uninstall fushnisoft.clarion
  - All features continue to work seamlessly
  - You can keep both if preferred (no conflicts)

### Acknowledgments
Special thanks to Brahn Partridge (Fushnisoft) for creating the original Clarion language support that has served the community since 2015. Your work lives on. Rest in peace, friend.

---

