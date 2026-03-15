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
- Method overload support
- Hover documentation for all symbols
- **[Learn more about Signature Help →](docs/features/signature-help.md)**

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
- Unterminated structures
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

### Latest: v0.8.7 (2026-03-15)

#### 🔍 Find All References (Shift+F12)
Full scope-aware Find All References — SELF/PARENT members, typed variables, chained chains, MAP/MODULE procedures, structure fields, INTERFACE methods, IMPLEMENTS(), CLASS type names, and overload filtering.

#### 🔌 Clarion INTERFACE Support
Complete language support for interfaces — hover, F12, Ctrl+F12, and Find All References for interface methods, IMPLEMENTS() declarations, and 3-part `Class.Interface.Method` implementations.

#### 🎨 Hover Quality Overhaul
- Clean class type cards (`ClassName — CLASS, TYPE · 📦 Defined in File at line N`)
- `🔷 Class property of ClassName` and `🔌 Interface method of InterfaceName` labels
- F12/Ctrl+F12 hints suppressed when already at declaration/implementation
- Implementation body previews removed (location only, matching TypeScript/C# style)

#### 🔗 Deep Chained Navigation
Hover, F12, Ctrl+F12, and references for any depth of `SELF.A.B.C` chains including CLASS, QUEUE, and GROUP intermediate types.

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

#### 🐛 Navigation & Hover Fixes
- FUNCTION declarations now work with Ctrl+F12 (cross-project)
- Procedures without parameters show correct hover info
- Methods named like keywords (e.g., MESSAGE) show method info instead of keyword help

**[See full changelog →](CHANGELOG.md)**

### Recent: v0.8.5 (2026-01-09)

#### 🔧 Folding Provider Fix
Fixed critical issues with code folding for window definitions:
- APPLICATION structures now fold correctly
- Nested MENU structures fold properly at any indentation level
- Removed arbitrary 50-column limit for structure recognition

**Impact:** Complex window/application definitions with nested menus now have proper code folding support.

### Recent: v0.8.4 (2026-01-09)

#### 🎨 Template Language Support
Dedicated syntax highlighting for `.tpl` and `.tpw` files with 100+ template keywords.

#### ⚡ Performance Boost
50-60% faster token processing with optimized caching and parent relationship indexing.

#### 🎯 Scope-Aware Navigation
F12 now correctly prioritizes local variables over globals with the same name.

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

