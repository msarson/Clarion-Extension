# Changelog

All notable changes to the Clarion Extension are documented here.

---

## Recent Versions

### [0.9.2] - Unreleased

**Bug Fixes**

- 🐛 **Hover: show both declaration and implementation for inherited class methods** — `SELF.Method()` hover on methods inherited from a parent class defined in an `.inc` file (e.g. `WindowManager.SetAlerts` from `ABWINDOW.INC`) was only showing the declaration. The fix reads the `MODULE('...')` attribute from the class definition to locate the correct `.clw` implementation file via redirection, rather than guessing from the `.inc` filename. Local classes (declared in `.clw`) are unaffected.

**Tests**

- 🔧 **Fix test state pollution in `DefinitionProvider.test.ts`** — added `TokenCache.clearTokens` teardown to all `🔒 Behavior Lock` suites; the `LOC:Field` prefixed variable test was failing only due to cached state from a prior test

**Bug Fixes (continued)**

- 🐛 **F12 on overloaded class method implementations now resolves the correct overload** — `MethodOverloadResolver` was scanning for `TokenType.Label` tokens at column 0, but class member methods are tokenized as `Procedure/MethodDeclaration` with an indented label. Fixed to use the class token's `children[]` array (populated by `DocumentStructure`) for direct matching by label and subType. Also removed an incorrect `line > 0` filter that excluded classes declared at the top of a file.

---

### [0.9.1] - 2026-04-14

**Infrastructure**

- 🚀 **Bundle extension with esbuild** ([#56](https://github.com/msarson/Clarion-Extension/issues/56)) — VSIX drops from ~786 files / 2.5 MB to **30 files / 615 KB**:
  - `esbuild.mjs` bundles client and server into two single-file outputs; only `vscode` remains external
  - 4 data services (`BuiltinFunctionService`, `AttributeService`, `DataTypeService`, `ControlService`) now use static JSON imports instead of `fs.readFileSync` — esbuild inlines the data at bundle time
  - `node_modules/**` excluded from VSIX at root, `client/`, and `server/` — all runtime deps are bundled in
  - Dev workflow (`compile:dev`) is unchanged; only `vscode:prepublish` uses esbuild
- 🔧 **Update GitHub Actions to Node.js 24 compatible versions** ([#57](https://github.com/msarson/Clarion-Extension/issues/57)) — `actions/checkout@v5`, `actions/setup-node@v5`, `actions/upload-artifact@v4.6.2`
- 🔧 **Add `testrelease.yml` dry-run workflow** — runs the full build/test/package pipeline without merging or publishing; uploads the VSIX as a downloadable artifact for pre-release verification

---

### [0.9.0] - 2026-04-14

**New Features**

- ✨ **Dot-triggered member completion for CLASS instances and `SELF`** ([#54](https://github.com/msarson/Clarion-Extension/issues/54)) — typing `SELF.` or `MyVar.` now opens a dropdown of all methods and properties on the resolved class:
  - `SELF.` resolves to the enclosing class via `ChainedPropertyResolver`
  - `PARENT.` resolves to the base class
  - `MyVar.` resolves the variable's declared type then enumerates members
  - `ClassName.` enumerates the class directly
  - Full inheritance walk — child members shadow parent members by name
  - `PRIVATE` members visible only within the same class; `PROTECTED` visible in subclasses; `PUBLIC` visible everywhere
  - Chained expressions (`SELF.Order.`) resolve intermediate segment types
  - Each overloaded method appears as a distinct entry (e.g. `AddItem(STRING pText)` and `AddItem(LONG pId, STRING pText)`) with return type shown in the detail column

- ✨ **Signature help for class methods** ([#54](https://github.com/msarson/Clarion-Extension/issues/54)) — typing `(` after selecting a method from dot-completion (or typing `SELF.Method(` manually) now shows parameter hints; inherits the full inheritance chain so methods from parent classes are found correctly

**Bug Fixes**

- 🐛 **Hover for equates/labels in `INCLUDE` files and `EQUATES.CLW`** — symbols defined in files pulled in via `INCLUDE` statements at the global level (e.g. `KEYCODES.CLW`, `EQUATES.CLW`) now resolve correctly on hover; previously the lookup stopped at the current file
- 🐛 **Hover for equates inside `PROCEDURE` scope** — the INCLUDE chain is now also checked when the cursor is inside a procedure body; the resolver now walks global → module → procedure scope then falls back to all includes in the chain
- 🐛 **Hover for methods on typed variables declared in a parent/include file** — `UD.ShowProcedureInfo` where `UD CLASS(UltimateDebug)` is declared in a parent `.clw` (referenced via `MEMBER`) now shows the correct hover card; the variable type resolver now searches the MEMBER parent when the variable is not found in the current file
- 🐛 **Go to Declaration (F12) for methods on typed variables in parent/include files** — `DefinitionProvider.findClassMemberInIncludes` had the same nested-`END` bug as hover: the raw-text class member scan would exit on the first `END` encountered (e.g. the end of a nested `GROUP`/`QUEUE`/`RECORD`) rather than the end of the `CLASS` block; fixed with `nestDepth` tracking
- 🐛 **Go to Implementation (Ctrl+F12) for typed variables declared in parent/include files** — `ImplementationProvider` only searched the current file for the variable type; a new `findVariableTypeCrossFile()` method now mirrors hover's cross-file lookup (current file → MEMBER parent via `crossFileCache`) so `UD.ShowProcedureInfo` etc. resolve correctly
- 🐛 **`ClassMemberResolver.searchFileForMember` nested-`END` fix** — the shared member-scan utility (used by both hover fallback and GoTo) now tracks `nestDepth` so nested structure blocks inside a `CLASS` do not prematurely terminate the scan

**Refactoring**

- ♻️ **`MemberLocatorService` — unified dot-access resolution** — extracted a single service (`server/src/services/MemberLocatorService.ts`) that owns the entire typed-variable dot-access lookup pipeline (variable type resolution → INCLUDE chain walk → class index lookup → parent class chain). Hover, F12, and Ctrl+F12 all now delegate to this service, eliminating three independent implementations that previously diverged and caused repeated provider-specific bugs (see issue #50)
  - `DefinitionProvider.findClassMemberInIncludes` (raw-text fallback) deleted — replaced by service
  - `DefinitionProvider.findMemberInIncludes` (tokenized walk) deleted — replaced by service
  - `ImplementationProvider.findVariableTypeCrossFile` deleted — replaced by service
  - `ImplementationProvider.findVariableType` deleted — replaced by service
  - `VariableHoverResolver.findVariableTokenCrossFile`, `findGlobalVariableInParentFile`, `searchIncludesForLabel`, `resolveFilePath` deleted — hover now fully delegates cross-file variable lookup to `MemberLocatorService`, completing the unification between hover and GoTo code paths

**Bug Fixes (regression — v0.9.0)**

- 🐛 **Find All References returns only 1 result for MAP procedure calls**
- 🐛 **Find All References for module-scoped symbols incorrectly expanded to all project files** — symbols declared at module level in a MEMBER file (before the first PROCEDURE, per Clarion scope rules) have module scope and are only visible within that MEMBER module. `ReferencesProvider.getFilesToSearch` was falling through to global (all-project) search for any module-scoped symbol in a MEMBER file; it now correctly returns only the declaring file for MEMBER-file module-scoped symbols
- 🐛 **Hover / F12 for procedure-local variables when cursor is inside a ROUTINE** — variables declared in a procedure's local data section (between `PROCEDURE` and `CODE`) are accessible from all `ROUTINE` blocks within that procedure per Clarion scope rules, but `SymbolFinderService.findLocalVariable` only searched within the ROUTINE's own range and never checked the parent procedure's data section. The fix: (1) after the ROUTINE's own search fails, the parent procedure is located via `TokenHelper.getParentScopeOfRoutine` and its data section (before the CODE marker) is scanned for the variable; (2) when the symbol-tree path finds the variable in the parent procedure's data, the returned scope token is now the parent procedure (not the ROUTINE) so FAR searches the entire procedure range instead of just the ROUTINE
- 🐛 **F12 broken for variables declared in a MEMBER parent's INCLUDE chain**— `DefinitionProvider`'s MEMBER parent fallback only read the parent CLW directly and never walked its INCLUDE chain; added `findVariableInParentChain()` to `MemberLocatorService` and replaced the ~60-line manual fallback with a 5-line delegation
- 🐛 **F12 broken for dot-access where the object variable is declared cross-file** — both dot-access entry points in `DefinitionProvider` called `findVariableType()` (current-file only) for step 1 (type resolution); they now first try `memberLocator.resolveVariableType()` (cross-file) and fall back to `findVariableType()` only for non-class types, matching hover's behaviour
- 🐛 **Signature help (`Ctrl+Shift+Space`) missing for methods on cross-file variables** — `SignatureHelpProvider` used its own current-file-only variable type resolver; it now uses `MemberLocatorService.resolveVariableType()` so parameter hints appear for `st.Method()` where `st` is declared in a MEMBER parent or INCLUDE file, consistent with hover and F12
- 🐛 **Signature help missing for `SELF.Method(` when class is defined in the same `.clw` file** — `SignatureHelpProvider.getClassMethodSignatures` used a local token scan that missed classes defined in the current file and never walked the inheritance chain; it now delegates to `MemberLocatorService.enumerateMembersInClass` which handles all cases including inherited methods ([#54](https://github.com/msarson/Clarion-Extension/issues/54))
- 🐛 **Missing `END` not flagged for window sub-structures** — `DiagnosticProvider.requiresTerminator` only covered data/code structures; `WINDOW`, `REPORT`, `APPLICATION`, `SHEET`, `TAB`, `OLE`, `OPTION`, `MENU`, `MENUBAR`, and `TOOLBAR` now also produce a diagnostic when their closing `END` is absent ([#55](https://github.com/msarson/Clarion-Extension/issues/55))

---

### [0.8.9] - 2026-04-13
**Security**

- Updated dev dependencies to resolve Dependabot security alerts:
  - `serialize-javascript` — RCE via `RegExp.flags` and CPU exhaustion DoS (via mocha transitive dependency)
  - `diff` — Denial of Service in `parsePatch`/`applyPatch` (via mocha transitive dependency)
  - Replaced deprecated `vscode-test` with `@vscode/test-electron` in client (fixes `@tootallnate/once` vulnerability)

---

### [0.8.8] - 2026-04-12
**New Features**

- ✨ **Rename Symbol (F2)** — rename any user-defined symbol across the entire workspace in one step:
  - Delegates to the References provider for scope-aware coverage — local/module/global variables, procedures, class members via `SELF`/`PARENT` chains
  - `prepareRename` validates the position before the rename dialog opens and rejects Clarion keywords and built-in types
  - Library/read-only files are protected — symbols declared in `.inc` files outside the project cannot be renamed
- ✨ **Document Highlight** — pressing on a symbol highlights all occurrences in the current file
- ✨ **Workspace Symbol Search** (`Ctrl+T`) — search for any procedure, class, or label across all files in the solution

**Bug Fixes**

- 🐛 **Hover and Go to Definition for local class instances inside `MethodImplementation` scopes** now correctly resolves variables declared in the parent `GlobalProcedure`'s data section:
  - In Clarion, local classes declared in a `PROCEDURE`'s data section (e.g. `Kanban CLASS(KanbanWrapperClass)`) have their method implementations (`Kanban.Init PROCEDURE`, `Kanban.RegisterEvents PROCEDURE`, etc.) tokenized as flat, independent `MethodImplementation` scopes with no parent link — yet at runtime they share the parent procedure's local variable stack
  - **Hover** (`SymbolFinderService.findLocalVariable`): when a variable isn't found in the method's own scope, the resolver now also searches all `GlobalProcedure` data sections in the file
  - **Go to Definition** (`DefinitionProvider`): the same fallback was added — after the method's own DATA section search turns up nothing, all `GlobalProcedure` data sections are searched before giving up
- 🐛 **`!!!` doc comments now appear in hover for local variables, classes, groups, and other procedure-level declarations:**
  - `formatVariable` in `HoverFormatter` was not calling `DocCommentReader` at all — doc comments above local declarations were silently ignored
  - `DocCommentReader.parseXml` now handles unclosed `<summary>` tags and plain `!!!` text with no XML tags — mirrors Clarion IDE's forgiving `<docroot>` wrapping behaviour where plain text nodes and malformed tags all fall back gracefully to showing the raw comment text
  - The scope label in the hover card now uses a contextual noun derived from the declaration type: `CLASS(...)` → "class", `GROUP` → "group", `QUEUE` → "queue", etc., instead of always saying "variable"
- 🐛 Fixed false-positive diagnostic "Procedure returns X but all RETURN statements are empty" for overloaded procedures — the validator now matches implementations by parameter signature, not just name, so a non-returning overload is no longer incorrectly flagged because another overload of the same name has a return type ([#44](https://github.com/msarson/Clarion-Extension/issues/44))
- 🐛 **Find All References on a local CLASS label** now returns correct positions and complete results:
  - Previously, FAR on a CLASS declaration label (e.g. `ThisWindow` in `ThisWindow CLASS(WindowManager)`) returned the CLASS *keyword* column for every CLASS declaration in the procedure instead of actual `ThisWindow` references — caused by `varName` extraction using `split(' ')[0]` on `"CLASS (ThisWindow)"`, yielding `"CLASS"` rather than the label
  - Method implementation headers (`ThisWindow.Init PROCEDURE`, `ThisWindow.Kill PROCEDURE`, etc.) are now included — the token scan is expanded to the full file when a CLASS label is detected, since implementations live outside the declaring procedure's scope
- 🐛 **Go to Implementation (Ctrl+F12) and hover for `SELF.Method()`** now correctly find implementations inherited from an external base class:
  - Previously, `SELF.Method()` on a method declared in an external `.inc` file (e.g. `KanbanWrapper.inc`) and implemented in the corresponding `.clw` file only found the declaration — the implementation search was limited to the current file
  - `ImplementationProvider` now resolves the member declaration first to obtain the declaration file, then uses the existing `.inc` → `.clw` redirection fallback to locate the implementation
  - `MethodHoverResolver` now derives the `.clw` filename from `memberInfo.file` and passes it to the redirection-aware cross-file search (fixes both `SELF.Method()` and `PARENT.Method()` hover)
  - Hover now also shows the implementation signature as a code snippet alongside the file/line reference

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
