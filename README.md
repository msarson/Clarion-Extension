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
- Press **Shift+F12** for **Find All References** — scope-aware across all project files, overload-aware (only the matching overload's sites), routine-aware
- Press **F2** to **Rename Symbol** — renames across the entire workspace in one step
- **Reference-count CodeLens** — an exact `N references` count above every procedure, method, class, and routine; click to see them (large solutions briefly show a `~` estimate while the exact count computes)
- **Routines are first-class symbols** — hover, F12, Go-to-Implementation, references, and CodeLens all work on `ROUTINE` labels and `DO` sites, including generated `::` names like `Menu::MENUBAR1`
- **Module-callout procedures** — references from an implementation reach every module whose MAP includes the callout INC (the generated `MODULE('impl.clw')` + INCLUDE pattern)
- **Overload resolution by argument types** — F12, Ctrl+F12, hover, and references pick the overload matching the call's arguments (typed variables, members, EQUATEs, implicit variables, `PRE:Field` arguments)
- **Document Highlight** — scope-aware occurrence highlighting, including procedure call sites
- **Workspace Symbol Search** (`Ctrl+T`) — search for any procedure, class, or label across all solution files
- Hover for documentation — declaration location, class/interface context, type info, resolved INCLUDE/MODULE/MEMBER file paths
- **Chained navigation**: `SELF.Order.RangeList.Init` — hover, F12, Ctrl+F12, and references resolve through CLASS, QUEUE, and GROUP type chains
- **SELF/PARENT properties**: F12 on `SELF.List` navigates to the class member declaration
- **Typed variable members**: F12/Ctrl+F12/hover on `obj.Method()` where `obj` is any typed variable
- **INTERFACE support**: hover, F12, Ctrl+F12, and references for interface methods, IMPLEMENTS(), and 3-part `Class.Interface.Method` implementations
- **CLASS type names**: F12 and Find All References work on type names in parameter and variable declarations
- Cross-file navigation requires solution
- **[Learn more about Navigation →](docs/features/navigation.md)**

### 🔁 **Refactoring & Quick Fixes**
CodeRush-inspired refactors on **Ctrl+.** — plus quick fixes attached to diagnostics.
- **Surround With…** — wrap selected statements in `IF…END`, `LOOP`/`LOOP WHILE`/`LOOP UNTIL…END`, or `CASE…OF…END`
- **Negate Condition** — flip the logical sense of an `IF` / `ELSIF` / `LOOP WHILE` / `LOOP UNTIL` condition
- **Flip IF/ELSE** — negate the condition and swap the branches of a block-form `IF…ELSE…END`
- **Introduce EQUATE** — extract a magic literal to a named `EQUATE`, choosing which data section it lives in (routine / local / module / global — even cross-file into the PROGRAM)
- **Create routine from `DO`** — an unresolved `DO SomeRoutine` offers to scaffold the `ROUTINE` skeleton in the right scope
- **Add missing INCLUDE / project DefineConstants** — quick fixes on the corresponding diagnostics
- **[Learn more about Code Editing →](docs/features/code-editing.md)**

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
- **Discarded return values** — a value-returning (non-`PROC`) procedure or method called as a statement, including `SELF.`/`PARENT.` call sites
- **Literal passed by reference** — a literal handed to a `*TYPE` (or complex-type) parameter, which needs an addressable variable
- **Undeclared variables** (opt-out) — names that resolve to no declaration through the full scope model, cross-file aware
- **Missing implementations / indistinguishable prototypes** — MAP declarations without bodies, and overloads a call could never disambiguate
- **Character-set validation** that respects all Windows ANSI code pages (1250–1258) — national letters pass clean, genuine contamination (emoji, box-drawing) is flagged
- Code inside unconditional `OMIT` blocks is excluded from diagnostics and reference counts (rename still updates it — other build configurations may compile it)
- **[Learn more about Diagnostics →](docs/features/diagnostics.md)**

### ⚡ **Performance at Scale**
Built and measured against real-world solutions (40 projects / 3,000+ source files).
- Solution ready in ~2s, extension interactive in ~5s on large solutions
- All indexes (structure declarations, file relationships, reference counts) persist across sessions — warm starts re-scan only files that changed
- Background indexing is time-sliced and never blocks typing, hover, or navigation
- Project-file regeneration (all `.cwproj` files touched) coalesces into a single refresh
- Opt-in performance tracing (`clarion.log.performance.enabled`) produces a full diagnostic timeline for support

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
- **[Clarion Language Reference](https://github.com/msarson/Clarion-Extension/wiki/Clarion-Language-Reference)** - Language syntax (wiki)

---

## 🆕 What's New

### Latest: v1.0.0 — Performance at scale, exact references, refactoring

The 1.0 release is the largest update yet — a ground-up performance overhaul verified on real 40-project / 3,000-file solutions, plus a batch of new editing features.

#### ⚡ Startup & responsiveness overhaul
- The IDE is **usable seconds after opening a large solution** (previously minutes of spinners): solution tree instant, background indexing strictly sequenced and time-sliced, no event-loop freezes.
- **All indexes persist across sessions** (structure declarations, file-relationship graph, reference counts) — warm starts re-scan only changed files.
- A Clarion regeneration touching every `.cwproj` now triggers **one** refresh instead of forty.
- New `clarion.log.performance.enabled` setting (default off) emits a full diagnostic timeline for support.

#### 🔢 Reference counts you can trust
- CodeLens counts are **exact** — every lens runs a real scoped Find-All-References in the background and clicking shows the results instantly.
- **Routines get lenses too**, and are now first-class navigation symbols: hover, F12, Go-to-Implementation, and references work on `ROUTINE` labels and `DO` sites — including generated `::` names.
- Find-All-References understands the **module-callout pattern** (`MODULE('impl.clw')` INC included into many MAPs): references from an implementation now reach every calling module.
- Overload-aware everywhere: FAR, F12, Ctrl+F12, hover, and signature help all pick the overload matching the call's **argument types** — typed variables, members, EQUATEs, implicit variables, `PRE:Field` arguments.

#### 🔁 New refactors & quick fixes (Ctrl+.)
- **Surround With…** (IF / LOOP / CASE), **Negate Condition**, **Flip IF/ELSE**, **Introduce EQUATE** (with data-section placement), and **Create routine from an unresolved `DO`**.

#### 🎯 Diagnostics
- New: discarded return values (including `SELF.`/`PARENT.` sites), literal-passed-by-reference, undeclared variables, indistinguishable prototypes.
- Fixed: character-set validation respects all Windows ANSI code pages — national letters no longer flood non-Western files with warnings.
- Unconditional `OMIT` blocks are invisible to diagnostics and reference counts (rename still updates them).

#### 🧰 Under the hood
- Language client/server upgraded to **LSP 8.x**; the marketplace package is trimmed to just the runtime files.

**[See the full changelog for the complete list →](CHANGELOG.md)**

---

### Recent: v0.9.9 (2026-07-04) — Solution-wide scope correctness + no-solution resilience

- Tightened **open-solution** scope correctness across cross-file PROGRAM globals, sibling-MEMBER module scope, Tier 1 routine-local shadowing in `SymbolFinder.findSymbol(...)`, and qualifier completion so `Prefix:` only returns symbols for that exact qualifier (e.g. `TGLO:*`).
- Dot-completion member lists now show inline type information (for example `Var1 LONG`) while preserving clean insert text.
- Clarion startup now uses a cleaner TypeScript-style status bar progress flow (activating → language server → solution loading/indexing → ready) instead of multiple transient load popups.
- Build and generation commands now use a shared status-bar lifecycle (running/succeeded/failed) for clearer operation feedback.
- Added lazy no-solution FRG coverage for DocumentLink/FAR/completion plus no-solution entry-point completion parity improvements as additive fallback hardening.
- Landed cross-file overload fallback hardening when a built-but-irrelevant FRG is present.

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
