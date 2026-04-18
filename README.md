# Clarion Extension for Visual Studio Code

[![Version](https://img.shields.io/visual-studio-marketplace/v/msarson.clarion-extensions)](https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extensions)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/msarson.clarion-extensions)](https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extensions)

Professional Clarion language support for Visual Studio Code with intelligent code navigation, IntelliSense, and build integration.

## 🚀 Quick Links

- **[5-Minute Quick Start](docs/guides/quick-start.md)** - Get up and running fast
- **[Common Tasks](docs/guides/common-tasks.md)** - Everyday workflows made easy
- **[Installation Guide](docs/guides/installation.md)** - Detailed setup instructions
- **[Full Changelog](CHANGELOG.md)** - See what's new
- **[Report Issues](https://github.com/msarson/Clarion-Extension/issues)** - Found a bug?

---

## ✨ Key Features

### 🎨 **Clarion & Template Language Support**
Full language support for Clarion code, basic support for templates.
- **Clarion files (.clw, .inc)** - Complete syntax highlighting and IntelliSense
- **Template files (.tpl, .tpw)** - Syntax highlighting with 100+ template keywords
- Code folding for structures and template blocks
- Context-aware coloring for Clarion code
- **Note:** Template files have syntax highlighting only (no IntelliSense/navigation)
- **[Learn more about Code Editing →](docs/features/code-editing.md)**

### 💡 **Signature Help & Documentation**
Get instant parameter hints and documentation - works immediately, no solution needed!
- 148 built-in functions with parameter hints
- Method overload support — all overloads shown with full signatures
- Hover documentation for all symbols
- Signature help for class methods including inherited members
- **[Learn more about Signature Help →](docs/features/signature-help.md)**

### 🤖 **IntelliSense — Dot-Triggered Member Completion**
Type `SELF.` or `MyVar.` for instant context-aware member suggestions.
- Resolves `SELF.`, `PARENT.`, `MyVar.`, or `ClassName.` to the correct class
- Full inheritance walk — shows methods and properties from parent classes
- Access control aware — `PRIVATE` / `PROTECTED` / `PUBLIC` scoping enforced
- Each overload shown as a distinct entry with parameter signatures
- Chained expressions (`SELF.Order.`) resolve intermediate types
- **[Learn more about Navigation →](docs/features/navigation.md)**

### ✏️ **Code Snippets**
Write code faster with 50+ smart snippets - works immediately!
- Structure templates (IF, LOOP, CASE, etc.)
- Variable declaration shortcuts
- Procedure and method templates
- **[Learn more about Snippets →](docs/features/code-editing.md#code-snippets)**

### 📂 **Solution Management**
Open any Clarion solution - just open the folder.
- Auto-detects `.sln` files in folder
- Recent solutions list for quick access
- No workspace files needed
- **[Learn more about Solution Management →](docs/features/solution-management.md)**

### 🧭 **Smart Code Navigation**
Jump to definitions, find implementations, and explore references — works in same file immediately, cross-file with solution.
- Press **F12** to go to definition (same file: no solution needed!)
- Press **Ctrl+F12** to go to implementation
- Press **Shift+F12** for **Find All References** — scope-aware across all project files
- Press **F2** to **Rename Symbol** — renames across the entire workspace in one step
- **Document Highlight** — pressing on a symbol highlights all occurrences in the current file
- **Workspace Symbol Search** (`Ctrl+T`) — search for any procedure, class, or label across all solution files
- Hover for documentation — declaration location, class/interface context, type info
- **Chained navigation**: `SELF.Order.RangeList.Init` — hover, F12, Ctrl+F12, and references resolve through CLASS, QUEUE, and GROUP type chains
- **SELF/PARENT properties**: F12 on `SELF.List` navigates to the class member declaration
- **Typed variable members**: F12/Ctrl+F12/hover on `obj.Method()` where `obj` is any typed variable
- **INTERFACE support**: hover, F12, Ctrl+F12, and references for interface methods, IMPLEMENTS(), and 3-part `Class.Interface.Method` implementations
- **CLASS type names**: F12 and Find All References work on type names in parameter and variable declarations
- Cross-file navigation requires solution
- **[Learn more about Navigation →](docs/features/navigation.md)**

### 🔧 **Build Integration**
Generate applications directly from VS Code.
- Right-click to build from Solution View
- Multiple build configurations (Debug/Release)
- Live build output
- **[Learn more about Building →](docs/features/solution-management.md#build-integration)**

### 🎯 **Real-time Diagnostics**
Catch errors as you type.
- Unterminated structures — including window sub-structures (`WINDOW`, `SHEET`, `TAB`, `OLE`, `MENU`, etc.)
- Missing RETURN statements
- FILE validation (DRIVER, RECORD)
- **[Learn more about Diagnostics →](docs/features/diagnostics.md)**

### ✏️ **Code Editing Tools**
Productivity features to write code faster.
- 50+ code snippets
- Paste as Clarion String
- Add Method Implementation
- Create New Class wizard
- **[Learn more about Code Editing →](docs/features/code-editing.md)**

---

## 📦 Installation

### Requirements
- **Visual Studio Code** (latest version)
- **Clarion** (for build features)

### Quick Install
1. Open VS Code
2. Press `Ctrl+Shift+X`
3. Search for **"Clarion Extensions"**
4. Click **Install**

**[Detailed installation instructions →](docs/guides/installation.md)**

---

## 🎓 Learning Resources

### For New Users
- **[Quick Start Guide](docs/guides/quick-start.md)** - 5 minutes to your first solution
- **[Common Tasks](docs/guides/common-tasks.md)** - How do I...?
- **[Installation Guide](docs/guides/installation.md)** - Detailed setup

### Feature Documentation
- **[Navigation Features](docs/features/navigation.md)** - F12, Ctrl+F12, hover tooltips
- **[Signature Help](docs/features/signature-help.md)** - Parameter hints and documentation
- **[Solution Management](docs/features/solution-management.md)** - Working with solutions
- **[Diagnostics & Validation](docs/features/diagnostics.md)** - Error detection
- **[Code Editing Tools](docs/features/code-editing.md)** - Snippets, commands, wizards

### Reference
- **[All Commands](docs/reference/commands.md)** - Complete command reference
- **[All Settings](docs/reference/settings.md)** - Configuration options
- **[Snippet Reference](docs/reference/snippets.md)** - Code snippet cheat sheet
- **[Clarion Language Reference](docs/CLARION_LANGUAGE_REFERENCE.md)** - Language syntax

---

## 🆕 What's New

### Latest: v0.9.2 (2026-04-18) — Navigation & Bug Fixes

#### 🔗 Multi-Level Chain Navigation
`variable.property.method` chains now resolve all the way through. Hover, F12, and Ctrl+F12 on `thisStartup.Settings.PutGlobalSetting(...)` correctly walk from `thisStartup` → its class → `.Settings` property type → the method on that type.

#### 🐛 Key Bug Fixes
- `PREFIX:Name` reference variables (e.g. `Access:IBSDataSets &DirectFM`) now resolve correctly — hover and F12 no longer find an unrelated `IBSDataSets FILE` declaration
- Hover, F12, and Ctrl+F12 are suppressed inside string literals — no more false results on `'ContainsSpaces'`
- Colon-stripping fallback removed from hover and F12 — was causing wrong matches for labelled variables

**[See full changelog →](CHANGELOG.md)**

---

### Recent: v0.9.1 (2026-04-14) — Faster Install

#### 🚀 Dramatically Smaller Extension
VSIX size drops from **19 MB → 0.6 MB** (10,849 bundled node_modules files eliminated). The extension now bundles all dependencies into two optimised files via esbuild — installs are much faster from the Marketplace and no functionality changes.

**[See full changelog →](CHANGELOG.md)**

---

### Recent: v0.9.0 (2026-04-14) — IntelliSense & Completion

#### 🤖 Dot-Triggered Member Completion
Type `SELF.` or `MyVar.` for a context-aware dropdown of all available methods and properties. Supports full inheritance chains, access control (`PRIVATE`/`PROTECTED`/`PUBLIC`), and shows each overload as a distinct entry with parameter signatures inline.

#### 💡 Signature Help for Class Methods
Typing `(` after a class method now shows parameter hints for the full inheritance chain — works for `SELF.Method(`, `MyVar.Method(`, and `ClassName.Method(`.

#### 🐛 Bug Fixes
- Signature help missing for `SELF.Method(` when class defined in same `.clw` file
- Missing `END` now flagged as a diagnostic for `WINDOW`, `SHEET`, `TAB`, `OLE`, `MENU`, `MENUBAR`, `TOOLBAR`, `REPORT`, `APPLICATION`, and `OPTION`
- Multiple cross-file F12, Ctrl+F12, hover, and Find All References fixes
- Replaced deprecated `vscode-test` with `@vscode/test-electron`

No functional changes — safe to upgrade immediately.

**[See full changelog →](CHANGELOG.md)**

---

### Recent: v0.8.8 (2026-04-12)

#### ✏️ Rename Symbol (F2)
Rename any user-defined symbol across the entire workspace in one step — scope-aware, protects library/read-only `.inc` files, and validates the position before the dialog opens.

#### 🔆 Document Highlight
Pressing on a symbol highlights all its occurrences in the current file.

#### 🔍 Workspace Symbol Search (Ctrl+T)
Search for any procedure, class, or label across all files in the solution.

**[See full changelog →](CHANGELOG.md)**

---

### Recent: v0.8.6 (2026-01-12)

#### 🚀 Cross-Project Navigation Performance
- **50-70% faster Ctrl+F12** - CrossFileCache reduces subsequent navigations to <100ms
- First navigation: 2-4 seconds (reads + caches file)
- Subsequent navigations: **<100ms** (cache hits)

#### 🎯 Routine Support Enhancements
- **Full namespace prefix support** - `DO DumpQue::SaveQState` now works with hover and Ctrl+F12
- New RoutineHoverResolver with code preview
- Added `DO_ROUTINE` and `ROUTINE_LABEL` patterns

#### 🏗️ Solution View Enhancements
- **Dependency-aware build order** - Projects build in correct dependency order
- **Application sort toggle** - Switch between Solution Order and Build Order
- **Build progress indicators** - Spinning icon, build counter (e.g., "Building 2/5")
- **Batch UpperPark commands** - Import/Export/Show All Differences
- **New context menu commands** - Build Project, Generate + Build, Copy Path, Open in Clarion IDE
- **Generate All/Build All** - Build multiple applications in dependency order

**[See full changelog →](CHANGELOG.md)**

---

## 💬 Support & Feedback

- **[GitHub Issues](https://github.com/msarson/Clarion-Extension/issues)** - Report bugs or request features
- **[Discussions](https://github.com/msarson/Clarion-Extension/discussions)** - Ask questions, share tips

---

## 📄 License

[MIT License](LICENSE)

---

## 🙏 Acknowledgments

Special thanks to:
- **fushnisoft** - Original Clarion syntax highlighting
- The Clarion community for feedback and testing

