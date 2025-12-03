# Change Log
All notable changes to the "clarion-extension" extension will be documented in this file.

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

## [0.6.5] - 2025-11-19

**Note:** This release is functionally identical to v0.6.4. Due to a VS Code Marketplace publishing inconsistency where v0.6.4 was accepted but not properly indexed, we republished as v0.6.5 to ensure users receive the update.

### What's in This Release
All features and fixes from v0.6.4 (see below).

---

## [0.6.4] - 2025-11-19

### Enhancements

#### Extension Status View Improvements
- **Dynamic refresh**: Status view now updates automatically when:
  - Solution is opened or closed
  - Workspace folders change
  - Workspace trust is granted
- **At-a-glance status**: View title shows issue count (e.g., "Extension Status (1 ❌, 2 ⚠️)")
- **Contextual tips**: Tips section only shows when there's an issue to address
  - No workspace? Shows workspace-related tips
  - Untrusted? Shows trust-related tips
  - No solution? Shows solution-related tips
  - Everything working? No tips section shown (clean view)
- **Default collapsed**: View starts collapsed to reduce clutter
- **Smart indicators**: Title shows ✅ when all features working

### Bug Fixes

#### Critical: Fixed Extension Activation Failure
- **Issue**: Extension failed to activate with "Cannot find module 'glob'" error
- **Root cause**: `glob` was in both devDependencies and dependencies, but vsce excludes devDependencies
- **Resolution**: Removed glob from devDependencies, kept only in dependencies
- **Impact**: Extension now activates properly in production environments

#### Fixed Code Folding for Single-Line Structures
- **Issue**: Single-line structure declarations (e.g., `GROUP(DateTimeType).` or `GROUP;END`) were creating fold ranges, causing subsequent folds to break
- **Resolution**: Detect when structure terminator (`.` or `END`) is on same line and skip fold creation
- **Impact**: Code folding now works correctly throughout the file

#### Improved .vscodeignore
- **Issue**: client/package.json and server/package.json were excluded, potentially causing dependency issues
- **Resolution**: Include package.json files that define runtime dependencies
- **Impact**: Extension packaging now includes all necessary dependency metadata

### Security

#### Dependency Updates
- **Merged Dependabot PR**: Updated brace-expansion from 1.1.11 to 1.1.12
- **Fix**: Addressed ReDoS (Regular Expression Denial of Service) vulnerability

## [0.6.2] - 2025-01-19

### Enhancements

#### New: Extension Status View
- **Added diagnostic status view** showing what features are enabled/disabled
- **Real-time status monitoring**:
  - Language Server status
  - Document Symbols availability
  - Code Folding status
  - Workspace and trust status
  - Solution status
  - Cross-file navigation capabilities
  - Build tasks availability
- **Actionable buttons** for common tasks (Save Workspace, Open Solution, Manage Trust)
- **Helpful tips** to guide users toward full functionality
- **Solves the "why isn't X working?" problem** - users can now see exactly what's enabled and why

#### Auto-Create Workspace on Solution Open
- **Smooth onboarding**: Opening a solution without a workspace now offers to create one automatically
- **Smart defaults**: Workspace file created in solution folder with solution name
- **User control**: Option to choose different location for workspace file
- **Pre-configured**: Workspace automatically includes solution file setting
- **Eliminates confusion**: No more "this feature requires a workspace" dead-ends

### Bug Fixes

#### Critical: Fix Sidebar Icon and Views Not Showing Without Workspace
- **Issue**: Clarion sidebar icon disappeared when no workspace was open
- **Root cause**: View creation (Solution View and Structure View) was only happening when workspace existed
- **Resolution**: Views are now always created regardless of workspace status
- **Impact**: 
  - Sidebar icon now always visible
  - Solution View shows "Open Solution" button when no solution is open
  - Structure View works immediately without workspace (shows document outline)
  - Better user experience and discoverability of extension features

## [0.6.1] - 2025-01-19

### Enhancements

#### Enable Basic Features Without Workspace
- **Major improvement**: Language server and basic features now work without a saved workspace
- **Features that work without workspace**:
  - Document symbols (outline view)
  - Code folding ranges
  - Syntax highlighting
  - Hover information (within same file)
  - Go to definition (within same file and current folder)
  - Document formatting
- **Smart notifications**: One-time, non-intrusive message when opening files without workspace
  - Option to save workspace immediately
  - "Don't Show Again" option to prevent repeated notifications
- **Graceful degradation**: Advanced features (solution management, cross-file navigation with redirection) require workspace
- **Better UX**: Clear messages explaining which features need workspace, with guidance on how to enable them
- **Rationale**: Developers can now quickly view and edit Clarion files without workspace setup, while full functionality remains available when needed

## [0.6.0] - 2025-01-19

### Bug Fixes

#### Critical: Fixed Folding and Symbol Providers Not Working in Released Version
- **Root cause identified**: Duplicate `onInitialize` and `onInitialized` event handlers in server.ts were causing the second handler to overwrite the first
- **Impact**: In packaged extensions, the duplicate handlers prevented folding ranges and document symbols from working correctly
- **Resolution**: Removed duplicate handlers (lines 1033-1119), consolidated functionality into the primary handlers (lines 89-172)
- **Verification**: Folding and symbol providers now work correctly in both development and released versions
- **Note**: These features work without requiring a Clarion solution to be selected

## [0.5.9] - 2025-11-18

### Enhancements

#### Improved Method Hover Display
- **Enhanced hover content**: Method implementation hovers now show up to 15 lines of actual implementation code after the CODE statement (previously stopped at CODE)
- **Smart boundary detection**: Automatically stops before nested method/routine implementations within the 15-line preview
- **Interactive navigation**: Added clickable line number link in hover to jump directly to method implementation
- **Keyboard shortcut hint**: Hover displays "Click or press Ctrl+F12 to navigate" to guide users
- **Better developer experience**: Aligns hover behavior with standard IDE practices (VS Code, Visual Studio, IntelliJ) by showing actual implementation preview
- **Method call hover support**: Hovers now work for method calls within implementations (e.g., hovering over `self.SetLength(...)` shows the SetLength implementation)
  - Intelligently matches methods by parameter count
  - Works seamlessly with Ctrl+F12 navigation
  - Provides context without being intrusive
  - **Improved precision**: Method hover only triggers when cursor is on the method name itself, not on parameters

#### Routine Navigation (DO Statements)
- **Navigate to Routine**: Complete navigation support for routines referenced in DO statements
  - **Hover preview**: Hover over routine references in DO statements to see code preview
  - **Go to Implementation**: Ctrl+F12 or click hover link to jump to routine implementation
  - **Clickable navigation**: Hover includes clickable link to navigate directly to routine
  - **Scope-aware**: Prioritizes routines within the current procedure scope
  - Shows up to 10 lines of code preview starting from the routine

#### Local Variable and Parameter Navigation
- **Go to Definition (F12)**: Navigate from variable/parameter usage to declaration
  - Works for procedure/method local variables (declared between PROCEDURE and CODE)
  - Works for routine local variables (declared in ROUTINE DATA sections)
  - Works for procedure and method parameters
  - Supports parameters with default values (e.g., `pForce=false`)
  - Supports reference variables (e.g., `&string`)
  - Scope-aware: finds variables within current procedure/method/routine
- **Hover Information**: Rich hover tooltips for variables and parameters
  - Shows variable/parameter name and type
  - Displays declaration location (procedure/routine name and line number)
  - Distinguishes between "Parameter", "Local Variable", and "Local Routine Variable"
  - Includes "Press F12 to go to declaration" hint

#### Class Member Navigation
- **Go to Definition (F12)**: Navigate from class member access to definition
  - Works for `self.property` and `self.method` references in class implementations
  - Works for typed variables (e.g., `otherValue.value` where `otherValue` is `StringTheory`)
  - **Navigate from implementation to declaration**: F12 on method implementation line (e.g., `StringTheory.Construct PROCEDURE()`) jumps to CLASS declaration
  - Automatically searches INCLUDE files for class definitions
  - Uses solution-wide redirection system to resolve INCLUDE files
  - Handles both properties and methods
- **Hover Information**: Rich hover tooltips for class members
  - Shows whether it's a Property or Method
  - Displays full type declaration including attributes (PRIVATE, name(), etc.)
  - Shows class name
  - Displays declaring file name and line number
  - Long type declarations shown in code block for better readability
  - **Method implementation hover**: Hovering on method implementation line shows the declaration signature with return type
  - F12 navigation hint included
  
### Technical Improvements
- **Server-side definition provider**: Enabled language server definition provider capability
- **Server-side hover provider**: Added server-side hover provider for variables, parameters, and class members
- **Client-side provider coordination**: Client-side providers properly defer to server for symbols they don't handle
- **Enhanced scope detection**: Improved scope detection to recognize all procedure types (GlobalProcedure, MethodImplementation, MethodDeclaration)
- **INCLUDE file resolution**: Enhanced to work without requiring files to be in project, uses solution-wide redirection
- **URI decoding**: Proper handling of URL-encoded file paths

This enhancement provides developers with meaningful context at a glance and enables quick navigation through code.

## [0.5.8] - 2025-11-17

### Performance Improvements

This release significantly improves performance for large Clarion files through systematic optimization.

Special thanks to GitHub Copilot for the collaborative coding session that identified and resolved the performance bottlenecks.

#### Tokenization Performance (10x faster)
- **Before**: 5,800ms for large files (14k lines, 532k chars)
- **After**: 598ms
- **Improvements**:
  - Pre-compiled regex patterns (eliminated runtime compilation overhead)
  - Character-class pre-filtering (skip patterns that can't match based on first character)
  - Pattern ordering optimization (common patterns checked first)
  - Reduced logging overhead (errors only, performance metrics always visible)
  - Line-based incremental caching (95%+ speedup on edits - only re-tokenize changed lines)

#### Symbol Generation Performance (55x faster)
- **Before**: 6,000ms per call (×5 calls = 30 seconds total)
- **After**: 110ms per call (×4 calls = 440ms total)
- **Root Cause**: O(n²) algorithm checking excessive token combinations
- **Solution**: Built tokensByLine index for O(1) lookups
- **Fixed**:
  - `checkAndPopCompletedStructures()` - eliminated full token array scan on every line change
  - `getTokenRange()` - eliminated `tokens.find()` and `tokens.reverse().find()` calls
  - `handleStructureToken()` - eliminated `tokens.filter()` in MODULE processing

#### Folding Provider Performance (60% faster)
- **Before**: 6-7ms
- **After**: 3-4ms
- **Improvements**:
  - Single-pass filtering (collect foldable items and region comments in one loop)
  - Pre-filtered region processing (process ~50-100 comments vs 56k tokens)

#### Structure View Performance
- **Before**: 20+ seconds for "Expand All" on large files
- **After**: <1 second
- **Improvements**:
  - Changed from recursive full-tree expansion to top-level only
  - Parallel expansion using Promise.all()
  - Reduced artificial delays (100ms → 10ms)

#### User Experience Improvements
- **Fixed**: Duplicate warning spam (24+ identical warnings reduced to 1)
- **Enhanced**: Better error messages (e.g., "Language client not initialized" explains it's normal during startup)
- **Added**: Comprehensive performance logging (search for `📊 PERF:` to see timings)

#### Technical Details
Performance bottlenecks identified and resolved:
1. **Tokenizer O(n²)** → O(n) with character-class pre-filtering
2. **Symbol provider O(n²)** → O(n) with line-indexed lookups
3. **Structure view recursive expansion** → Top-level parallel expansion
4. **Logging overhead** → Error-level only (PERF metrics bypass level check)
5. **Folding dual-pass** → Single-pass filtering

#### Credits
This performance work was completed in collaboration with GitHub Copilot on November 17, 2025.

### Results Summary
| Component | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Tokenization | 5,800ms | 598ms | 90% faster (10x) |
| Symbol Generation | 6,000ms | 110ms | 98% faster (55x) |
| Folding Ranges | 10ms | 4ms | 60% faster |
| Structure View Expansion | 20+ sec | <1 sec | 95%+ faster |
| **Total Startup Time** | **35+ sec** | **<1 sec** | **97% faster (35x)** |

Large Clarion files (14k+ lines) now have significantly improved response times.

## [0.5.7] - 2025-08-29

### Enhancements
- **Keyboard Shortcut for Go to Implementation**: Added Ctrl+F12 shortcut for "Go to Implementation" command, matching Visual Studio/VS Code defaults.
- **Simplified Navigation**: Removed redundant Ctrl+F12 shortcut for "Follow Link" as this functionality is already available via Ctrl+click.

## [0.5.6] - 2025-04-04

### Enhancements
- **Unified Highlighting System**: Added a comprehensive highlighting system for Clarion code elements with a unified configuration structure.
  
  To use this feature:
  1. Configure highlighting options in your settings.json:
     ```json
     "clarion.highlighting": {
       // Enable/disable all highlighting features
       "enabled": true,
       
       // Variable prefix highlighting settings
       "prefix": {
         
         // Define prefixes with simple colors or advanced styling
         "patterns": {
           // Simple color
           "LOCS": "#ffffcc",
           
           // Advanced styling
           "GLOS": {
             "color": "#ccffff",
             "fontWeight": "bold",
             "backgroundColor": "#f0f0f0",
             "before": {
               "contentText": "→",
               "color": "#888888"
             }
           }
         }
       },
       "comment": {
         
         // Define comment patterns with simple colors or advanced styling
         "patterns": {
           // Simple color
           "TODO": "#ff8c00",
           
           // Advanced styling
           "FIXME": {
             "color": "#ff0000",
             "fontWeight": "bold",
             "backgroundColor": "#fff0f0",
             "before": {
               "contentText": "⚠️ ",
               "color": "#ff0000"
             },
             "after": {
               "contentText": " ⚠️",
               "color": "#ff0000"
             }
           }
         }
       }
     }
     ```
     
  2. Use VS Code's built-in color picker by clicking on the color values in the settings UI
  
  3. Optionally disable all highlighting with: `"clarion.highlighting.enabled": false`
  
  The extension will automatically apply the selected styles to variables with matching prefixes in your code, and any comment line starting with `!` followed by one of your defined patterns (with or without a space) will be highlighted.

## [0.5.5] - 2025-04-04

### Enhancements
- **Improved Symbol Provider**: Major updates to the symbol provider for better code navigation and structure representation.
- **View Filtering**: Added filtering capabilities to Solution View and Structure View for easier navigation in large projects.
- **File Management**: Added option to add or remove CLW files to/from projects.
- **Features Documentation**: Added comprehensive [ClarionExtensionFeatures.md](https://github.com/msarson/Clarion-Extension/blob/master/ClarionExtensionFeatures.md) document providing a detailed overview of all extension features and their implementation.

### Bug Fixes
- **Symbol Placement**: Fixed issues with symbols not being placed correctly in the document outline.
- **Label Formatting**: Fixed issues with labels not adding spaces between parameters.
- **Procedure Labels**: Resolved issues with procedure labels in methods.
- **Import Locations**: Fixed textdocument coming from new import location.
- **File Redirection**: Refactored file locations to use redirection as the default approach.

## [0.5.4] - 2025-04-02

### Bug Fix
- **Missing Packaged Files**: Fixed an issue where critical files were excluded due to an incorrect setting in `.vscodeignore`, causing required modules not to be bundled with the extension.

### New
- **Clarion Tools View**: A new sidebar view titled **Clarion Tools** is now available in the Activity Bar for quick access to solutions and features.
- **Welcome Screen**: Improved user experience with a welcome screen for opening or reopening Clarion solutions.
- **Multi-Solution Support**: Workspaces can now contain **multiple Clarion solutions**.

### Fixes
- **Build Actions**: Fixed issues where **Build Solution** and **Build Project** could fail unexpectedly.
- **Problem Panel Integration**: Compilation problems are now correctly displayed in the **Problems panel**.
- **Solution Closing**: You can now close solutions from the Solution View.

## [0.5.3] - 2025-03-29

### BUG
- **V0.5.2 was not working when shipped**: Updated .vscodeignore as it was not publishing packages required for extension

## [0.5.2] - 2025-03-28

### Added
- **COLOR Keyword Enhancement**: Added color patch visualization and color picker for COLOR keywords.
- **Solution Parsing Refactoring**: Moved client-side solution parsing to the language server side for improved performance and reliability.
- **Quick Open Improvements**: Enhanced Ctrl+P quick open functionality for better file navigation.

## [0.5.1] - 2025-03-27

### Bug Fixes and Feature Improvements
- **Fixed folding behavior**: Resolved an issue where `MODULE` was incorrectly detected as a foldable region within class definitions.
- **Enhanced symbol provider**: Major improvements to the Outline view, with better symbol organization and handling for various Clarion structures.


## [0.5.0] - 2025-03-18  

### Added  
- **Complete re-write of redirection handling** for better solution and project parsing.  
- **Status Bar Configuration Switching**: Users can now change build configurations (`Release`, `Debug`, etc.) directly from the VS Code status bar.  
- **Solution Explorer View Enhancements**: Projects are now properly structured under solutions.  
- **Context Menu for Compilation**: Right-click to compile solutions/projects.  
- **Build via `Ctrl+Shift+B`**: If multiple projects exist, users will be prompted to choose.  
- **New Document Formatter (`Shift+Alt+F`)** for source code formatting.  
- **Token Caching** to improve performance.  
- **Updated Folding Provider** with better structure handling.  
- **Improved Symbol Provider** (though more work is needed, contributions welcome!).  

### Changed  
- **Updated Symbol Provider**: Improvements made, but still requires additional work.  
- **Folding Provider is more stable**: Should handle complex code better.  
- **Refactored several internal components** for better performance and maintainability.  

### Fixed  
- **General stability fixes** across the extension.  
- **Redirection handling now properly resolves included files**.  
- **Improved handling of `INCLUDE` and `MODULE` statements** in solution parsing.  

### Community & Contribution  
- **This project is actively looking for contributors!** If you use the extension and would like to help, check out the GitHub repo: [Clarion Extension Issues](https://github.com/msarson/Clarion-Extension/issues)  

---

## [0.4.11]  
- **Language Server Enabled**  
  - The server component of the Language Server Protocol (LSP) is now turned on.  
  - **Document outlining** and **breadcrumbs** should now work properly.  
  - Improved **navigation** within large Clarion files.  

- **Experimental Code Folding Introduced**  
  - A **Clarion tokenizer** has been built to break down Clarion code into meaningful components.  
  - This tokenizer will enable future features such as **code formatting, syntax-aware auto-completion, and improved diagnostics**.  
  - Folding provider now supports **natural folding for inline conditionals and single-line procedures**.  

- **Bug Fixes and Improvements**  
  - Enhanced **solution parsing**.  
  - Improved redirection file support.  
  - Stability improvements for larger projects.  

---

## [0.3.5]  
### Fixes  
- Bug introduced where the commands couldn't be found.  

## [0.3.4]  
### Fixes  
- Activation could try to take place even if workspace not trusted.  

### Optimizations  
- Only parse RED entries for CLW, INC, and EQU files.  

## [0.3.3] - 26 August 2023  

### Fixes  
- The redirection parsing could fail on local files.  

### New Features  
#### Go To Definition for Included Files  
- The "clarion-extension" now includes an advanced feature that enhances the "Go To Definition" functionality for `INCLUDE` and `MODULE` statements.  
- The extension intelligently handles these statements and provides a more informative experience by allowing users to **Ctrl+Click** or **Ctrl+F12** to open linked files.  
- Improved hover support, showing previews of file contents.  

---

## [0.3.0] - 24 August 2023  

### Added  
- Enhanced "Go To Definition" functionality for included files (`INCLUDE('FileName.clw')` or class `MODULE('FileName.clw')`).  
- Workspace settings and commands:  
  - **Command: Clarion Configure ClarionProperties.xml File**  
    Use this command to configure the `ClarionProperties.xml` file for your workspace.  
  - **Command: Clarion Select Application Solution File**  
    This command assists in selecting your application's solution file.  

### Changed  
- Updated documentation and README with detailed usage instructions for the new features.  

### Fixed  
- Various fixes based on GitHub Dependabot updates.  

### Acknowledgments  
- Added acknowledgment of the contribution of **Brahn Partridge**, who passed away in October 2021.  

---

## [0.2.5] - 13 September 2021  
- Thanks to the kind contribution of **Allen Zhu**, who has provided a document outline addition (Ctrl+Shift+O).  

## [0.2.2] - 12 May 2021  
- Updated to latest packages based on GitHub security advisories.  

## [0.2.1]  
- Security update detected by GitHub dependabot.  

## [0.2.0]  
- Added programmatic code folding.  

## [0.1.2]  
- Added extension dependencies on "fushnisoft.clarion".  

## [0.1.1]  
- Fixes to documentation.  
- Fixes to Procedure Reference Vars.  

## [0.1.0]  
- Large refactor of code.  
- Added Procedure Reference Variables.  
- New Definitions for Classes, Procedures, and more.  
- Added MS Build task snippet to compile code from within VS Code.  

---

## [0.0.3]  
- Fixed README.md  

## [0.0.2]  
- Corrected ICON Issue  

## [0.0.1]  
- Initial release, including a few snippets to get started.  

---

🔗 **For bug reports and feedback, visit:** 👉 **[GitHub Issues](https://github.com/msarson/Clarion-Extension/issues)**