# Changelog

All notable changes to the Clarion Extension are documented here.

---

## Recent Versions

### [0.9.7] - Unreleased

**New Features**

- ✨ **Find All References / Rename scope isolation for local MAP procedures** (issue #91/#95): Find All References and Rename Symbol now correctly restrict their search to files reachable via the same procedure-local MAP scope. Previously, two procedures in different local MAPs sharing a name would be incorrectly merged into a single reference set. Hover on a local-MAP procedure call in a MEMBER file is also scoped correctly to the right MAP block.
- ✨ **Save before build** (issue #88): a new `clarion.saveBeforeBuild` setting (boolean, default `true`) automatically saves all unsaved open files before any build is triggered — solution build, project build, dependency-ordered build, generate-and-build, etc. Disable it to keep the old behaviour of building without saving.
- ✨ **Diagnostic: procedure missing MAP declaration** (issue #89): in MEMBER files, a Warning diagnostic is raised on any `GlobalProcedure` implementation that has no matching declaration inside a `MAP/MODULE` block in the parent PROGRAM file. Helps hand-coders catch forgotten MAP entries before a full build. Method implementations (`MyClass.Method PROCEDURE`) are excluded as their declarations live in CLASS blocks.
- ✨ **F5 — Launch Clarion Debugger**:pressing F5 (when a solution is open) launches `CladbNE.exe` (the non-elevation Clarion debugger) against the startup project's executable. The debugger path is derived automatically from the Clarion bin folder already known to the extension — no extra settings required. A prompt offers to build the project first (using the current configuration, awaited to completion before launching). A warning is shown if the active build configuration is not a Debug variant, since source files will not be available in the debugger for Release builds.
- ✨ **Ctrl+F5 — Build prompt before run**: running without debugging now prompts "Build and Run / Run Without Building / Cancel" before launching the executable, matching VS Code's standard pre-launch behaviour.
- ✨ **Clarion IDE preferences sync**: on solution open, the extension now reads the Clarion IDE's preferences XML (`%AppData%\SoftVelocity\Clarion\<version>\preferences\<sln>.<hash>.xml`) and automatically applies the IDE's active startup project and build configuration to VS Code. Changes made in VS Code (switching configuration or setting the startup project) are written back to the same file so the Clarion IDE always reflects the current state. When creating a new solution the preferences XML is created automatically.
- ✨ **Clarion Actions toolbar**: a new **Actions** panel in the Explorer sidebar provides quick-access icon buttons for Build, Run (Ctrl+F5), Debug (F5), Open Solution, and Close Solution. Below the buttons, a summary table shows the current solution name, startup project, and active build configuration. The summary updates automatically when the configuration is changed from the status bar.
- ✨ **Add MODULE with PROCEDURE code action** (issue #87): pressing `Ctrl+.` inside a MAP block now offers **Add MODULE with PROCEDURE**. A prompt collects the new CLW filename and procedure name. A QuickPick lists every directory from the project's redirection file where CLW files may live (labelled by section — `[Project]`, `[DEBUG]`, `[RELEASE]`, `[COMMON]`, etc.); the picker is skipped when only one candidate exists. The selected directory receives the new CLW stub (CRLF, correct `MEMBER` reference, `MAP/END`, and `PROCEDURE` body). The MODULE block is inserted into the MAP, the file is registered in `.cwproj`, the solution is refreshed, and the new file is opened. When triggered from a **local MAP** (inside a procedure), the generated CLW additionally declares the procedure inside its own `MAP/END` block, as Clarion requires for local-map modules.
- ✨ **Quick-fix code actions for MAP diagnostics** (issue #90): pressing `Ctrl+.` on any MAP declaration/implementation diagnostic now offers targeted quick fixes:
  - **Missing MAP declaration** (MEMBER file): "Add declaration to MAP in `Program.clw`" — inserts `ProcName PROCEDURE(params)` into the correct MODULE block, or creates a new MODULE block if none references the file.
  - **Missing implementation** (PROGRAM file): "Add implementation to `File.clw`" — appends a `ProcName PROCEDURE(params)\nCODE\nRETURN` stub at the end of the CLW.
  - **Signature mismatch** (either side): two actions — "Update declaration to match implementation" and "Update implementation to match declaration". The `(params)` list is replaced precisely; any return type or attributes after `)` in the MAP declaration are always preserved.
- ✨ **Add PROCEDURE code action from MAP** (issue #87): pressing `Ctrl+.` inside a MAP block (but outside any MODULE) also offers **Add PROCEDURE** targeting the current file — inserts the prototype directly in the MAP and appends the implementation to the end of the file.
- ✨ **`clarion.procedurePrototypeStyle` setting** (issue #87): controls the prototype form used when inserting declarations into MAP/MODULE structures. `"keyword"` (default, docs-recommended): `ProcName PROCEDURE()`. `"shorthand"` (backward-compat): `ProcName()` with correct indentation (1 level inside MAP, 2 levels inside MODULE). The procedure implementation body always uses the full keyword form.
- ✨ **MAP diagnostics for local and self-declared MODULE scopes** (issue #91): signature-mismatch diagnostics now fire for procedure-level MAP declarations (bare MAP inside a procedure body) and for self-declaration `MODULE('thisfile.clw')` blocks. `validateMissingImplementations` now also runs on MEMBER files so MODULE blocks in any source file are checked, not just PROGRAM files.
- ✨ **Multi-file "update all declarations" quick-fix** (issue #91): when a signature mismatch is fixed via `Ctrl+.`, the quick-fix now updates **all** files that declare the procedure (via `FileRelationshipGraph.getModuleDeclarants`). The action title shows "(N files)" when multiple files are affected. The SV AppGen pattern where `MODULE` blocks live in a shared `.inc` file is handled correctly.
- ✨ **Warn on non-Windows-1252 characters** (issue #82): any character with code point > 0xFF in `.clw`, `.inc`, `.equ`, or `.int` files raises a **Warning** diagnostic (`invalid-encoding`). Characters ≤ 0xFF (full Windows-1252 range including accented Latin characters) are not flagged. A `Ctrl+.` quick-fix offers to replace known Unicode characters with ASCII equivalents (smart quotes → straight quotes, em/en dash → hyphen, etc.) or delete the character. A **"Fix all N invalid characters"** bulk action appears when multiple issues exist in the file.
- ✨ **Continued-line joiner — `getLogicalLine(line)`** (Gap P from the DocumentStructure audit): `DocumentStructure.getLogicalLine(line)` returns a `LogicalLine` view that joins all `|`-continued physical lines into a single logical string suitable for regex parsing, with inline `!` comments stripped, the `|` markers replaced by single spaces, and a `map(col)` method that back-translates a joined-text column to its physical `(line, column)` for LSP Range reporting. The result also exposes `tokens[]` — references to the live token stream with `LineContinuation` and `Comment` tokens excluded. Any physical line in a continuation chain returns the same `LogicalLine`, so callers don't need to walk back to find the chain start. Lazy-built and cached; cleared automatically when `process()` runs. `WordCompletionProvider.collectParameters` is migrated to use `getLogicalLine(proc.line).joinedText` — it now correctly extracts parameter names from multi-line procedure signatures (previously the line-text scan stopped at the first physical line). Three further migration targets (`SignatureHelpProvider.parseMethodCall` and two internal continuation walks inside `DocumentStructure.handleStructureToken` / `handleEndStatementForStructure`) are left as follow-ups. Subtle Clarion semantic captured: a comment-only physical line in the middle of a chain ends the chain at that line — the next line is NOT joined unless the comment-only line itself ends with a `|`.

- ✨ **PROGRAM / MEMBER document helpers + hover** (Gap N from the DocumentStructure audit): three small `DocumentStructure` lookups that read the leading `TokenType.ClarionDocument` token: `getDocumentKind()` returns `'PROGRAM' | 'MEMBER' | undefined`; `getProgramName()` returns the label preceding `PROGRAM` (`MyProg PROGRAM` → `'MyProg'`); `getMemberParent()` returns the unresolved filename argument of `MEMBER('parent.clw')`. Hovering on a PROGRAM or MEMBER keyword now shows the program name (or parent module) instead of falling through to a generic keyword tooltip. Path-resolution callers continue to use the existing `getMemberParentFile()` (which returns the resolved `referencedFile`); the new `getMemberParent()` is the raw textual answer suitable for hover surface area.

- ✨ **Reverse IMPLEMENTS index — find a class's contract or all classes that fulfil it** (Gap H from the DocumentStructure audit): `DocumentStructure` now indexes the inverse direction of CLASS `IMPLEMENTS(InterfaceName)` declarations. New API: `getImplementors(interfaceName)` returns every CLASS token in the file that implements the named interface (case-insensitive); `findInterfaceReferences(interfaceName)` returns the IMPLEMENTS()-clause name tokens (the navigable positions where a class is wired up to a contract). The HoverProvider's INTERFACE hover now appends a footer naming each implementing class in the same file. Single-document only in v1; cross-file implementor scanning remains `StructureDeclarationIndexer` territory and is a clean follow-up. Built on the existing `Token.implementedInterfaces` array so no new tokenizer surface area; pure aggregation work.

- ✨ **EQUATE / ITEMIZE block index in DocumentStructure** (Gap B from the DocumentStructure audit): EQUATE Label tokens — both plain (`MAX_ROWS EQUATE(100)`) and ITEMIZE-block members (`Color ITEMIZE,PRE(Clr); Red EQUATE; …`) — are now indexed by name on `DocumentStructure`. ITEMIZE-EQUATE Labels carry a new `prefixedEquateName` field with the PRE-expanded form (`Clr:Red`), and the index is keyed by both the raw label AND the prefixed form so callers can look up either. New API: `getItemizeBlocks()`, `getItemizeMembers(itemizeToken)`, `findEquate(name)`, `getEquates()`. Nested ITEMIZE handling: inner-block PRE wins over outer-block PRE; an inner ITEMIZE without PRE inherits the nearest ancestor ITEMIZE's PRE via the parent chain. The `WordCompletionProvider.collectEquates` path (Gap I) is migrated to consult `getEquates()`, eliminating the in-provider line-text scan and replacing the parallel `StructureDeclarationIndexer` ITEMIZE_EQUATE regex pass for files already in TokenCache. A duplicate or non-EQUATE statement inside an ITEMIZE block is a Clarion compile error; flagged via `TODO(Gap B follow-up)` for a separate Diagnostic task.
  - **Tokenizer whitelist alignment**: `ITEMIZE` was listed in `STRUCTURE_PATTERNS` but missing from the tokenizer's `isDeclarationStructure` early-exit guard, so the structure-pattern regex pass never fired and ITEMIZE was downgraded to `TokenType.Variable`. Added the one-line entry to align the two lists. Without this, ITEMIZE blocks would never appear in `structuresByType.get('ITEMIZE')` and the Gap B walk for PRE-bearing ancestors couldn't work. The fix uses the same `startsWith(...)` shape as every other entry in the whitelist (so e.g. `ITEMIZER` would also match — a non-issue because Clarion identifiers prefixed with reserved keywords would already collide with the existing entries' similar patterns).

- ✨ **FieldEquate (`?Ctrl`) index + USE() target resolution** (Gap C from the DocumentStructure audit): `DocumentStructure` now indexes every `?Name` field-equate token both flat (across the document) and per-container (one map per WINDOW / APPLICATION / REPORT / TOOLBAR / MENUBAR), and resolves each USE keyword token's argument to the symbol it binds to. New API: `getControlsInStructure(structureToken)`, `findControl(name, scope?)` (scoped first; flat fallback returns null on ambiguity), `findControlAll(name)` (every match), `getBoundTarget(useToken)`, `findReferencesToControlInFile(controlToken)`. Token enrichment: `linkedTo?: Token` on USE tokens points at the bound `?Ctrl` / Label / structure-prefixed field; `hasNoFieldEquate?: boolean` flags the `USE(?)` "no field equate" idiom. v1 USE forms covered: `USE(?Name)`, `USE(VarName)`, `USE(?)` — chained access (`USE(SELF.Member)`) and dot-paths are deliberately deferred. No behaviour change for end users — this is provider plumbing for upcoming Definition / References / Rename support on `?Ctrl` identifiers. A duplicate `?name` within a single window is the Clarion compiler's error and is a candidate Diagnostic; flagged via `TODO(Gap C follow-up)` for a separate task.

- ✨ **`getStructureContextAt` — single source of truth for "what container am I in"** (Gap K from the DocumentStructure audit): a new `DocumentStructure.getStructureContextAt(line)` API returns the chain of containing Clarion structures (innermost-first), the enclosing scope token, and convenience flags (`inMap`, `inModule`, `inClass`, `inInterface`, `inWindow`, `inReport`, `inFile`, `inView`, `inQueueOrGroupOrRecord`). Containment is strict — the structure-opening line and the closing END line are NOT considered inside the structure, matching existing semantics. Companion `isInsideStructure(line, ...keywords)` predicate for ad-hoc multi-keyword checks. The four older boolean helpers (`isInMapBlock` / `isInModuleBlock` / `isInWindowStructure` / `isInClassBlock`) become deprecated shims that delegate to the new API. `ImplementationProvider`'s duplicated local `isInModuleBlock` is removed and migrated to the centralised version. No behaviour change for end users — this is consolidation that future provider work builds on.

- ✨ **User EQUATE labels surface as constants in word completion**: typing a partial identifier inside a procedure now offers user-defined `EQUATE` labels (`MAX_ROWS EQUATE(100)`) as `Constant` completion items with the `EQUATE(value)` form shown in the detail column. Previously these labels appeared but were tagged as plain `Variable` entries with no value visible. (Token-system gap I from the DocumentStructure audit.)

- ✨ **Context-aware attribute completions and diagnostics** (issue #80): word completions inside a control or structure declaration are now filtered by the surrounding context — e.g. typing inside a `BUTTON(...)` only suggests attributes valid for `BUTTON` plus generic `CONTROL` attributes, rather than the full attribute list. A new `invalid-attribute-context` Warning diagnostic fires when an attribute is used on a control type that doesn't support it (uses `applicableTo` metadata in `clarion-attributes.json`). Validation only runs on unambiguous window/report controls (BUTTON, ENTRY, LIST, COMBO, CHECK, RADIO, IMAGE, LINE, BOX, ELLIPSE, PANEL, PROGRESS, REGION, PROMPT, SPIN, ITEM, TEXT) — dual-role keywords like GROUP/QUEUE/SHEET/TAB/MENU/MENUBAR/TOOLBAR/OLE/OPTION are intentionally skipped because their attribute set depends on whether they're being used as data structures or window controls, which can't always be inferred from token context.

- ✨ **Document links moved to language server** (issues #92, #96): the `DocumentLinkProvider` for INCLUDE/MODULE/MEMBER/LINK statements is now implemented server-side via the LSP `textDocument/documentLink` request, using the `FileRelationshipGraph` directly rather than re-parsing files on the client. Eliminates a class of timing bugs where library-path includes (e.g. `INCLUDE('StringTheory.inc'),ONCE`) failed to resolve at startup because the client-side resolution path ran before the solution cache was fully populated. Links now appear on first paint with no edit required to trigger a refresh. The client-side `ClarionDocumentLinkProvider`, its event-emitter wiring, and the related `LocationProvider` link-resolution code are no longer registered.

- ✨ **Rename Symbol — block ,DLL and unresolvable-MODULE procedures** (issue #93): Rename Symbol (F2) now refuses to rename a procedure declared with the `,DLL` attribute on its prototype line, returning a clear VS Code rename error rather than silently producing a partial edit that desyncs the local MAP from the external DLL implementation. The same guard fires when the parent `MODULE('x.clw')` filename cannot be resolved through any project's redirection parser in the loaded solution — the source CLW lives outside the solution graph, so a workspace-local rename would be incomplete. The check skips when no solution is loaded (no graph to consult). A bare `MODULE` keyword with no parenthesised filename is also rejected.

- ✨ **Diagnostic: ITEMIZE block must contain only EQUATE declarations** (Gap B follow-up): a new `itemize-non-equate` Warning fires on any column-0 declaration inside an `ITEMIZE` block whose `dataType` (Gap D) is not `EQUATE`. Catches mistakes like declaring a `MyVar LONG` or nested non-EQUATE structure inside an ITEMIZE — Clarion's compiler rejects those, and surfacing them at edit time saves a round-trip. Comments, blank lines, and the END terminator are unaffected. Nested ITEMIZE blocks: the outer pass flags the inner ITEMIZE keyword line as a non-EQUATE; the inner pass independently validates its own children, so each level produces at most one warning per offending declaration. `ITEMIZE,PRE(X)` blocks are unaffected — PRE doesn't change member-EQUATE-ness. Built on Alice's Gap B `getItemizeBlocks()` and Charlie's Gap D `Token.dataType` — provider-only addition, no DocumentStructure changes.

**Performance**

- ⚡ **Document-level procedure and routine indexes** (DocumentStructure Gap A): `DocumentStructure` now populates two name-keyed indexes — `procedureIndex` (covering `GlobalProcedure` / `MethodImplementation` / `MapProcedure` / `MethodDeclaration` / `InterfaceMethod` subtypes) and `routineIndex` — at the end of `process()` once subtypes are final. New public helpers `findMethodImplementations(qualifiedName)`, `findRoutines(name?)`, and `getAllProcedures()` give O(1) name lookups and a flat O(N) "all procedures in document" accessor backed by the index instead of full-token-array scans. `findProcedureImplementations()` now reads from the index. Two consumer hot paths migrated: `UnreachableCodeProvider` (procedure list + per-procedure routine slice) and `ImplementationProvider`'s MethodImplementation candidate filter. New `TokenCache.getStructureByUri(uri)` helper exposes the cached structure for URI-only call sites. No behaviour change — purely faster on large solutions.

- ⚡ **RECORD-of-FILE marker** (DocumentStructure Gap M): RECORD tokens whose direct parent is a `FILE` structure are now flagged with `isFileRecord: true` during `DocumentStructure.process()`, distinguishing FILE-owned RECORDs from standalone or QUEUE/GROUP-nested ones. New `getFileRecord(fileToken)` helper returns the FILE's RECORD child without re-walking the token stream. `StructureDiagnostics.validateFileStructures` now reads the flag instead of doing a forward token scan for the RECORD-presence check (the DRIVER scan still runs for the attribute-presence check, but tightened to break on first match). The marker is available for any future consumer that wants to label/treat FILE-owned RECORDs differently — e.g. outline rendering — without each consumer reimplementing the parent walk. No behaviour change in diagnostics or output.

- ⚡ **Structured procedure parameter list on procedure tokens** (Tokenizer Gap E): the tokenizer now attaches a `parameters?: ProcedureParameter[]` array to every procedure-style token (`GlobalProcedure` / `MethodImplementation` / `MapProcedure` / `MethodDeclaration` / `InterfaceMethod`), populated by a new `ProcedureParameterParser` after `DocumentStructure.process()` in `ClarionTokenizer.tokenize()`. Each `ProcedureParameter` carries `{ name, type, typeArg?, byRef, optional, default? }` — replacing repeated regex/depth-counting parameter parsing across providers. Multi-line declarations split with `|` line continuation are joined to the full logical signature. `SignatureHelpProvider.createSignatureInformation` now consumes the structured list directly when the local-MAP path resolves a Token; the disk-read class-method path and other consumers (`ClarionPatterns.countParameters`, `MethodOverloadResolver`, etc.) are intentionally left on the regex path for follow-up migrations. ROUTINE tokens are not given parameters (Clarion routines take no arguments).

- ⚡ **Bare `?` tokenized as FieldEquateLabel** (Gap C follow-up): the tokenizer's FieldEquateLabel pattern now allows the trailing identifier to be optional, so anonymous-control markers like `BUTTON('OK'),USE(?)` produce a FieldEquateLabel token (value = `?`) alongside the existing named form `?MyControl`. Supports the FieldEquate index and USE() relationship work. No effect on tokens inside string literals (the String pattern still wins).

- ⚡ **`getClassMethodImplementations` — all method impls of a class in O(N)** (DocumentStructure Gap O): two new helpers on `DocumentStructure` — `getClassMethodImplementations(classToken)` and `getClassMethodImplementationsByName(className)` — return every `MethodImplementation` token whose label is the 2-part `ClassName.MethodName` form for the given class, case-insensitive. Backed by Gap A's `procedureIndex` (no full-token scan). 3-part interface impls (`ClassName.IFace.Method`) are intentionally excluded — same guard as `ImplementationProvider`'s candidate filter. Helper-only commit; available for future consumers (outline view, refactor tools, "all overloads of class X" quick-pick) without each one reimplementing the per-class scan.

- ⚡ **Declared-data values on Label tokens** (Tokenizer Gap D): column-0 `Label` tokens for data declarations now carry `dataType?: string` (uppercase keyword: 'EQUATE', 'STRING', 'LONG', 'LIKE', 'GROUP', etc.) and `dataValue?: string` (raw expression text inside the parens, e.g. `100` for `MAX_ROWS EQUATE(100)` or `Cust:Id` for `Field LIKE(Cust:Id)`). Bare-type declarations like `pId LONG` get a `dataType` only. A new `DeclaredValueParser` produces these in a tokenize-pipeline step that runs after `DocumentStructure.process()`. New `DocumentStructure.getDeclaredValue(label)` helper exposes the structured pair without re-parsing. Two consumer migrations: `WordCompletionProvider.collectEquates` now reads from the structured fields (replacing the Gap I regex), and `VariableHoverResolver` adds a one-line summary (`**MAX_ROWS** = \`100\`` for EQUATE, `**Name** : \`STRING(20)\`` for sized scalars) before the existing source-line code block. Multi-line declarations using `|` continuation are deferred to Gap P; aggregate-as-composite-type handling (GROUP/QUEUE/FILE/RECORD field structure) is Gap B territory — v1 captures only single-line scalar declarations with at most one parenthesised arg.

- ⚡ **Structured WINDOW / APPLICATION / REPORT descriptor** (Gap F): a new `WindowDescriptor` is now built once at `DocumentStructure.process()` time for every WINDOW, APPLICATION, and REPORT structure, capturing `title`, `at` (numeric `{x,y,w,h}` tuple when all four args are integers, raw expression text otherwise — e.g. `0,0,?Wnd:W,?Wnd:H`), `mdi` / `mdiChild`, `icon`, `systemMenu`, `statusBar`, and a fallback `attributes: string[]` for everything not parsed individually. New helpers `getWindowDescriptor(structureToken)` and `getActiveWindowDescriptor(line)` give O(1) access; the latter walks the `getStructureContextAt` chain so callers inside a control body can ask "what window am I in?" without re-parsing. Built using Gap P's `getLogicalLine` so multi-line headers wrapped with `|` continuation are joined into a single header before parsing. Hovering on the WINDOW / APPLICATION / REPORT keyword now renders a structured tooltip with the title, geometry, MDI mode, system-menu / status-bar flags, icon, and residual attributes — no more raw header line.

**Hover Improvements**

- 🎨 **Standardised hover location format**: all hover tooltips (procedures, methods, variables, structure types, fields, class declarations) now display the source location as `filename:N` placed at the bottom of the tooltip, after the code block — consistent across every hover type.
- 🐛 **CLASS type header no longer picks up `Link()`/`DLL()` arguments**: `CLASS(), Link('x', SomeName)` was incorrectly shown as `CLASS(SomeName)` in the hover header. The type extractor now only looks inside the first `(…)` group of the structure keyword.

**Bug Fixes**

- 🐛 **Stale MAP-diagnostic race condition after code-action fix**: applying a "sync signature" quick fix via `Ctrl+.` could leave the mismatch diagnostic visible until the files were saved or the extension restarted. Root cause: `CrossFileResolver` cached parent-file content under an un-encoded URI (`file:///f:/…`); VS Code's live buffer stored the updated content under a percent-encoded URI (`file:///f%3A/…`). Cross-file re-validation found the stale un-encoded entry first. Fix: after the TokenCache is refreshed on `onDidChangeContent`, any duplicate cache entries that normalise to the same path but use a different URI format are now removed — ensuring only the fresh VS Code buffer content is used.
- 🐛 **Ctrl+P (Quick Open) now includes files from redirection paths**:relative paths in `.red` redirection files are now resolved relative to the `.red` file's own directory rather than the project directory, so files in accessory `libsrc` and other Clarion-managed source trees appear correctly in the quick-open file list.
- 🐛 **Auto-restore solution after cross-folder workspace switch**: opening a solution from the Solution View history that lives in a different folder now correctly restores all settings (properties file, version, configuration) on the subsequent activation, eliminating the "Clarion settings are incomplete" warning.
- 🐛 **GlobalSolutionHistory saves full settings on all paths**: history entries now always include `propertiesFile`, `version`, and `configuration` regardless of which code path triggered the save, so cross-folder restore has the information it needs.
- 🐛 **Blank `currentSolution` no longer prevents solution load**: when `clarion.currentSolution` is empty but `clarion.solutions` contains entries (e.g. after closing a solution), the extension now falls back to the first solutions array entry so the solution loads correctly on next activation.

---

### [0.9.6] - 2026-04-23

**New Features**

- ✨ **New Solution wizard** (issue #79): create a minimal Clarion solution (`.sln`, `.cwproj`, `.clw`) from the Solution view `+` button or the command palette (`Clarion: New Solution`). Prompts for solution name and auto-detects the installed Clarion version and configuration.
- ✨ **Stale solution cleanup**: if a solution referenced in workspace settings no longer exists on disk, it is silently removed from settings on startup rather than leaving the extension in a broken state.
- ✨ **Missing Link/DLL equates code action** (issue #81): pressing `Ctrl+.` on a class name or its `INCLUDE` line now offers to add any missing `Link()`/`DLL()` equates to the project's `DefineConstants` in the `.cwproj` file. A QuickPick prompt lets you choose between static-link mode (`LinkMode=>1, DllMode=>0`) and DLL mode (`LinkMode=>0, DllMode=>1`), covering both single-exe and multi-DLL application setups.
- ✨ **Missing INCLUDE diagnostic & code action** (issue #83): variables declared with a user-defined class type (e.g. `st StringTheory` or `af &FileManager`) now show a **Warning** squiggle when the type's `.inc` file is not included in the current file or its `MEMBER` parent. A code action (`Ctrl+.`) offers to insert the `INCLUDE('…'),ONCE` statement in the current file or the MEMBER parent, and a combined action adds both the INCLUDE and any missing project constants in one step. When both the include and constants are absent, the warning message lists the missing constants upfront.
- ✨ **Missing DefineConstants diagnostic** (issue #83): when a class `.inc` is included but its required `Link()`/`DLL()` equates are not yet defined in the `.cwproj`, an **Information** diagnostic is shown on the type declaration. A code action offers to add the missing constants directly from the squiggle. The diagnostic clears immediately after constants are added — the extension watches the `.cwproj` file for any external changes too.

**Bug Fixes**

- 🐛 **Find All References / Rename Symbol**: procedure-scope local variables and parameters are now found inside locally-derived class method bodies (issue #78).Clarion's language spec states that methods prototyped in a CLASS declared within a procedure's local data section share the declaring procedure's full local scope. Previously, `finishesAt` (set for folding) was also used as a hard scope boundary, cutting off any method implementations that appear after the parent procedure's data section. The fix extends the search to include all method implementation bodies whose class name matches a locally-declared class in the scope procedure's data section, guarded against cross-file contamination by requiring no intervening global procedure between the scope boundary and the implementation.
- 🐛 Variable hover no longer appends a spurious "EQUATE Definition" block from the structure index — `enhanceHoverWithClassInfo` now only enriches hover when the variable's type resolves to a `CLASS` or `INTERFACE` in the index; primitive type names such as `LONG` that happen to match an equate in a library file (e.g. `ABUTIL.INC`) are no longer shown
- 🐛 Commented-out `INCLUDE` statements (e.g. `!INCLUDE('StringTheory.inc')`) are no longer treated as active includes by the missing-include diagnostic.
- 🐛 False-positive missing-include / missing-constants diagnostics on built-in type names (issue #85): The structure declaration indexer now correctly handles blank-label `ITEMIZE` blocks (e.g. `ITEMIZE,PRE(CLType)` with no label at column 0, as found in `XMLType.inc` and similar library files). Previously such entries were indexed as bare standalone equates (`BYTE`, `SHORT`, `REAL`, etc.), causing spurious warnings. They are now indexed with the correct PRE-prefixed names (`CLType:BYTE`, etc.) and — equally important — the missing-include and missing-constants validators now only fire on `CLASS` and `INTERFACE` definitions, ignoring EQUATE/ITEMIZE entries from the index.
- 🐛 False-positive `BREAK used outside LOOP` diagnostics (issue #86): The Clarion equate idiom `token:function` was incorrectly matching the `/\bFUNCTION\b/i` pattern (`:` is a non-word character, so `\b` fired between `:` and `f`). This reset `inCodeSection` to `false` mid-method, causing the tokenizer to silently skip `IF`/`CASE` structures, which in turn made `BREAK`/`CYCLE` diagnostics fire outside their containing loop.
- 🐛 False-positive missing-include diagnostics for transitively-included types: the include verifier previously only checked direct `INCLUDE` statements of the current file and its `MEMBER` parent. Types defined in files included transitively (e.g. `FileA.clw → FileA.Inc → DriverClass.Inc`) were incorrectly flagged. The verifier now performs a full BFS walk of the include graph (any depth, cycle-safe) from both the current file and the MEMBER parent.

---

### [0.9.5] - 2026-04-21

**Hover Documentation — Major Expansion (310 built-ins, 158 attributes)**

- ✨ Hover documentation for Clarion compiler directives: `ITEMIZE`, `SECTION` (new); existing `ASSERT`, `BEGIN`, `COMPILE`, `EQUATE`, `INCLUDE`, `OMIT`, `SIZE` already covered
- ✨ Builtin hover now narrows overloads by first-argument type — e.g. hovering `OPEN(Window)` shows only the `WINDOW` overloads, not all 8 signatures; labels are enriched with `structureType` (FILE, VIEW, WINDOW, REPORT, etc.) during document processing (#74)
- ✨ Context-aware hover for `HIDE`, `DISABLE`, and `TYPE` — inside a WINDOW/REPORT structure shows the control attribute usage and PROP: equate; outside shows the statement/function usage
- ✨ Method hover redesigned for clarity — structured sections with type, scope, signature, and description (no longer shows F12/Ctrl+F12 navigation hints)
- ✨ Hover documentation for data types `BFLOAT4`, `BFLOAT8`, and `VARIANT` (OLE API)
- ✨ Hover documentation for report band structures: `DETAIL`, `HEADER`, `FOOTER`, `FORM`
- ✨ Hover documentation for file I/O built-ins: `BUILD`, `HOLD`, `LOCK`, `UNLOCK`, `FLUSH`, `SHARE`, `RESET`
- ✨ Hover documentation for data statement built-ins: `REGET`, `MAXIMUM`, `POSITION`, `GETSTATE`, `RESTORESTATE`, `FREESTATE`, `STATUS`, `CONTENTS`, `UNBIND`, `FIXFORMAT`, `UNFIXFORMAT`, `GETNULLS`, `SETNULLS`, `SETNULL`, `SETNONULL`
- ✨ Hover documentation for graphics drawing built-ins: `ARC`, `BOX`, `CHORD`, `ELLIPSE`, `LINE`, `PENCOLOR`, `PENSTYLE`, `PENWIDTH`, `PIE`, `POLYGON`, `ROUNDBOX`, `SETPENCOLOR`, `SETPENSTYLE`, `SETPENWIDTH`
- ✨ Hover documentation for OCX/OLE built-ins: `OCXLOADIMAGE`, `OCXREGISTEREVENTPROC`, `OCXREGISTERPROPCHANGE`, `OCXREGISTERPROPEDIT`, `OCXSETPARAM`, `OCXUNREGISTEREVENTPROC`, `OCXUNREGISTERPROPCHANGE`, `OCXUNREGISTERPROPEDIT`, `OLEDIRECTORY`
- ✨ Hover documentation for Windows registry and INI file built-ins: `DELETEREG`, `GETREG`, `GETREGSUBKEYS`, `GETREGVALUES`, `PUTREG`, `GETINI`, `PUTINI`
- ✨ Hover documentation for window/event built-ins: `ASK`, `ALIAS`, `BEEP`, `BLANK`, `EVENT`, `POST`, `FIELD`, `SELECT`, `SELECTED`, `CLONE`, `DESTROY`, `ENABLE`, `UNHIDE`, `FREEZE`, `UNFREEZE`, `SHOW`, `KEYBOARD`, `KEYSTATE`, `FOCUS`, `IDLE`, `SHUTDOWN`, `YIELD`, `KEYCHAR`, `FIRSTFIELD`, `LASTFIELD`, `IMAGE`, `INCOMPLETE`, `FORWARDKEY`, `DRAGID`, `DROPID`, `ERASE`, `HELP`, `UPDATE`
- ✨ Hover documentation for mixed built-ins (batch 2): `CHANGES`, `CHOICE`, `CLIPBOARD`, `COLORDIALOG`, `COMMAND`, `COMMIT`, `EMPTY`, `ENDPAGE`, `ERRORFILE`, `EVALUATE`, `GETFONT`, `GETPOSITION`, `HALT`, `INLIST`, `INRANGE`, `ISALPHA`, `ISLOWER`, `ISSTRING`, `ISUPPER`, `POPUP`, `PRESS`, `PRESSKEY`
- ✨ Hover documentation for mixed built-ins (batch 3): `CHAIN`, `FONTDIALOG`, `FONTDIALOGA`, `GETEXITCODE`, `LONGPATH`, `NOMEMO`, `NOTIFICATION`, `NOTIFY`, `PACK`, `PRINT`, `RELEASE`, `RESUME`, `RIGHT`, `ROLLBACK`, `RUN`, `RUNCODE`, `SEND`, `SETCLIPBOARD`, `SETCLOCK`, `SETCOMMAND`, `SETCURSOR`
- ✨ Hover documentation for mixed built-ins (batch 4): `SETFONT`, `SETPOSITION`, `SHORTPATH`, `SUSPEND`, `THREAD`, `WATCH`, `SETTARGET`, `SETEXITCODE`, `POPERRORS`, `PUSHERRORS`, `PUSHBIND`, `POPBIND`, `BINDEXPRESSION`, `LOCALE`, `THREADLOCKED`, `LOCKTHREAD`, `UNLOCKTHREAD`, `INSTANCE`
- ✨ Hover documentation for remaining built-ins (batch 5): `CALL`, `CALLBACK`, `CONVERTANSITOOEM`, `CONVERTOEMTOANSI`, `MOUSEX`, `MOUSEY`, `POKE`, `PRINTERDIALOG`, `REGISTER`, `UNREGISTER`, `SET3DLOOK`, `SETDROPID`, `SETKEYCHAR`, `SETKEYCODE`, `SETPATH`, `SETTODAY`, `SKIP`, `SQL`, `SQLCALLBACK`, `SQRT`, `STREAM`, `TIE`, `TIED`, `UNTIE`, `UNLOAD`
- ✨ Hover documentation for 55 missing attributes: `ABSOLUTE`, `ALONE`, `ANGLE`, `AUTOSIZE`, `AVE`, `BINARY`, `CLIP`, `CNT`, `COMPATIBILITY`, `CURSOR`, `DELAY`, `DOCUMENT`, `DRAGID`, `DROPID`, `DUP`, `FILTER`, `FIRST`, `INNER`, `INS`, `JOIN`, `LANDSCAPE`, `LAST`, `LINEWIDTH`, `MIN`, `MM`, `NOCASE`, `NOMERGE`, `NOSHEET`, `OEM`, `OPEN`, `OPT`, `ORDER`, `OVR`, `PAGE`, `PAGEAFTER`, `PAGEBEFORE`, `PAGENO`, `PALETTE`, `PAPER`, `POINTS`, `PREVIEW`, `PRIMARY`, `RESET`, `ROUND`, `SPREAD`, `STD`, `STEP`, `STRETCH`, `SUM`, `TALLY`, `THOUS`, `TOGETHER`, `TRN`, `UP`, `DOWN`, `VCR`, `WITHNEXT`, `WITHPRIOR`, `WIZARD`, `ZOOM`
- ✨ Hover documentation for 7 additional window/report attributes: `ABOVE`, `BELOW`, `EXTEND`, `LAYOUT`, `REPEAT`, `SMOOTH`, `VERTICAL`

**Solution & Build Integration**

- ✨ Projects now sorted by build order (dependency-first) in the Solution View
- ✨ Active build configuration auto-detected from `.sln.cache` on solution open — no longer defaults to the first config in the list
- 🐛 Fixed MSBuild integration: correct `Platform` property quoting, skip `Platform=Any CPU` for native projects, per-project log files, Clarion native error format detection
- 🐛 Fixed duplicate cwproj GUIDs causing `ProjectDependencyResolver` to fail silently
- 🐛 Fixed missing completion message at end of dependency analysis

**Bug Fixes**

- 🐛 **SDI startup crash (EISDIR)** — the StructureDeclarationIndexer (SDI) was attempting to read the project directory as a file when the redirection file setting was not yet configured (before solution load), causing an `EISDIR` error and an empty declaration index. Three-layer fix: (1) bail early in the redirection parser when `redirectionFile` is empty; (2) return an uncached empty index from `getOrBuildIndex` to prevent cache pollution; (3) clear the SDI cache when the solution sends the `redirectionFile` path via `clarion/updatePaths`. This resolves hover and Go To Definition failures for symbols from INCLUDE files on first open.
- 🐛 `LIKE(TypeName)` dot-access chains now resolve correctly in hover and Go To Definition — e.g. `SELF.OrigWin.Maximized` where `OrigWin` is declared `LIKE(WindowPositionGroup)` now navigates to the `Maximized` field in the GROUP; colon-qualified names such as `LIKE(PYA:RECORD)` are also supported (closes #76)
- 🐛 Equate hover no longer shows `UNKNOWN` as the type (e.g. `Resize:LockWidth EQUATE(00000001b)` now shows `EQUATE` correctly)
- 🐛 Equate hover now correctly shows `EQUATE` type for equates declared with a space before the parenthesis (e.g. `CREATE:combo EQUATE (15)`)
- 🐛 Equate hover now shows "Global constant" / "Module constant" instead of "Global variable" for `EQUATE` declarations
- 🐛 Shorthand MAP/MODULE parameter types no longer mistaken for the procedure return type
- 🐛 `KEY` used as a parameter type in MAP/MODULE declarations no longer appears in the outline view
- 🐛 `DLL` and `LINK` attribute flags now accept any user-defined compilation symbol (not just a hardcoded set)
- 🐛 Removed directive hover entries that duplicated built-in hover coverage
- 🐛 Removed duplicate `VAL` built-in and merged duplicate `AUTO` attribute entries

---

### [0.9.4] - 2026-04-19

**Release fix** — the v0.9.3 release package was built before all branch commits were pushed to origin, so 50+ commits were missing from the published VSIX. This release includes everything that was intended for v0.9.3:

- ✨ Hover documentation for `PROP:`, `PROPPRINT:`, and `EVENT:` equates (336 + 25 + 63 entries)
- ✨ Autocomplete for `PROP:`, `PROPPRINT:`, and `EVENT:` equates
- ✨ CodeLens inline reference counts above procedures and CLASS declarations (#72)
- ✨ Flatten continuation lines code action (#70)
- ✨ Expand Selection through structure nesting — `Shift+Alt+→` (#71)
- ✨ Warn on discarded plain MAP/MODULE procedure return values (#51)
- 🐛 INTERFACE member hover, go-to-definition, and Find All References for `&IfaceName` variables
- 🐛 Reference variable hover shows correct type instead of `STRING`
- 🐛 Reserved keywords used as labels now flagged as diagnostics (#69)
- 🔧 Formatter: 6 bugs resolved (#66)
- 🐛 Tokenizer: structure keywords at col 0 tokenize as labels (#68)
- 🐛 Fix false-positive unreachable code after multiple `IF..RETURN..END` blocks (#67)
- 🔧 Refactor DiagnosticProvider into focused sub-modules
- 🐛 Fix diagnostics flashing and disappearing on file open

See [0.9.3] below for full details.

---

### [0.9.3] - 2026-04-19

**Bug Fixes**

- 🐛 **Fix diagnostics flashing then disappearing on file open** — Discarded-return-value warnings were emitted immediately on `onDidOpen` (107 warnings in test cases) then cleared to zero ~30ms later when `solutionReady` re-validated the same document. Root cause: `DocumentStructure.process()` was being called **twice** on the same token array — once inside `ClarionTokenizer.tokenize()` and once in `TokenCache.getTokens()`. Because `process()` mutates tokens in-place and is not idempotent, the second pass corrupted `MapProcedure` subType assignments (count ballooned from 21 → 178 in affected files), which caused the deduplication logic in `validateDiscardedReturnValuesForPlainCalls` to move all procedures into the `excluded` set → 0 diagnostics. Fixed by: (1) storing the `DocumentStructure` instance created inside `ClarionTokenizer.processDocumentStructure()` and exposing it via `getDocumentStructure()`; (2) having `TokenCache.getTokens()` reuse that instance instead of constructing a new one and calling `process()` again; (3) skipping `processDocumentStructure()` on the partial-line tokenizer used in the incremental update path (the final merged-token `DocumentStructure.process()` is the single authoritative pass). Also fixed `DocumentStructure.buildParentIndex()` which was called in the constructor before `process()` had set `finishesAt` and `subType` values — it is now rebuilt at the end of `process()` using the fully populated token data.

**Tokenizer & Outline**

- 🐛 **Fix WINDOW (and other structure keywords) used as labels in the outline** ([#68](https://github.com/msarson/Clarion-Extension/issues/68)) — the Clarion language spec explicitly allows `WINDOW`, `CLASS`, `FILE`, `GROUP`, `QUEUE`, `VIEW`, `RECORD`, `MAP`, `MODULE`, `INTERFACE`, and `REPORT` to be used as data-structure labels. The tokenizer's Label pattern was incorrectly excluding all of these keywords via a negative lookahead, so a line like `Window  WINDOW('Caption'),...` caused `W` to be silently skipped and `indow` to be produced as a spurious Variable token. This left the WINDOW structure with no label, resulting in two outline entries instead of one. Fixed by removing all structure keywords from the Label exclusion list (keeping only the truly reserved words: `COMPILE`, `OMIT`, `EMBED`, `SECTION`, `ENDSECTION`, `INCLUDE`, `PROGRAM`, `MEMBER`, `END`). The `PatternMatcher` `lower` charClass was also missing `TokenType.Label`, meaning lowercase-starting labels such as `window` were never matched as labels; this has been corrected.

**Formatter**

- 🔧 **Fix document formatter — 6 bugs resolved** ([#66](https://github.com/msarson/Clarion-Extension/issues/66)):
  - 🐛 Procedures and routines were not being detected correctly due to a wrong `subType` check, causing local data sections and execution ranges to be misidentified.
  - 🐛 Single-line structures (open and close on the same line) were indented using a hardcoded minimum instead of the current indent stack level.
  - 🐛 Formatted output always used CRLF regardless of the source file's line endings; the formatter now preserves the original EOL style.
  - 🐛 Dot-notation method implementations (e.g. `ThisWindow.Init PROCEDURE`) lost the dot — the formatter emitted `ThisWindow  Init PROCEDURE`. The full label text including dot is now preserved.
  - 🐛 `CLASS`/`GROUP`/`QUEUE` declarations inside a procedure's local data section were treated as flat variables. This caused the structure body (`END` and member declarations) to use incorrect indentation. Structures now push to the indent stack even inside local data sections.
  - 🐛 Within a `CLASS` body, each method's `PROCEDURE` keyword was aligned independently per label length, producing ragged columns. All method keywords now align to a single shared column determined by the longest method label in the class.
  - 🐛 `CLASS` keyword column in a local data section did not match the type-keyword column of surrounding variable declarations. It now uses the same `snap0(maxLabel+1)` formula as all other local data lines.

**Diagnostics**

- 🐛 **Diagnose reserved keywords used as labels** ([#69](https://github.com/msarson/Clarion-Extension/issues/69)) — the Clarion language spec defines two categories of reserved words. *Fully reserved* keywords (`RETURN`, `WHILE`, `CYCLE`, `GOTO`, `PROCEDURE`, etc.) may never be used as labels. *Structure-only* keywords (`WINDOW`, `CLASS`, `QUEUE`, etc.) may label data structures but not `PROCEDURE` or `FUNCTION` declarations. The new `LabelDiagnostics` validator flags both violations as errors. Matching is case-insensitive (Clarion is case-insensitive). Valid uses — such as `WINDOW` labelling a `WINDOW` structure, or `CLASS` labelling a `CLASS` structure — are not flagged.

**Code Actions**

- ✨ **Flatten continuation lines** (`Ctrl+.` → "Flatten continuation lines") ([#70](https://github.com/msarson/Clarion-Extension/issues/70)) — Clarion uses `|` at end-of-line to continue long expressions across multiple source lines. A new Code Action appears (via the lightbulb or `Ctrl+.`) whenever the cursor is on a line that is part of a `|` continuation group. Activating it joins the group into a single line, trimming leading whitespace from continuation lines and collapsing adjacent string literals joined by `&` (e.g. `'abc' & 'def'` → `'abcdef'`). When a selection spanning multiple lines is active, only the selected lines are flattened; otherwise the full continuation group around the cursor is found automatically. The `|` detection is string-safe: a pipe character inside a Clarion string literal (including strings with `''` escaped quotes) is never treated as a continuation marker.

**Editor Navigation**

- ✨ **Expand Selection through structure nesting** (`Shift+Alt+→` / `Shift+Alt+←`) ([#71](https://github.com/msarson/Clarion-Extension/issues/71)) — the extension now implements the LSP `SelectionRangeProvider`. Pressing **Shift+Alt+→** progressively widens the selection through Clarion's scope hierarchy: current token → current line → innermost containing structure/procedure/routine → parent structure → … → whole document. **Shift+Alt+←** shrinks back through the same chain. Works for all container types: `PROCEDURE`, `ROUTINE`, `CLASS`, `WINDOW`, `QUEUE`, `GROUP`, `RECORD`, `FILE`, `VIEW`, `REPORT`, etc.

- ✨ **CodeLens: inline reference counts above procedures** ([#72](https://github.com/msarson/Clarion-Extension/issues/72)) — the editor now shows `N references` (or `1 reference`) inline above each procedure and CLASS declaration, similar to TypeScript/C# support in VS Code. The count is computed lazily (resolve phase) so it only runs for lenses visible in the viewport, not the whole file at once. Clicking the lens opens the standard References panel at that symbol. Shows `0 references` too — useful for spotting dead code.

- 🐛 **Fix false-positive "unreachable code" after multiple sequential `IF..RETURN..END` blocks** ([#67](https://github.com/msarson/Clarion-Extension/issues/67))— when a string literal in a Trace call (e.g. `Trace('...function pointers...')`) appeared on a line before the second `IF`, the tokenizer matched the word `function` inside the string and incorrectly reset `inCodeSection = false`. This caused the second `IF` to be skipped as an "execution structure before CODE", leaving `UnreachableCodeProvider` with no stack entry for it. Any subsequent `RETURN` inside that block then appeared at procedure level, causing all code after the `IF..END` to be flagged as unreachable. Fixed by stripping string literals (and comments) from the line before checking for `PROCEDURE`/`FUNCTION` keywords.

- ⚠️ **Warn on discarded plain MAP/MODULE procedure return values**([#51](https://github.com/msarson/Clarion-Extension/issues/51)) — a new warning fires when a plain (non-dot-access) call to a MAP or MODULE procedure that returns a value is used as a statement without capturing the result. Covers procedures declared directly in a `MAP` block, inside a `MODULE(...)` within a MAP, and in local procedure MAPs. Cross-file detection is supported: procedures declared in a global MAP in the program file (or any other cached file) are also checked when called from a MEMBER file. Add the `PROC` attribute to the declaration, or assign the return value, to suppress the warning.
- ⚠️ **Warn on BREAK/CYCLE outside LOOP or ACCEPT** ([#64](https://github.com/msarson/Clarion-Extension/issues/64)) — a new warning fires when `BREAK` or `CYCLE` appears outside any `LOOP` or `ACCEPT` structure. Both constructs are valid anywhere inside a `LOOP` or `ACCEPT` block (including nested blocks). Labeled forms (`BREAK Label` / `CYCLE Label`) are excluded from this check as they are addressed separately in issue #65.

**Code Quality**

- 🔧 **Refactor DiagnosticProvider into focused sub-modules** — the 1943-line `DiagnosticProvider.ts` has been split into four focused helper modules in `server/src/providers/diagnostics/`: `StructureDiagnostics.ts`, `ClassDiagnostics.ts`, `ReturnValueDiagnostics.ts`, and `ControlFlowDiagnostics.ts`. `DiagnosticProvider` is now a thin facade that delegates to these modules, making the code easier to maintain and extend.

**Hover**

- ✨ **Hover documentation for `PROP:` and `PROPPRINT:` runtime properties** ([#73](https://github.com/msarson/Clarion-Extension/issues/73)) — hovering over any Clarion runtime property equate now shows documentation sourced from the Clarion 11.1 Language Reference. Covers 336 `PROP:` entries (window/control/file/system properties) and 25 `PROPPRINT:` printer control properties (`PROPPRINT:Device`, `PROPPRINT:Copies`, `PROPPRINT:Paper`, etc.). Read-only properties are labelled accordingly. `PROPPRINT:` hovers show a printer-appropriate usage example (`PRINTER{PROPPRINT:Device}`). Works wherever property equates appear in code.
- ✨ **Hover and autocomplete for `EVENT:` equates** ([#74](https://github.com/msarson/Clarion-Extension/issues/74)) — hovering over any Clarion event equate (e.g. `EVENT:Accepted`, `EVENT:CloseWindow`, `EVENT:Timer`) now shows a description, category (Field-Specific / Field-Independent / DDE), and a usage example. Autocomplete fires when typing `EVENT:` (or after the colon), listing all 62 event equates with category and description in the detail column. DDE events are included.

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
