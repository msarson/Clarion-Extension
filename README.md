**# Clarion Extension**

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Marketplace](#marketplace-information)
- [Changelog](#changelog-whats-new-in-v054)
- [Getting Started](#getting-started)
- [Troubleshooting](#troubleshooting)
- [Contributing and Feedback](#contributing-and-feedback)
- [Acknowledgments](#acknowledgments)
- [Additional Resources](#additional-resources)

---

## Overview

Welcome to the **Clarion Extension** for VS Code! This extension enhances the functionality of the [Fushnisoft Clarion Extension](https://marketplace.visualstudio.com/items?itemName=Fushnisoft.Clarion) by providing powerful tools such as **snippets, code folding, solution parsing, and enhanced navigation**.

For a quick reference, check out the [Cheat Sheet](https://github.com/msarson/Clarion-Extension/blob/master/docs/CheatSheet.md).

A special thanks to [Mark Goldberg](https://github.com/MarkGoldberg) for his contributions to code folding and [Allen Zhu](https://github.com/celeron533) for Document Outline support.

### This is an active project looking for contributors!

This extension is under **active development** and we need your **help**! Whether you are a **Clarion developer**, a **VS Code enthusiast**, or just interested in **open-source projects**, your contributions, bug reports, and feedback are welcome. Check out our **[GitHub Issues](https://github.com/msarson/Clarion-Extension/issues)** to get involved!

---

## Features

- **Solution Explorer View**: Navigate Clarion projects directly inside VS Code.
- **Automatic Solution Parsing**: Detects all projects and redirection files in your solution.
- **Enhanced "Go To Definition"**: Supports `INCLUDE` and `MODULE` statements, with redirection-aware searches.
- **Code Folding**: Tokenizer-based folding provider for improved code readability.
- **Hover Provider**: Displays previews of referenced files when hovering over `INCLUDE` or `MODULE` statements.
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

---

## Installation

### Requirements

- **Visual Studio Code** (latest version recommended)
- **Fushnisoft Clarion Extension** (as a base language extension)  
  Install from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=Fushnisoft.Clarion).

### Installation Steps

1. Open **Visual Studio Code**.
2. Go to the **Extensions Marketplace** (`Ctrl+Shift+X`).
3. Search for **Clarion Extension**.
4. Click **Install**.
5. Restart VS Code if needed.

---

## Marketplace Information

- **Identifier**: `msarson.clarion-extensions`
- **Version**: `0.5.4`
- **Published**: 2018-08-19
- **Last Release**: 2025-04-02

[View on Marketplace](https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extensions)

---
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

Thank you for using **Clarion Extension**! 🎉

