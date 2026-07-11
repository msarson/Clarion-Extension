**# Clarion Extension**

## Table of Contents

- [Overview](#overview)
- [Dedication](#dedication---version-070)
- [Features](#features)
- [Installation](#installation)
- [Marketplace](#marketplace-information)
- [Changelog](#changelog-whats-new-in-v073)
- [Getting Started](#getting-started)
- [Troubleshooting](#troubleshooting)
- [Contributing and Feedback](#contributing-and-feedback)
- [Acknowledgments](#acknowledgments)
- [Additional Resources](#additional-resources)
- [Features Documentation](#features-documentation)

---

## Overview

Welcome to the **Clarion Extension** for VS Code! This extension provides comprehensive support for the Clarion programming language, including **syntax highlighting, snippets, code folding, solution parsing, and enhanced navigation**.

**New in v0.7.0**: This extension now includes all syntax highlighting and language features previously provided by the Fushnisoft extension. You no longer need to install a separate extension for basic Clarion language support!

For a quick reference, check out the [Cheat Sheet](https://github.com/msarson/Clarion-Extension/blob/master/docs/CheatSheet.md).

---

## Dedication - Version 0.7.0

**This release is dedicated to the memory of Brahn Partridge (4th January 1977 – 29th October 2021)**

Brahn, known in the community as **Fushnisoft**, created the original Clarion language support for VS Code through his [fushnisoft.clarion extension](https://marketplace.visualstudio.com/items?itemName=Fushnisoft.Clarion). His work provided the foundation for syntax highlighting and language features that so many Clarion developers relied upon.

Following Brahn's passing in October 2021, his extension could no longer be maintained or updated. The Clarion community has continued to evolve, and developers needed ongoing support for new VS Code features and improvements.

In v0.7.0, we have respectfully integrated Brahn's TextMate grammar and language configuration into Clarion Extensions. This integration:

- **Preserves his legacy**: His excellent work continues to serve the community
- **Enables future updates**: The language support can now evolve with VS Code and Clarion
- **Simplifies installation**: Developers need only one extension
- **Honors his contribution**: Full attribution is maintained in our LICENSE and documentation

Brahn's contributions to the Clarion developer community will not be forgotten. Thank you, Brahn, for your dedication to making Clarion development better for everyone.

*Rest in peace, friend.*

---

**Acknowledgments:**


### This is an active project looking for contributors!

This extension is under **active development** and we need your **help**! Whether you are a **Clarion developer**, a **VS Code enthusiast**, or just interested in **open-source projects**, your contributions, bug reports, and feedback are welcome. Check out our **[GitHub Issues](https://github.com/msarson/Clarion-Extension/issues)** to get involved!

---

## Features

For a comprehensive list of all features and their locations within the extension architecture, see our [Features Documentation](https://github.com/msarson/Clarion-Extension/blob/master/ClarionExtensionFeatures.md).

- **Complete Language Support**: Syntax highlighting, bracket matching, and auto-closing pairs for all Clarion file types (.clw, .inc, .txa, etc.)
- **Solution Explorer View**: Navigate Clarion projects directly inside VS Code.
- **Automatic Solution Parsing**: Detects all projects and redirection files in your solution.
- **ClarionCl.exe Integration**: **NEW!** Generate Clarion applications directly from the solution tree
  - Right-click on Applications node to generate all APPs in solution
  - Right-click on individual APP to generate single application
  - Live output streaming to "Clarion Generator" channel
  - Success/error notifications on completion
- **Enhanced "Go To Definition"**: Supports `INCLUDE` and `MODULE` statements, with redirection-aware searches. Full support for GROUP PREFIX declarations (e.g., `LOC:MyVar`, `MyGroup.MyVar`). **NEW: Method overload support** - correctly navigates to the right overload based on parameters.
- **Method Overload Support**: Smart detection of method overloads with parameter counting for accurate navigation and hover information.
- **Code Folding**: Tokenizer-based folding provider for improved code readability.
- **Hover Provider**: Displays previews of referenced files when hovering over `INCLUDE` or `MODULE` statements. Shows method signatures with correct overload resolution.
- **Build Configuration Support**: Easily switch between Release and Debug builds with `Clarion: Set Configuration`.
- **Redirection-Aware File Searching**: `Ctrl+P` respects local and global redirection files.
- **Document Outlining & Breadcrumbs**: Improves navigation within large Clarion files.
- **Experimental Tokenizer**: Future-ready for additional features like code formatting and diagnostics.
- **New Document Formatter**: Format Clarion source files with `Shift+Alt+F`.
- **Token Caching**: Improves performance by caching tokens unless the document changes.
- **Updated Folding and Symbol Provider**: Provides better structure recognition.
- **Welcome Screen**: Easily open or reopen Clarion solutions in your workspace.
- **Multi-Solution Workspace Support**: Open and manage multiple Clarion solutions in the same VS Code workspace.
- **Clarion Tools Sidebar**: A dedicated view in the activity bar for managing solutions, projects, and files.
- **View Filtering**: Filter Solution View and Structure View for easier navigation in large projects.
- **File Management**: Add or remove CLW files to/from projects directly from the Solution View.
- **Variable Prefix Highlighting**: Automatically highlights variables with user-defined prefixes (e.g., LOCS:, GLOS:) with configurable colors. Requires additional color customization settings.

---

## Installation

### Requirements

- **Visual Studio Code** (latest version recommended)

### Installation Steps

1. Open **Visual Studio Code**.
2. Go to the **Extensions Marketplace** (`Ctrl+Shift+X`).
3. Search for **Clarion Extensions**.
4. Click **Install**.
5. Restart VS Code if needed.

### Upgrading from v0.6.x or earlier

**Important**: If you are upgrading from v0.6.x or earlier and have the **fushnisoft.clarion** extension installed:

1. **First**: Uninstall **BOTH** extensions (fushnisoft.clarion AND clarion-extensions)
2. **Then**: Reinstall **only** clarion-extensions v0.7.0 or later
3. All syntax highlighting and language features are now included - you no longer need fushnisoft.clarion

This is necessary because older versions had a dependency on fushnisoft.clarion that prevents individual uninstallation.

---

## Marketplace Information

- **Identifier**: `msarson.clarion-extensions`
- **Version**: `0.7.1`
- **Published**: 2018-08-19
- **Last Release**: 2025-12-03

[View on Marketplace](https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extensions)

---
## Changelog (What's New in v0.7.3)

### 🚀 Major: Folder-Based Workflow

**No more workspace files needed!** The extension now works seamlessly with simple folder opening:

- **Just Open Folder** - No "Save Workspace As" prompts or .code-workspace files
- **Settings with Solution** - All settings stored in `.vscode/settings.json` within your solution folder
- **Team Friendly** - Commit settings with your solution for shared team configuration
- **Recent Solutions** - Global history remembers your last 20 solutions across all folders
- **One-Click Access** - Click recent solution in Solution View to instantly reopen it
- **Smart Reuse** - Previously configured solutions open without prompts
- **Auto-Validation** - Automatically cleans up invalid references to moved/deleted solutions

#### Using Recent Solutions:
1. Open VS Code with no folder - Solution View shows your recent solutions
2. Click any recent solution - Its folder opens and solution loads automatically  
3. Settings are remembered - No need to reconfigure Clarion version/properties each time

---

## Changelog (What's New in v0.7.1)

### 🔧 ClarionCl.exe Integration (NEW!)

**Generate Clarion applications directly from VS Code:**

- **Right-Click Generation**: Generate applications from the solution tree
  - Right-click on Applications node to generate all APPs in solution
  - Right-click on individual APP to generate single application
  - Live output streaming to "Clarion Generator" channel
  - Success/error notifications on completion

- **Smart Path Resolution**: Automatically detects ClarionCl.exe location
  - Uses Clarion BIN directory from solution configuration
  - No manual configuration required

- **Binary File Handling**: Improved tree navigation
  - .APP files no longer open as text when clicked
  - Cleaner user experience in solution explorer

### 🎯 Enhanced Diagnostics & Validation

**Real-time error detection with improved validation:**

- **Enhanced Diagnostics**: Real-time error detection (5 validators)
  - **Structure Termination**: Unterminated IF/LOOP/CLASS structures
  - **FILE Validation**: Must have DRIVER and RECORD (error)
  - **CASE Validation**: CASE statements can have zero or more OF clauses (fixed in 0.7.1)
  - **OROF Placement**: Must follow OF in CASE (error)
  - **EXECUTE Validation**: Expression should be numeric (warning)
  - **OMIT/COMPILE**: Validates directive block pairing

- **Improved Structure View**: Better visualization of code structure
  - **FILE**: Shows KEY/INDEX/RECORD/MEMO/BLOB hierarchy
  - **VIEW**: Displays JOIN nesting and PROJECT fields
  - **GROUP**: Shows OVER (memory overlay) and DIM (arrays) attributes
  - **Follow Cursor**: Auto-selects symbol at cursor position (toggle in view)

- **New Keywords**: CHOOSE function now properly recognized

---

### Method Overload Support

**Full support for Clarion method overloading with intelligent parameter counting.**

- **Smart overload resolution**: Extension now correctly identifies which method overload matches your call
  - Counts parameters in method calls automatically
  - Matches against all declared overloads
  - Selects best match based on parameter count
  - Handles optional parameters intelligently
  
- **Works everywhere**: 
  - **Hover** (hover over method call to see correct signature)
  - **Go to Definition (F12)** navigates to the correct overload
  - **Go to Implementation (Ctrl+F12)** finds the right implementation

**Example:**
```clarion
! Class with overloaded methods
SaveFile PROCEDURE(string fileName, bool append), long
SaveFile PROCEDURE(*string data, string fileName, bool append, long len=0), long

Code
  result = self.SaveFile('test.txt', true)           ! Hover/F12 shows 2-parameter version
  result = self.SaveFile(myData, 'test.txt', true)   ! Hover/F12 shows 4-parameter version
```

---

### 🚀 Major Performance Improvements

**Dramatic performance enhancements addressing previous slowdowns:**

- **Caching System**
  - Symbol provider results cached per document
  - Folding ranges cached (600ms → instant on re-open)
  - Token cache with change detection
  - Eliminates redundant tokenization

- **Tokenization Optimizations**
  - Fixed O(n²) catastrophic performance bug in procedure variables
  - Reduced duplicate tokenizations (3-4x → 1x per edit)
  - Per-document debouncing (100ms) prevents typing lag
  - Removed hot-path logger calls

- **Diagnostic Optimizations**
  - Eliminated duplicate tokenization in validation
  - Reduced OMIT/COMPILE block scanning overhead

**Result**: Files that previously caused VS Code to freeze now edit smoothly.

See [Performance Session](https://github.com/msarson/Clarion-Extension/blob/version-0.7.1/PERFORMANCE_SESSION_2024-12-01.md) for detailed metrics.

---

### 🧪 Test-Driven Development & Quality

**Comprehensive test suite ensures reliability:**

- **185 Tests Total** (100% pass rate)
  - 16 DefinitionProvider tests
  - 31 Clarion legacy syntax tests
  - 140+ DiagnosticProvider tests (TDD approach)
  - 9 validation tests
  - TokenHelper and FoldingProvider tests

- **Testing Framework**
  - Mocha test runner integrated
  - Comprehensive test files in `test-programs/`
  - All tests validated against Clarion compiler

- **Quality Improvements**
  - Zero regressions policy
  - Every fix validated with test
  - Edge cases documented and tested

---

### 🔧 Bug Fixes & Improvements

**Critical fixes for language parsing:**

- **Tokenizer Fixes**
  - Inline dot terminators now properly recognized (`IF x THEN y.`)
  - WHILE/UNTIL keywords recognized as loop terminators
  - Fixed array subscript dot handling (`MyArray[x].Field`)
  - RETURN no longer treated as scope boundary
  - PROCEDURE parameters not parsed as class properties

- **Structure View Fixes**
  - Fixed duplicate Methods container in classes
  - Correct MODULE termination rules (context-aware: MAP vs CLASS)
  - Fixed ROUTINE nesting under parent PROCEDURE
  - Token type precedence corrected (Type vs Function)
  - Colon support restored in label patterns

- **Diagnostic Fixes**
  - Squiggly underlines now positioned on keyword itself
  - Better detection of structure terminators
  - Context-aware MODULE validation

---

### 📊 Statistics (v0.7.1)

- **185 tests passing** (comprehensive test coverage)
- **5 diagnostic validators** (structure, FILE, CASE, EXECUTE, OMIT/COMPILE)
- **Real-time validation** for better code quality

---

### Performance Improvements (Additional)

**Dramatically improved performance by reducing logging overhead.**

- **Reduced log spam**: Most components now log only errors by default
  - HoverProvider: info → error
  - DefinitionProvider: info → error
  - Performance metrics still visible for monitoring
  
- **Better responsiveness**:
  - Extension no longer locks up VS Code when opening large files
  - Faster hover and definition lookups
  - Smoother editing experience overall

### Code Architecture Improvements

**Major internal refactoring to improve maintainability.**

- **New shared utilities**:
  - `ClassMemberResolver`: Handles class member lookup with overload resolution
  - `TokenHelper`: Provides scope navigation and word extraction
  - Eliminated ~500+ lines of duplicate code
  
- **Benefits**:
  - Consistent behavior across all features
  - Easier to maintain and extend
  - Bug fixes apply universally

### PREFIX and Structure Field Access Improvements

**Major improvements to Go to Definition and Hover for GROUP structures with PREFIX.**

This release includes significant fixes for working with Clarion PREFIX declarations:

- **Full PREFIX support**: All three access methods now work correctly
  - Direct prefix: `LOC:MyVar`
  - Dot notation: `MyGroup.MyVar`
  - Bare field name: `MyVar` (when valid)
  
- **Smart validation**: Extension validates correct field access patterns
- **Enhanced navigation**: Go to Definition works for all PREFIX scenarios
- **Better hover info**: Shows all valid ways to reference prefixed fields

### Build Output Configuration

**New configurable settings for build output visibility and log file handling.**

- **Build Output Visibility**: Control when the build terminal is shown (never/always/on errors)
- **Log File Preservation**: Option to keep build_output.log files for inspection
- **Custom Log File Path**: Specify custom locations for build logs
- **Output Panel Integration**: Show build output in Output panel alongside Problems

See [Build Settings Documentation](docs/BuildSettings.md) for details.

### Tokenization and Display Improvements

- **Better type parsing**: Improved handling of `STRING(100)`, `CSTRING(255)`, etc.
- **Cleaner symbol display**: Symbol outline shows clean format without duplication
- **Performance tracking**: Optional telemetry to help identify performance bottlenecks

For full details on all changes, see [CHANGELOG.md](CHANGELOG.md)

## Changelog (What's New in v0.5.8)

### Performance Improvements

**Load times reduced from 35+ seconds to under 1 second for large files.**

This release significantly improves performance through systematic optimization. Completed in collaboration with GitHub Copilot on November 17, 2025.

#### Key Improvements:
- **Tokenization**: 10x faster (5,800ms → 598ms)
  - Pre-compiled regex patterns
  - Character-class pre-filtering
  - Line-based incremental caching (95%+ speedup on edits)
  
- **Symbol Generation**: 55x faster (6,000ms → 110ms)
  - Fixed O(n²) algorithm
  - Built tokensByLine index for O(1) lookups
  
- **Structure View**: Much faster expansion (<1 second vs 20+ seconds)
  - Top-level only expansion with parallel processing
  
- **Code Folding**: 60% faster (6ms → 4ms)
  - Single-pass filtering optimization

#### User Experience:
- Fixed duplicate warning spam (24+ → 1)
- Better error messages
- Comprehensive performance logging (search `📊 PERF:`)

Large Clarion files (14k+ lines) now have significantly improved response times.

---
## Release History

### Previous Releases (v0.7.0 and Earlier)
### Enhancements
- **Improved Method Hover Display**: Method hovers now show up to 15 lines of actual implementation code after the CODE statement
- **Interactive Navigation in Hover**: Click the line number link in hovers to jump directly to method implementation
- **Keyboard Shortcut Hint**: Hover displays "Ctrl+F12 to navigate" to guide users
- **Method Call Hover Support**: Hovers now work for method calls within implementations (e.g., `self.SetLength(...)`)
- **Routine Navigation**: Complete navigation support for DO statements with hover preview and Ctrl+F12 navigation
- **Local Variable and Parameter Navigation**: F12 navigation and hover tooltips for local variables and procedure/method parameters
- **Class Member Navigation**: F12 navigation and hover tooltips for class properties and methods (e.g., `self.value`, `otherValue.property`)
- **Method Implementation to Declaration**: F12 on method implementation line navigates to CLASS declaration, hover shows declaration signature

---
## Previous Release (v0.5.7)
### Enhancements
- **Keyboard Shortcut for Go to Implementation**: Added Ctrl+F12 shortcut for "Go to Implementation" command.

---
## Older Changelog (What's New in v0.5.6)
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

## Changelog (What's New in v0.5.5)
### Enhancements
- **Improved Symbol Provider**: Major updates to the symbol provider for better code navigation and structure representation.
- **View Filtering**: Added filtering capabilities to Solution View and Structure View for easier navigation in large projects.
- **File Management**: Added option to add or remove CLW files to/from projects.

### Bug Fixes
- **Symbol Placement**: Fixed issues with symbols not being placed correctly in the document outline.
- **Label Formatting**: Fixed issues with labels not adding spaces between parameters.
- **Procedure Labels**: Resolved issues with procedure labels in methods.
- **Import Locations**: Fixed textdocument coming from new import location.
- **File Redirection**: Refactored file locations to use redirection as the default approach.

## Changelog (What's New in v0.5.3)
### BUG
- **V0.5.2 was not working when shipped**: Updated .vscodeignore as it was not publishing packages required for extension

## Changelog (What's New in v0.5.4)

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

## Changelog (What's New in v0.5.2)

### Added
- **COLOR Keyword Enhancement**: Added color patch visualization and color picker for COLOR keywords.
- **Solution Parsing Refactoring**: Moved client-side solution parsing to the language server side for improved performance and reliability.
- **Quick Open Improvements**: Enhanced Ctrl+P quick open functionality for better file navigation.

## Changelog (What's New in v0.5.1)

### Bug Fixes and Feature Improvements
- **Fixed folding behavior**: Resolved an issue where `MODULE` was incorrectly detected as a foldable region within class definitions.
- **Enhanced symbol provider**: Major improvements to the Outline view, with better symbol organization and handling for various Clarion structures.

## Changelog (What's New in v0.5.0?)

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
- **Updated Symbol Provider**: Still needs work, but improvements have been made.
- **Folding Provider is more stable**: Should handle complex code better.

### Fixed
- **General stability fixes** across the extension.

---

## Getting Started

For a comprehensive guide on using all features of the Clarion Extension, please refer to our [Getting Started Guide](https://github.com/msarson/Clarion-Extension/blob/master/GettingStarted.md).

### Opening a Clarion Solution in VS Code

1. **Open the Solution Folder**
   - Open the **root folder** where your `.sln` file is located.

2. **Select the Clarion Properties File**
   - Open the **Command Palette** (`Ctrl+Shift+P`).
   - Search for **"Clarion: Open Solution"**.
   - Choose `ClarionProperties.xml` from `%appdata%\SoftVelocity\ClarionVersion\ClarionProperties.xml`.

3. **Select the Clarion Version**
   - Choose the **Clarion version** used for compilation.

4. **(Optional) Save Workspace**
   - Save the workspace for easier future access.

---

## Current Limitations & Roadmap

### Scope Support Status

**Currently Supported:**
- ✅ **Local/Procedure Scope**: Full support for variables declared within procedures
  - Go to Definition works for all local variables
  - Hover information displays correctly
  - PREFIX structure fields fully supported (`LOC:MyVar`, `MyGroup.MyVar`)
  - Parameter detection and navigation

**Planned for Future Releases:**
- ⏳ **Module/Global Scope**: Cross-file variable and procedure references
  - MAP/MODULE declarations
  - Global variables
  - Cross-procedure navigation
- ⏳ **Class Scope Improvements**: Enhanced class member resolution
- ⏳ **Type Resolution**: Following variable types through assignments

**Note**: The extension currently focuses on providing robust local scope support. Global scope features (MAP, MODULE, cross-file references) are planned for future versions. This ensures the foundation is solid before expanding to more complex scenarios.

For feature requests or to track progress on global scope support, see our [GitHub Issues](https://github.com/msarson/Clarion-Extension/issues).

---

## Troubleshooting

### Snippet Descriptions Not Showing?

If snippets are not appearing correctly, update your VS Code settings:

```json
"editor.snippetSuggestions": "top",
"editor.suggest.showSnippets": true,
"editor.suggest.snippetsPreventQuickSuggestions": false
```

---

## Contributing and Feedback

This is an **active open-source project** that needs community help! 🚀

- **Report issues**: [GitHub Issues](https://github.com/msarson/Clarion-Extension/issues)
- **Submit pull requests**: Contributions are welcome!
- **Join the discussion**: Share your ideas on improving the extension.

If you use this extension and find it useful, please consider contributing back! 💙

---

## Acknowledgments

This extension builds upon the work of:
- [Mark Goldberg](https://github.com/MarkGoldberg) – Code folding.
- [Allen Zhu](https://github.com/celeron533) – Document Outline support.
- **Brahn Partridge** (1974–2021) – Early work on textmate language definitions.

---
## Additional Resources

📚 **[Getting Started Guide](https://github.com/msarson/Clarion-Extension/blob/master/GettingStarted.md)** – Comprehensive guide to all extension features.

📚 **[Cheat Sheet](https://github.com/msarson/Clarion-Extension/blob/master/docs/CheatSheet.md)** – Quick reference for features and usage.

## Features Documentation

📚 **[Features Documentation](https://github.com/msarson/Clarion-Extension/blob/master/ClarionExtensionFeatures.md)** – Detailed overview of all extension features and their implementation.

Thank you for using **Clarion Extension**! 🎉