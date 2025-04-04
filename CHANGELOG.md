# Change Log
All notable changes to the "clarion-extension" extension will be documented in this file.

## [0.5.6] - 2025-04-04

### Enhancements
- **Variable Prefix Highlighting**: Added direct highlighting for variables with user-defined prefixes (e.g., LOCS:, GLOS:) with configurable styling options.
  
  To use this feature:
  1. Define your prefixes with simple colors or advanced styling options:
     ```json
     "clarion.prefixHighlighting": {
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
     ```
     
  2. Use VS Code's built-in color picker by clicking on the color values in the settings UI
  
  3. Optionally disable the feature with: `"clarion.prefixHighlighting.enabled": false`
  
  The extension will automatically apply the selected styles to variables with matching prefixes in your code.

- **Comment Pattern Highlighting**: Added highlighting for comment lines with user-defined patterns (e.g., `! TODO`, `! FIXME`).
  
  To use this feature:
  1. Define your comment patterns with simple colors or advanced styling options:
     ```json
     "clarion.commentHighlighting": {
       // Simple color
       "TODO": "#ff8c00",
       
       // Advanced styling
       "FIXME": {
         "color": "#ff0000",
         "fontWeight": "bold",
         "backgroundColor": "#fff0f0"
       }
     }
     ```
     
  2. Any comment line starting with `!` followed by one of your defined patterns (with or without a space) will be highlighted
  
  3. Optionally disable the feature with: `"clarion.commentHighlighting.enabled": false`

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
