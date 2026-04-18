# Changelog

All notable changes to the Clarion Extension are documented here.

---

## Recent Versions

### [0.9.3] - Unreleased

**Diagnostics**

- ⚠️ **Warn on discarded plain MAP/MODULE procedure return values** ([#51](https://github.com/msarson/Clarion-Extension/issues/51)) — a new warning fires when a plain (non-dot-access) call to a MAP or MODULE procedure that returns a value is used as a statement without capturing the result. Covers procedures declared directly in a `MAP` block, inside a `MODULE(...)` within a MAP, and in local procedure MAPs. Cross-file detection is supported: procedures declared in a global MAP in the program file (or any other cached file) are also checked when called from a MEMBER file. Add the `PROC` attribute to the declaration, or assign the return value, to suppress the warning.
- ⚠️ **Warn on BREAK/CYCLE outside LOOP or ACCEPT** ([#64](https://github.com/msarson/Clarion-Extension/issues/64)) — a new warning fires when `BREAK` or `CYCLE` appears outside any `LOOP` or `ACCEPT` structure. Both constructs are valid anywhere inside a `LOOP` or `ACCEPT` block (including nested blocks). Labeled forms (`BREAK Label` / `CYCLE Label`) are excluded from this check as they are addressed separately in issue #65.

**Code Quality**

- 🔧 **Refactor DiagnosticProvider into focused sub-modules** — the 1943-line `DiagnosticProvider.ts` has been split into four focused helper modules in `server/src/providers/diagnostics/`: `StructureDiagnostics.ts`, `ClassDiagnostics.ts`, `ReturnValueDiagnostics.ts`, and `ControlFlowDiagnostics.ts`. `DiagnosticProvider` is now a thin facade that delegates to these modules, making the code easier to maintain and extend.

---

### [0.9.2] - 2026-04-18

**Performance Fixes**

- 🚀 **Replace `ClassDefinitionIndexer` with `StructureDeclarationIndexer`** — the legacy `ClassDefinitionIndexer` only covered CLASS/QUEUE/GROUP and used a per-file sequential scan. The new `StructureDeclarationIndexer` covers CLASS, INTERFACE, QUEUE, GROUP, RECORD, FILE, VIEW, EQUATE, and ITEMIZE equates; stores 0-based line numbers canonically; and exposes a simpler API (`find`, `findInFile`, `getOrBuildIndex`). All 8 callers (MemberLocatorService, ClassMemberResolver, HoverProvider, MethodHoverResolver, VariableHoverResolver, ClassConstantsCodeActionProvider, ReferencesProvider, DefinitionProvider) have been migrated to use the new indexer directly, and the legacy class has been deleted.

**Diagnostics**

- ⚠️ **Warn on discarded method return values** ([#61](https://github.com/msarson/Clarion-Extension/issues/61)) — a new warning diagnostic fires when a dot-access method call that returns a value (and lacks the `PROC` attribute) is used as a statement with no capture. Reuses the same cross-file type resolution path as hover and F12 so results stay consistent. The async resolution pass is re-triggered after the solution finishes loading so files opened before the solution is ready are still validated. `SELF`/`PARENT` calls inside class method implementations are resolved via the implementation label. Assignments (`obj.Field = value`) and chained expressions are correctly excluded.

**Performance Fixes**

- 🚀 **Eliminate unnecessary disk reads in hot paths** ([#59](https://github.com/msarson/Clarion-Extension/issues/59)) — replaced `readFileSync` + O(n²) scans with token cache lookups across three providers:
  - `VariableHoverResolver`: O(n²) backward scan to find enclosing CLASS replaced with `DocumentStructure.getClasses()` range check (O(n) → O(k) where k = class count)
  - `SymbolFinderService.extractTypeInfo`: three sequential O(n) `filter/indexOf` passes collapsed into a single `lineTokens` build
  - `MemberLocatorService`: full token-based `findMemberFromTokens` / `extractMembersFromTokens` fast-path; disk-based fallback retained for uncached files
  - `ImplementationProvider.searchFileForMethodImplementation`: checks token cache first; single-candidate case returns without any disk read
  - `DefinitionProvider` equates fallback: skips `readFileSync` when equates.clw is already in the token cache
- 🐛 **Fix token cache overwrite in `MemberLocatorService`** — synthetic `TextDocument(version=1)` objects used for cross-file lookups no longer overwrite live editor tokens; providers now use `getTokensByUri` first and only fall back to `getTokens` for uncached files
- 🚀 **Structure/outline view no longer freezes during rapid undo** — added a `maxWait` of 1500ms to the document-change debounce so the structure tree always refreshes within 1.5 s even when the user holds Ctrl+Z continuously (previously the 500 ms rolling debounce reset on every undo step, starving the refresh indefinitely)
- 🚀 **Parallelize CLASS index build** — `ClassDefinitionIndexer.buildIndex` now scans all `.inc` files concurrently (`Promise.all`) instead of one-at-a-time; on large installations with hundreds of libsrc files this is 10–100× faster. Added always-on timing logs so build duration is visible in the Output channel.
- 🚀 **Eliminate hover/F12 hang on cursor movement** — `DocumentHighlightProvider` (occurrence highlighting, triggered by VS Code on every cursor move) was calling `ReferencesProvider.provideReferences()` which performed a full cross-file scan of all project source files then discarded every result outside the current file. On a 40-project solution this blocked the LSP event loop for 3–8 seconds on every cursor movement, preventing hover and F12 from running. `DocumentHighlightProvider` has been rewritten with a fast local token-cache scan (O(n) over current file tokens, synchronous, <1ms).
- ✨ **Client logs routed to VS Code Output channel** — log messages from the extension client side are now written to a `"Clarion Extension (Client)"` output channel in VS Code, making client-side diagnostics visible without needing a separate developer tools console.

**Bug Fixes**

- 🐛 **F12 now works for procedure parameters** — pressing F12 on a parameter name inside a procedure body (or inside a local class method body that can access the outer procedure's parameters) now navigates to the parameter declaration in the `PROCEDURE()` signature. Previously `DefinitionProvider` only searched column-0 labels and never found parameters. `DefinitionProvider` now delegates to `SymbolFinderService.findParameter` — the same code path already used by hover — so both providers share one source of truth for parameter resolution.
- 🔧 **Share type-definition SDI lookup between hover and F12** — `SymbolFinderService.findIndexedTypeDeclaration()` is now the single source of truth for looking up named types (CLASS, INTERFACE, QUEUE, GROUP, etc.) via the `StructureDeclarationIndexer`. Both `HoverProvider._checkClassTypeHoverInternal` and `DefinitionProvider.findClassTypeDefinition` delegate to this shared method; the hover-only include-verification guard (`IncludeVerifier.isClassIncluded`) remains exclusively in `HoverProvider`, so F12 navigation behaviour is unchanged.
- 🐛 **Hover: show both declaration and implementation for inherited class methods**— `SELF.Method()` hover on methods inherited from a parent class defined in an `.inc` file (e.g. `WindowManager.SetAlerts` from `ABWINDOW.INC`) was only showing the declaration. The fix reads the `MODULE('...')` attribute from the class definition to locate the correct `.clw` implementation file via redirection, rather than guessing from the `.inc` filename. Local classes (declared in `.clw`) are unaffected.
- 🐛 **Hover for `LOC:`-prefixed procedure parameters** ([#60](https://github.com/msarson/Clarion-Extension/issues/60)) — hovering over `LOC:Test` inside a procedure body where the parameter is declared as `PROCEDURE(STRING LOC:test)` now shows the correct type. The parameter extraction regex previously only matched simple identifiers; it now handles `PREFIX:Name` style parameter names and matches both the full prefixed form (`LOC:test`) and the bare name (`test`).
- 🐛 **F12 on overloaded class method implementations now resolves the correct overload** — `MethodOverloadResolver` was scanning for `TokenType.Label` tokens at column 0, but class member methods are tokenized as `Procedure/MethodDeclaration` with an indented label. Fixed to use the class token's `children[]` array (populated by `DocumentStructure`) for direct matching by label and subType. Also removed an incorrect `line > 0` filter that excluded classes declared at the top of a file.
- 🐛 **Find All References no longer triggers on attribute keywords** — words like `ONCE` in `INCLUDE('file.inc'),ONCE` were silently triggering a full cross-file reference scan. Added an `isAttributeKeyword()` early-exit guard to `ReferencesProvider` (same pattern used in `HoverRouter`).
- 🐛 **Find All References no longer hangs on locally-defined class methods** — when running "Find All References" on a method declared in a CLASS body inside the current MEMBER file (e.g. `TakeAccepted PROCEDURE(),DERIVED` in `MetroForm CLASS(ce_MetroWizardForm)` declared inside `Main PROCEDURE` with no `MODULE` attribute), the provider was scanning all source files in every project in the solution, causing an indefinite hang on large solutions. If the class is declared in the current document and has no `MODULE` attribute, the search is now restricted to the current file only. Added a 15-second timeout guard on `textDocument/references` as a safety net.
- ✨ **Multi-level variable chain hover/F12/Ctrl+F12** — `variable.property.method` chains now resolve correctly through CLASS, QUEUE, and GROUP types. For example `thisStartup.Settings.PutGlobalSetting(...)` fully resolves: `thisStartup` → its declared class, `.Settings` → the property type, `.PutGlobalSetting` → the method on that type. Hover shows the correct declaration, F12 navigates to it, and Ctrl+F12 finds the implementation.
- 🐛 **Fix hover/F12 for `PREFIX:Name` reference variables** — variables declared with a colon in their name (e.g. `Access:IBSDataSets &DirectFM,THREAD`) were incorrectly resolved: the old code stripped the prefix before the colon and found an unrelated `IBSDataSets FILE` declaration. Hover and F12 now search the MEMBER parent using the full label name first, so `Access:IBSDataSets` correctly navigates to the reference variable declaration.
- 🐛 **Remove colon-stripping fallback from hover and F12** — a general colon-stripping fallback was stripping `Prefix:` from variable names before searching, causing wrong matches. This fallback is unnecessary because the word extractor already returns the full `Prefix:Name` label (colons are treated as word characters). Structure prefix fields (`PRE(x)` notation) are correctly handled by `findPrefixFieldTokenInChain` without needing this fallback.
- 🐛 **Suppress hover/F12/Ctrl+F12 inside string literals** — hovering or pressing F12/Ctrl+F12 on text inside a quoted string (e.g. `'ContainsSpaces'`) was incorrectly triggering symbol resolution. All three providers now bail out immediately when the cursor falls within a `String` token's span.

**Tests**

- 🔧 **Fix test state pollution in `DefinitionProvider.test.ts`** — added `TokenCache.clearTokens` teardown to all `🔒 Behavior Lock` suites; the `LOC:Field` prefixed variable test was failing only due to cached state from a prior test
- 🧹 **Test suite cleanup** — removed 9 pre-existing pending tests: deleted `UnlabeledGroupNesting.test.ts` (test skipped due to flattened outline), moved `ClassDefinitionIndexer.test.ts` to `server/src/test/env/` (excluded from CI; requires Clarion 11.1 installed). Rescued the one passing `UnlabeledGroupNesting` test into `DocumentSymbolProvider.test.ts`. Fixed cross-test `SolutionManager` singleton dependency in `EquatesScope.test.ts`. Fixed `DocumentHighlightProvider` tests: Clarion labels must be at column 0 to be tokenised as `Label` tokens. Suite now runs at **747 passing, 0 pending, 0 failing**.

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
**Security Patch**

**Highlights:**
- 🔒 Resolved Dependabot alerts: `serialize-javascript` RCE, `diff` DoS
- 🔧 Replaced deprecated `vscode-test` with `@vscode/test-electron`

[**→ Full details**](docs/changelogs/CHANGELOG-0.8.9.md)

---

### [0.8.8] - 2026-04-12
**Rename Symbol, Document Highlight & Workspace Search**

**Highlights:**
- ✏️ Rename Symbol (F2) — scope-aware rename across entire workspace
- 🔦 Document Highlight — all occurrences highlighted on cursor
- 🔎 Workspace Symbol Search (Ctrl+T) — find any procedure/class/label across solution
- 🐛 Hover/F12 for local class instances inside `MethodImplementation` scopes
- 🐛 `!!!` doc comments now shown in hover for local variables and classes
- 🐛 FAR on CLASS labels now returns correct positions and method implementations
- 🐛 `SELF.Method()` / `PARENT.Method()` Go to Implementation and hover cross-file fix

[**→ Full details**](docs/changelogs/CHANGELOG-0.8.8.md)

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
