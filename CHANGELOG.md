# Change Log
All notable changes to the "clarion-extension" extension will be documented in this file.

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