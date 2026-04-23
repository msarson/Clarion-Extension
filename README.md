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
- 310 built-in functions with parameter hints and descriptions
- Method overload support — overloads narrowed by argument type (e.g. `OPEN(Window)` shows only WINDOW signatures)
- Hover documentation for all symbols — procedures, classes, variables, attributes, built-ins
- Context-aware hover — `HIDE`, `DISABLE`, `TYPE` show attribute or statement usage depending on context
- Hover for **PROP:/PROPPRINT:** runtime properties — descriptions from Clarion 11.1 docs
- Hover for **EVENT:** equates — category, description, and usage example
- Signature help for class methods including inherited members
- **[Learn more about Signature Help →](docs/features/signature-help.md)**

### 🤖 **IntelliSense — Smart Completions**
Type `SELF.` or `MyVar.` for context-aware member suggestions. Type `PROP:`, `PROPPRINT:`, or `EVENT:` for documented equate completions.
- Resolves `SELF.`, `PARENT.`, `MyVar.`, or `ClassName.` to the correct class
- Full inheritance walk — shows methods and properties from parent classes
- Access control aware — `PRIVATE` / `PROTECTED` / `PUBLIC` scoping enforced
- Each overload shown as a distinct entry with parameter signatures
- Chained expressions (`SELF.Order.`) resolve intermediate types
- **PROP:/PROPPRINT:** completions with description and read-only badge
- **EVENT:** completions with category label (Field-Specific / Field-Independent / DDE)
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
- Multiple build configurations (Debug/Release) — active config auto-detected from `.sln.cache`
- Projects sorted by build order (dependency-first) in Solution View
- Live build output
- **[Learn more about Building →](docs/features/solution-management.md#build-integration)**

### 🎯 **Real-time Diagnostics**
Catch errors as you type.
- Unterminated structures — including window sub-structures (`WINDOW`, `SHEET`, `TAB`, `OLE`, `MENU`, etc.)
- Missing RETURN statements
- FILE validation (DRIVER, RECORD)
- **Missing INCLUDE** — warns when a variable's class type is defined in an `.inc` not included in the file; code action inserts the `INCLUDE` automatically
- **Missing DefineConstants** — warns when a class's required `Link()`/`DLL()` constants are absent from the `.cwproj`; code action adds them with a QuickPick for static vs DLL mode
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

### Latest: v0.9.6 (2026-04-23) — Missing Include Diagnostics & Bug Fixes

#### 🩺 Missing INCLUDE & DefineConstants Diagnostics
Variables declared with a user-defined class type now show a **Warning** squiggle when the type's `.inc` file isn't included. A code action (`Ctrl+.`) inserts the `INCLUDE`,ONCE statement — optionally in the current file or the MEMBER parent. A companion **Information** diagnostic fires when the include is present but required `Link()`/`DLL()` project constants are missing from the `.cwproj`, with a QuickPick code action to add them. The include verifier walks the **full transitive include chain** (any depth, cycle-safe) to avoid false positives from transitively-included types.

#### 🧙 New Solution Wizard
Create a minimal Clarion solution (`.sln`, `.cwproj`, `.clw`) from the Solution View `+` button or `Clarion: New Solution` in the command palette. Clarion version and configuration are auto-detected.

#### 🐛 Key Bug Fixes
- `token:function` equate identifiers no longer reset `inCodeSection`, preventing false-positive `BREAK used outside LOOP` diagnostics
- Blank-label `ITEMIZE` blocks (e.g. in `XMLType.inc`) no longer cause false-positive missing-include warnings
- Settings no longer write redundant legacy individual keys alongside the `solutions` array

**[See full changelog →](CHANGELOG.md)**

---

### Recent: v0.9.5 (2026-04-21) — Hover Expansion & Build Integration

#### 📚 310 Built-ins, 158 Attributes
Hover documentation now covers 310 Clarion built-in functions and 158 window/report attributes. Overload narrowing: hovering `OPEN(Window)` shows only the WINDOW-relevant signatures. Context-aware hover for `HIDE`, `DISABLE`, and `TYPE` — shows attribute or statement usage depending on whether you're inside a WINDOW/REPORT structure.

#### 🏗️ Build Integration Improvements
- Projects sorted by dependency order in Solution View
- Active build config auto-detected from `.sln.cache` on open
- Fixed MSBuild property quoting and per-project log files

#### 🐛 Key Bug Fixes
- **SDI startup fix**: hover and Go To Definition now work on first open without needing to reopen the solution
- `LIKE(TypeName)` dot-access chains resolve correctly (e.g. `SELF.OrigWin.Maximized`)
- Equate hover shows correct type (no longer shows `UNKNOWN`)

**[See full changelog →](CHANGELOG.md)**

---

### Recent: v0.9.4 (2026-04-19) — PROP/EVENT Docs, CodeLens & Editor Power-Ups

#### 📚 PROP: / PROPPRINT: Hover Documentation
Hover over any runtime property equate (`PROP:Enabled`, `PROP:Color`, `PROPPRINT:Device`, …) to see an instant description, read-only badge, and usage example. Covers **336 PROP:** entries and **25 PROPPRINT:** printer properties.

#### ⚡ EVENT: Hover & Autocomplete
Type `EVENT:` for a full autocomplete list of all **63 EVENT:** equates. Hovering shows category and description.

#### 🔢 CodeLens — Inline Reference Counts
A `N references` lens above every procedure and CLASS declaration. Dead code is immediately visible. Click to open the References panel.

#### 📐 Expand / Shrink Selection (`Shift+Alt+→` / `Shift+Alt+←`)
Progressively widen selection through Clarion's scope hierarchy.

#### 🔗 Flatten Continuation Lines (`Ctrl+.`)
Joins `|`-continued lines, trims whitespace, and collapses adjacent string literals.

**[See full changelog →](CHANGELOG.md)**

---

### Recent: v0.9.2 (2026-04-18) — Navigation & Bug Fixes

#### 🔗 Multi-Level Chain Navigation
`variable.property.method` chains now resolve all the way through. Hover, F12, and Ctrl+F12 on `thisStartup.Settings.PutGlobalSetting(...)` correctly walk the type chain.

#### 🐛 Key Bug Fixes
- `PREFIX:Name` reference variables now resolve correctly
- Hover, F12, and Ctrl+F12 suppressed inside string literals
- Colon-stripping fallback removed from hover and F12

**[See full changelog →](CHANGELOG.md)**

---

### Recent: v0.8.8 (2026-04-12)

#### ✏️ Rename Symbol (F2)
Rename any user-defined symbol across the entire workspace — scope-aware, protects read-only `.inc` files.

#### 🔆 Document Highlight
Click a symbol to highlight all its occurrences in the current file.

#### 🔍 Workspace Symbol Search (Ctrl+T)
Search for any procedure, class, or label across all files in the solution.

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

