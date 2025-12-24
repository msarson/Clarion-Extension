# Change Log

All notable changes to the "clarion-extension" extension will be documented in this file.

This changelog contains versions **0.7.0 and newer**. For older releases (0.6.x and earlier), see [docs/archive/CHANGELOG-HISTORICAL.md](docs/archive/CHANGELOG-HISTORICAL.md).

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
  - Demo file: `demo-paste-as-string.clw`
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

