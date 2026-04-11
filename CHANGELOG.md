# Changelog

All notable changes to the Clarion Extension are documented here.

---

## Recent Versions

### [0.8.8] - 2026-04-10
**Bug Fixes**

- 🐛 Fixed false-positive diagnostic "Procedure returns X but all RETURN statements are empty" for overloaded procedures — the validator now matches implementations by parameter signature, not just name, so a non-returning overload is no longer incorrectly flagged because another overload of the same name has a return type ([#44](https://github.com/msarson/Clarion-Extension/issues/44))
- 🐛 **Find All References on a local CLASS label** now returns correct positions and complete results:
  - Previously, FAR on a CLASS declaration label (e.g. `ThisWindow` in `ThisWindow CLASS(WindowManager)`) returned the CLASS *keyword* column for every CLASS declaration in the procedure instead of actual `ThisWindow` references — caused by `varName` extraction using `split(' ')[0]` on `"CLASS (ThisWindow)"`, yielding `"CLASS"` rather than the label
  - Method implementation headers (`ThisWindow.Init PROCEDURE`, `ThisWindow.Kill PROCEDURE`, etc.) are now included — the token scan is expanded to the full file when a CLASS label is detected, since implementations live outside the declaring procedure's scope

---

### [0.8.7] - 2026-03-15
**Find All References, INTERFACE Support & Hover Quality**

**Highlights:**
- 🔍 Find All References (Shift+F12) — full scope-aware coverage: SELF/PARENT members, typed variables, chained chains, MAP/MODULE procedures, structure fields, interfaces, IMPLEMENTS, CLASS type names, overload filtering
- 🔌 Complete Clarion INTERFACE language support — hover, F12, Ctrl+F12, references for interface methods, IMPLEMENTS(), and 3-part `Class.Interface.Method` implementations
- 🎨 Hover quality overhaul — clean class type cards, class property / interface method labels, implementation body previews removed, F12/Ctrl+F12 hints suppressed when already at declaration/implementation
- 🔗 Deep chained navigation — `SELF.Order.RangeList.Init` hover/F12/Ctrl+F12 at any chain depth
- 🏷️ Typed variable member navigation — hover, F12, Ctrl+F12, and references for `obj.Method()` patterns
- 📦 25 new built-in function hovers; COMPILE/OMIT folding
- 🧪 597 tests passing

[**→ Full details**](docs/changelogs/CHANGELOG-0.8.7.md)

---

### [0.8.6] - 2026-01-12
**Cross-Project Navigation & Solution View Enhancements**

**Highlights:**
- ⚡ 50-70% faster Ctrl+F12 navigation via CrossFileCache (2-4s → <100ms)
- 🎯 Full support for routines with namespace prefixes (`DumpQue::SaveQState`)
- 🏗️ Dependency-aware build order with progress indicators
- 🔧 Fixed FUNCTION declarations, procedures without parameters
- 🎨 Method hover priority fix (methods named like keywords)
- ✨ Batch UpperPark commands and enhanced context menus
- 📊 All 498 tests passing

[**→ Full details**](docs/changelogs/CHANGELOG-0.8.6.md)

---

### [0.8.5] - 2026-01-09
**Folding Provider Fix**

**Highlights:**
- 🔧 Fixed APPLICATION structures not creating folds
- 🔧 Fixed nested MENU structures not folding
- ✨ Removed arbitrary indentation limits for structure recognition

[**→ Full details**](docs/changelogs/CHANGELOG-0.8.5.md)

---

### [0.8.4] - 2026-01-09
**Architecture Refactoring & Documentation Overhaul**

**Highlights:**
- 🏗️ New SymbolFinderService eliminates ~510 lines of duplicate code
- 🎨 Full Clarion Template language support (.tpl/.tpw files)
- 📝 Complete documentation restructure with user-friendly guides
- 🎯 Major performance improvements in MAP resolution
- 🐛 Unicode quote conversion fix in Paste as Clarion String

[**→ Full details**](docs/changelogs/CHANGELOG-0.8.4.md)

---

### [0.8.3] - 2025-12-31
**Token Performance Optimization (Phase 1)**

**Highlights:**
- ⚡ 50-60% performance improvement via DocumentStructure caching
- 🔍 Parent scope index for O(1) lookups
- 🧪 15 new tests for caching infrastructure
- 🏗️ Foundation for incremental tokenization

**Key Changes:**
- Implemented DocumentStructure caching service
- Added parent index for fast scope lookups
- Fixed double-caching issue in SolutionManager
- All 492 tests passing

---

### [0.8.2] - 2025-12-30
**Build System Enhancements**

**Highlights:**
- 🔧 Fixed build configuration persistence
- 🛠️ MSBuild parameter handling improvements
- ⌨️ Separate keyboard vs context menu build behavior
- 🔄 Terminal reuse for build tasks

**Key Changes:**
- Configuration changes now save correctly
- PowerShell command escaping fixed
- Auto-migration of old-style configurations
- Improved build completion messages

---

### [0.8.0] - 2025-12-30
**Major Refactoring & Performance**

**Highlights:**
- 🏗️ CrossFileResolver service consolidation
- ⚡ Eliminated scanning hundreds of MEMBER files
- 🎯 Fast MODULE resolution
- 🐛 Critical MAP resolution fixes

**Key Changes:**
- Unified cross-file navigation logic
- Fixed FUNCTION token filtering
- Improved DLL/LIB MODULE handling
- Enhanced MAP INCLUDE tracking

---

### [0.7.9] - 2025-12-29
**Navigation & Scope Analysis**

**Highlights:**
- 🎯 Scope-aware F12 (Go to Definition)
- 🏗️ New ScopeAnalyzer service
- 🧪 29 new scope analysis tests
- 🐛 Variable shadowing fixes

**Key Changes:**
- Procedure-local variables prioritized correctly
- Routine scope handling
- Module-local scope isolation
- 6 integration tests for scope-aware navigation

---

## Older Versions

### [0.7.8] - 2025-12-29
Template language syntax highlighting improvements

### [0.7.7] - 2025-12-24
Build system fixes and enhancements

### [0.7.6] - 2025-12-24
Minor bug fixes

### [0.7.5] - 2024-12-24
Performance optimizations

### [0.7.4] - 2024-12-06
Navigation improvements

### [0.7.3] - 2024-12-05
MAP resolution enhancements

### [0.7.1] - 2025-12-03
Bug fixes and stability improvements

### [0.7.0] - 2025-11-19
Initial public release

---

## Documentation

For versions **0.7.0 and newer**, see individual changelog files in [docs/changelogs/](docs/changelogs/).

For versions **0.6.x and earlier**, see [docs/archive/CHANGELOG-HISTORICAL.md](docs/archive/CHANGELOG-HISTORICAL.md).

---

## Version Numbering

We use [Semantic Versioning](https://semver.org/):
- **Major** (x.0.0) - Breaking changes
- **Minor** (0.x.0) - New features, backwards compatible
- **Patch** (0.0.x) - Bug fixes

---

[← Back to README](README.md)
