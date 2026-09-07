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

## 🧪 Related

The ANTLR4 grammar / folding-provider exploration (2025–Jan 2026) was split out to the archived repo [Clarion-ANTLR-Grammar](https://github.com/msarson/Clarion-ANTLR-Grammar); tag `antlr-experiment` marks the last commit here that carried `antlr-grammar/`.

---

## 🆕 What's New

### Latest: v1.0.2 (2026-09-06) — Solutions that load wrong now say so, and a batch of navigation fixes

1.0.2 is a correctness release. The theme running through it is **silent failure**: several ways a solution could load in a degraded state — wrong build configuration, unresolvable redirection paths, source files missing from the index — looked identical to a healthy load, so features simply returned nothing and the extension read as broken rather than misconfigured. Those now report themselves. Alongside that is a run of hover, navigation and diagnostic fixes, many contributed by [@geircodes](https://github.com/geircodes).

- **Degraded solutions are visible:** source files that fail to resolve are counted and named instead of being silently dropped from the file-relationship graph; redirection macros that expand to nothing say so rather than leaving a dead search path; re-opening a solution from the recent list now validates the stored build configuration instead of adopting a stale one.
- **Redirection:** `%THISDIR%`, `%WinUserApplicationData%` and `%WinCommonApplicationData%` are implemented — previously they were left in the path as literal text, so every directory on that line failed to resolve.
- **Command Palette:** every command now carries a `Clarion` category, so typing "clarion" finds them — including how to open a solution, which was previously reachable only from the Clarion Tools sidebar.
- **Navigation & hover:** a bare local `CLASS` used as its own instance now resolves for hover, F12, Ctrl+F12, completion and signature help; colon-bearing labels no longer truncate and kill navigation; a local CLASS's indented `END` no longer swallows the next procedure; GROUP/QUEUE/CLASS field declarations resolve to themselves; 61 built-ins that hovered as "undefined" now show their signatures.
- **Diagnostics:** attribute and built-in names that collide with your own variables no longer hijack the hover card or the warning; discarded-return warnings survive a trailing comment; false "missing END" on a WINDOW with a continuation-line attribute is fixed.
- **Performance:** hovering an undeclared bare word in a large generated module no longer freezes for ~10s (10.5s → 13ms on the 40-project test solution), and Clarion's predefined compiler flags (`DLL_MODE`, `_DEBUG_`, `_USTRING_`, …) now hover properly instead of being flagged as undeclared.

**[See the full changelog for the complete list →](CHANGELOG.md)**

---

### Recent: v1.0.1 (2026-08-09) — Maintenance: performance follow-ups & correctness fixes

A stability release on top of the 1.0 overhaul — more startup and hover performance work verified on the real 40-project / 3,000-file solution, plus a batch of hover, completion, and diagnostic correctness fixes. Startup validators stopped freezing the editor in multi-second blocks, F12 on a built-in became instant instead of a ~24s cold walk, and `.app` global data stopped being falsely flagged "not declared" in generated MEMBER modules.

### Recent: v1.0.0 (2026-07-11) — Performance at scale, exact references, refactoring

The 1.0 release was the largest update yet — a ground-up performance overhaul verified on real 40-project / 3,000-file solutions: the IDE is usable seconds after opening a large solution, with all indexes persisted across sessions and no event-loop freezes. It also brought exact reference counts with routine lenses, overload-aware navigation everywhere (FAR, F12, Ctrl+F12, hover, signature help), new refactors (Surround With, Negate Condition, Flip IF/ELSE, Introduce EQUATE, Create routine from `DO`), new diagnostics, and an upgrade to LSP 8.x.

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

---

## Contributors ✨

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-12-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

Thanks to everyone who has helped improve the Clarion Language Extension through code, bug reports, testing, ideas, documentation and their knowledge of the Clarion language.

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/geircodes"><img src="https://avatars.githubusercontent.com/u/127224049?v=4?s=100" width="100px;" alt="geircodes"/><br /><sub><b>geircodes</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/commits?author=geircodes" title="Code">💻</a> <a href="https://github.com/msarson/Clarion-Extension/issues?q=author%3Ageircodes" title="Bug reports">🐛</a> <a href="#ideas-geircodes" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Chahton"><img src="https://avatars.githubusercontent.com/u/10942054?v=4?s=100" width="100px;" alt="Edin Čahtarević"/><br /><sub><b>Edin Čahtarević</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/issues?q=author%3AChahton" title="Bug reports">🐛</a> <a href="#ideas-Chahton" title="Ideas, Planning, & Feedback">🤔</a> <a href="#userTesting-Chahton" title="User Testing">📓</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/ClarionLive"><img src="https://avatars.githubusercontent.com/u/2301791?v=4?s=100" width="100px;" alt="ClarionLive"/><br /><sub><b>ClarionLive</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/issues?q=author%3AClarionLive" title="Bug reports">🐛</a> <a href="#ideas-ClarionLive" title="Ideas, Planning, & Feedback">🤔</a> <a href="#userTesting-ClarionLive" title="User Testing">📓</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://celeron533.github.io/"><img src="https://avatars.githubusercontent.com/u/3608762?v=4?s=100" width="100px;" alt="Allen Zhu"/><br /><sub><b>Allen Zhu</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/commits?author=celeron533" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://fushnisoft.com"><img src="https://avatars.githubusercontent.com/u/1259015?v=4?s=100" width="100px;" alt="Brahn Partridge"/><br /><sub><b>Brahn Partridge</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/commits?author=fushnisoft" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/MarkGoldberg"><img src="https://avatars.githubusercontent.com/u/4584617?v=4?s=100" width="100px;" alt="Mark Goldberg"/><br /><sub><b>Mark Goldberg</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/issues?q=author%3AMarkGoldberg" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://carlosgutierrez.mx"><img src="https://avatars.githubusercontent.com/u/5258638?v=4?s=100" width="100px;" alt="Carlos Gutierrez"/><br /><sub><b>Carlos Gutierrez</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/issues?q=author%3ACarlosGtrz" title="Bug reports">🐛</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/ThaDaVos"><img src="https://avatars.githubusercontent.com/u/5251028?v=4?s=100" width="100px;" alt="Dylan Vos"/><br /><sub><b>Dylan Vos</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/issues?q=author%3AThaDaVos" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/krosoftware"><img src="https://avatars.githubusercontent.com/u/8056218?v=4?s=100" width="100px;" alt="krosoftware"/><br /><sub><b>krosoftware</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/issues?q=author%3Akrosoftware" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/jslarveEC"><img src="https://avatars.githubusercontent.com/u/112515315?v=4?s=100" width="100px;" alt="jslarveEC"/><br /><sub><b>jslarveEC</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/issues?q=author%3AjslarveEC" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/narduss"><img src="https://avatars.githubusercontent.com/u/15345011?v=4?s=100" width="100px;" alt="Nardus"/><br /><sub><b>Nardus</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/commits?author=narduss" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.boxsoft.net"><img src="https://avatars.githubusercontent.com/u/1831296?v=4?s=100" width="100px;" alt="Mike Hanson"/><br /><sub><b>Mike Hanson</b></sub></a><br /><a href="#ideas-BoxSoft" title="Ideas, Planning, & Feedback">🤔</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!
