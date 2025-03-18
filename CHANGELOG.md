# Change Log  
All notable changes to the "clarion-extension" extension will be documented in this file.

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
