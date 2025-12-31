# Clarion Extension for Visual Studio Code

[![Version](https://img.shields.io/visual-studio-marketplace/v/msarson.clarion-extensions)](https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extensions)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/msarson.clarion-extensions)](https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extensions)

Comprehensive Clarion language support for Visual Studio Code with solution management, code navigation, IntelliSense, diagnostics, and build integration.

## Quick Links

📚 **[Full Features List](docs/FEATURES.md)** | 🚀 **[Getting Started Guide](docs/GETTING_STARTED.md)** | 📖 **[Cheat Sheet](docs/CheatSheet.md)** | 🐛 **[Report Issues](https://github.com/msarson/Clarion-Extension/issues)**

---

## Overview

The **Clarion Extension** provides professional-grade support for Clarion development in Visual Studio Code, featuring:

- ✅ **Complete language support** - Syntax highlighting, IntelliSense, and code navigation
- ✅ **Solution management** - Native Clarion solution explorer with project navigation  
- ✅ **Real-time diagnostics** - Catch errors as you type
- ✅ **Build integration** - Generate applications with ClarionCl.exe
- ✅ **Smart navigation** - Go to definition, find implementations, method overload support
- ✅ **Modern workflow** - Folder-based, no workspace files needed

**New in v0.7.0**: Includes all syntax highlighting previously provided by the Fushnisoft extension - no separate installation needed!

---

## Quick Start

### Installation

1. Open VS Code
2. Press `Ctrl+Shift+X` to open Extensions
3. Search for **Clarion Extensions**
4. Click **Install**

### Open Your First Solution

**Simple as opening a folder:**

1. Click **File → Open Folder** (or press `Ctrl+K Ctrl+O`)
2. Select the folder containing your `.sln` file
3. The extension automatically detects and opens the solution!

Settings are saved in `.vscode/settings.json` within the folder - commit them with your solution for team sharing.

**Need more details?** See the **[Getting Started Guide](docs/GETTING_STARTED.md)**.

---

## Key Features

### Solution Management
- Navigate projects and files in dedicated **Clarion Tools** sidebar
- **Recent solutions** - Quick access to your last 20 solutions
- **Auto-detection** - No workspace files or complex setup needed
- **Team-friendly** - Settings stored with solution, not in workspace files

### Code Intelligence
- **Smart IntelliSense** - 261 documented items (107 built-in functions, 92 attributes, 31 controls, 31 data types) with parameter hints and optional parameter support
- **Go to Definition** (`F12`) - Navigate to includes, modules, methods, sections
- **Go to Implementation** (`Ctrl+F12`) - Navigate from MAP declarations to implementations, MODULE to files
- **Method overload support** - Correctly resolves overloaded methods based on parameter types
- **Hover tooltips** - Preview file contents, method signatures, SECTION content, global variables
- **MODULE/MEMBER navigation** - Cross-file navigation with global variable lookup
- **Structure view** - Complete code outline with follow cursor
- **Unreachable code detection** - Visual dimming of code after RETURN/EXIT/HALT statements
- **Create New Class** - Interactive wizard creates both .inc and .clw files with proper formatting
- **Add Method Implementation** (`Ctrl+Shift+I`) - Automatically generate method implementations from declarations
- **Paste as Clarion String** (`Ctrl+Shift+Alt+V`) - Convert clipboard text to properly formatted Clarion strings with escaping and continuation
- **Extension status** - `Ctrl+Shift+P` → "Clarion: Show Extension Status" for health check

### Diagnostics & Validation
- **Real-time error detection** - Unterminated structures, missing RETURN statements
- **FILE validation** - Checks for required DRIVER and RECORD
- **CASE/EXECUTE validation** - Proper clause usage
- **OMIT/COMPILE blocks** - Validates directive termination

### Build & Generation
- **Generate applications** - Right-click to generate from Solution View
- **Live output** - Watch generation progress in real-time
- **Build configurations** - Switch between Release and Debug
- **Smart path resolution** - Auto-detects Clarion installation

**See all features:** **[Full Features Documentation](docs/FEATURES.md)**

---

## What's New

### Version 0.8.3 (Dec 2025)

#### ⚡ **Additional Performance Optimizations**
- **Eliminated redundant DocumentStructure rebuilds** on hover operations
  - Hover, signature help, and navigation now use cached structures
  - Reduced hover lag by 3-9ms per operation
  - All providers now consistently use cached DocumentStructure for optimal performance

### Version 0.8.2 (Dec 2025)

#### ⚡ **58x Faster Performance for Large Files**
- **Massive speed improvement** - Keystroke response time reduced from 820-880ms to 10-15ms
  - IntelliSense, signature help, and hover now appear almost instantly
  - Optimized token cache to build document structure only when needed
  - Large files (13K+ lines) now feel as responsive as small files
- **Enhanced folding** - Fixed crashes with extremely large files by limiting folding ranges

#### 📚 **Expanded Language Support**
- **Updated syntax documentation** for 40+ keywords and functions with full IntelliSense support
  - Data types: `UNSIGNED`, `INT64`, `UINT64`
  - Keywords: `PRAGMA`, `EQUATE`, `PROCEDURE`, `FUNCTION`, `EXECUTE`, `BEGIN`, `ASSERT`, `SELF`, `PARENT`, and more
  - Logical operators: `BAND`, `BOR`, `BXOR`, `BNOT`, `BSHIFT`
  - Built-in functions: `INT`, `ROUND`, `VAL`, `CHR`, `INSTRING`, `CLOCK`, `TODAY`, `DAY`, `MONTH`, `YEAR`
  - Procedure attributes: `RAW`, `PASCAL`, `PROC`, `NAME`, `DLL`, and more
  - Total of 261 documented items (107 built-in functions, 92 attributes, 31 controls, 31 data types)
- **Context-aware help** - Keywords like `TO` show different documentation based on usage context

### Version 0.8.0 (Dec 2025)

#### 🐛 **Critical Bug Fix: Unreachable Code Detection**
- **Eliminated false positives** in branching structures (IF/ELSE, CASE/OF, EXECUTE/BEGIN)
- **Proper Clarion semantics** - Terminators now correctly scoped to branches vs entire procedure

### Version 0.7.8 (Dec 2025)

#### ✨ Smart IntelliSense for Built-in Functions
- **62 Clarion built-in functions** with comprehensive IntelliSense support
  - Parameter hints with data type information and descriptions
  - Optional parameter support (e.g., `SUB(string, start, <length>)`)
  - Smart attribute completion for `WHO()`, `WHAT()`, `WHERE()` with valid values
  - Function categories: String, Numeric, Date/Time, File I/O, System, Memory, Conversion

#### ✨ Unreachable Code Detection
- **Visual dimming** of provably unreachable code in procedures, methods, and functions
  - Detects code after unconditional RETURN, EXIT, or HALT at top execution level
  - Respects Clarion semantics: ROUTINE blocks always reachable, STOP is not a terminator
  - Handles complex nested structures (ACCEPT, LOOP, CASE, IF, EXECUTE, BEGIN)
  - Supports PROCEDURE, METHOD, and FUNCTION declarations
  - Configurable via `clarion.unreachableCode.enabled` (default: enabled)
  - Non-intrusive 40% opacity dimming with zero false positives

#### ✨ MODULE/MEMBER Cross-file Navigation
- **Enhanced MODULE support** with bidirectional navigation
  - F12 on CLASS MODULE attribute navigates to implementation file
  - Ctrl+F12 from MAP MODULE navigates to source file
  - Reverse lookup: From MEMBER file back to parent MAP declaration
  - Global variable lookup in parent MODULE files with hover support

#### ✨ SECTION Support in INCLUDE Files
- **Enhanced INCLUDE with SECTION** navigation and tooltips
  - Hover on `INCLUDE('file.inc', 'SectionName')` shows exact SECTION content
  - F12 navigates directly to SECTION line, not just file top
  - Preview SECTION content in hover tooltips

#### 🔧 Major Improvements
- **Method overload resolution** with parameter type matching
  - Distinguishes `STRING`, `*STRING`, `&STRING`, `<STRING>` overloads
  - Works in hover, F12, Ctrl+F12, and Add Method Implementation
- **Provider refactoring** for better performance and maintainability
  - Complete HoverProvider, ImplementationProvider, DefinitionProvider rewrites
  - Eliminated duplicate code and improved caching
- **Token system enhancements** with accurate positioning and file references

### Version 0.7.5 (Dec 2025)

#### ✨ New Productivity Features
- **Create New Class** - Interactive wizard creates both .inc and .clw files with proper formatting
- **Add Method Implementation** (`Ctrl+Shift+I`) - Automatically generate method implementations from declarations
  - Finds MODULE file and checks for existing implementations
  - Jumps to existing or generates new implementation at EOF
  - Handles method overloads with parameter matching
- **Paste as Clarion String** (`Ctrl+Shift+Alt+V`) - Convert clipboard text to properly formatted Clarion strings
  - Automatic quote escaping and continuation syntax
  - Configurable line terminators (space/CRLF/none)
  - Optional leading whitespace trimming
  - Perfect for pasting SQL queries or multi-line text

### Version 0.7.4 (Dec 2025)

#### 🔧 Improved Stability & Performance
- **Major codebase refactoring** - 82% reduction in main extension file (975→175 lines)
- **Enhanced reliability** - Fixed multiple validation edge cases
- **Better organization** - Modular architecture for easier maintenance

#### 🐛 Key Bug Fixes
- **IF statement validation** - Single-line IF...THEN no longer triggers false errors ([#24](https://github.com/msarson/Clarion-Extension/issues/24))
- **FILE validation** - Correctly handles COMPILE/OMIT conditional blocks ([#23](https://github.com/msarson/Clarion-Extension/issues/23))
- **Build reporting** - Fixed false "Build Failed" messages on successful builds
- **Structure view** - Now follows cursor correctly on startup
- **ROUTINE parsing** - Improved recognition in all contexts

### Version 0.7.3 (Dec 2025)

#### 🚀 Folder-Based Workflow
- **No more workspace files** - Just open folder containing solution
- **Settings with solution** - All settings in `.vscode/settings.json`
- **Recent solutions** - Global history with one-click reopening
- **Team friendly** - Commit settings with your solution

#### ⚠️ Breaking Changes
**If upgrading from v0.7.2 or earlier:**
- **Workspace files no longer required** - The extension now uses a folder-based workflow
- **Settings migration** - Settings automatically migrate from `.code-workspace` to `.vscode/settings.json` when you open a folder
- **No action needed** - Just use File → Open Folder instead of opening workspace files
- **Old workspace files still work** - But the new folder-based approach is simpler

**Recommendation**: Switch to folder-based workflow by opening the solution folder directly rather than using workspace files.

#### 🐛 Bug Fixes
- Fixed build error diagnostics now properly link to source files
- Fixed global solution history tracking

### Version 0.7.1 (Nov 2024)

#### ⚡ Performance Improvements
- **Caching system** - Eliminated 1.5s delay on every keystroke in large files
- **Smooth editing** - No more freezing while typing in 14K+ line files
- **Optimized tokenization** - Reduced duplicate processing

#### 🎯 Enhanced Features
- **ClarionCl.exe integration** - Generate applications from Solution View
- **Enhanced diagnostics** - RETURN statement validation, structure checking
- **Method overload support** - Accurate navigation and hover for overloaded methods

**Full changelog:** **[CHANGELOG.md](CHANGELOG.md)**

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

## Contributing

### This is an active project looking for contributors!

This extension is under **active development** and we need your **help**! Whether you are a **Clarion developer**, a **VS Code enthusiast**, or just interested in **open-source projects**, your contributions, bug reports, and feedback are welcome.

- 🐛 **Report bugs or request features**: [GitHub Issues](https://github.com/msarson/Clarion-Extension/issues)
- 💡 **Contribute code**: Fork the repository and submit pull requests
- 📖 **Improve documentation**: Help make the docs clearer
- ⭐ **Star the project**: Show your support on GitHub

---

## Additional Resources

### Documentation
- **[Features Documentation](docs/FEATURES.md)** - Complete feature list
- **[Getting Started Guide](docs/GETTING_STARTED.md)** - Detailed setup and configuration
- **[Cheat Sheet](docs/CheatSheet.md)** - Quick reference for common tasks
- **[Build Settings](docs/BuildSettings.md)** - Build configuration details
- **[Clarion Knowledge Base](docs/clarion-knowledge-base.md)** - Clarion language reference

### Links
- **[GitHub Repository](https://github.com/msarson/Clarion-Extension)** - Source code and development
- **[Marketplace Page](https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extensions)** - Install and reviews
- **[Issue Tracker](https://github.com/msarson/Clarion-Extension/issues)** - Report bugs and request features

---

## License

This extension is released under the MIT License. See [LICENSE](LICENSE) for details.

Includes TextMate grammar originally created by Brahn Partridge (Fushnisoft), used with respect and full attribution.

---

**Happy Clarion coding!** 🎉
