# Clarion Extension

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Marketplace](#marketplace-information)
- [Changelog](#changelog-whats-new-in-v0411)
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

---

## Features

- **Solution Explorer View**: Navigate Clarion projects directly inside VS Code.
- **Automatic Solution Parsing**: Detects all projects and redirection files in your solution.
- **Enhanced "Go To Definition"**: Supports `INCLUDE` and `MODULE` statements, with redirection-aware searches.
- **Code Folding**: Introduces a tokenizer-based folding provider for better code readability.
- **Hover Provider**: Displays previews of referenced files when hovering over `INCLUDE` or `MODULE` statements.
- **Build Configuration Support**: Easily switch between Release and Debug builds with `Clarion: Set Configuration`.
- **Redirection-Aware File Searching**: `Ctrl+P` respects local and global redirection files.
- **Document Outlining & Breadcrumbs**: Improves navigation within large Clarion files.
- **Experimental Tokenizer**: Future-ready for additional features like code formatting and diagnostics.

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
- **Version**: `0.4.11`
- **Published**: 2018-08-19
- **Last Release**: 2025-02-23

[View on Marketplace](https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extensions)

---

## Changelog (What's New in v0.4.11?)

### Added
- **Re-enabled Language Server Protocol (LSP)** for document outlining and navigation.
- **New tokenizer-based code folding** for better structure recognition.
- **Solution Explorer View**: Navigate Clarion projects inside VS Code.
- **Enhanced "Go To Definition"** now supports `INCLUDE` and `MODULE` statements with redirection-aware searches.
- **Build Configuration Support**: Easily switch between Release and Debug builds with `Clarion: Set Configuration`.
- **Redirection-Aware File Searching**: `Ctrl+P` now respects local and global redirection files.
- **Hover Provider**: Displays previews of referenced files when hovering over `INCLUDE` or `MODULE` statements.

### Changed
- **Updated documentation** with improved structure, adding a Table of Contents and making it more readable.

### Fixed
- **"Go To Definition" respects redirection paths** for improved accuracy.
- **New logging features** added to help track extension issues.

For full details, visit the [GitHub Changelog](https://github.com/msarson/Clarion-Extension/blob/master/CHANGELOG.md).

---

## Getting Started

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

This project is actively evolving! Your feedback helps improve the extension.  
Report issues or contribute on [GitHub Issues](https://github.com/msarson/Clarion-Extension/issues).

---

## Acknowledgments

This extension builds upon the work of:
- [Mark Goldberg](https://github.com/MarkGoldberg) – Code folding.
- [Allen Zhu](https://github.com/celeron533) – Document Outline support.
- **Brahn Partridge** (1974-2021) – Early work on textmate language definitions.

---

## Additional Resources

📚 **[Cheat Sheet](https://github.com/msarson/Clarion-Extension/blob/master/docs/CheatSheet.md)** – Quick reference for features and usage.

Thank you for using **Clarion Extension**! 🎉

