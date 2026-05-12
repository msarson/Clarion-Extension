# Changelog

All notable changes to the Clarion Extension are documented here.

---

## Recent Versions

### [0.9.7] - Unreleased

**New Features**

- ✨ **Extension stays dormant in non-Clarion workspaces** (#143): `activationEvents` tightened from `onStartupFinished` (broad) to `onLanguage:clarion` + `workspaceContains:**/*.{clw,inc,equ,int,app,sln,cwproj}`. The extension only activates when a Clarion file is opened or the workspace contains one — no status bar item, no LSP server, no overhead in non-Clarion projects. Reinforces the no-solution-mode UX narrative ("extension doesn't intrude when no Clarion context at all").
- ✨ **Per-solution version reconciliation — three-layer storage substrate** (#141): each VS Code instance now has its own in-memory "effective active" Clarion version (L2) isolated from the cross-instance shared default (L1, settings.json) and per-solution recorded version (L3, globalState). Switching versions in one instance no longer silently propagates to others. Version picker gains a "⚙ Set as default for new solutions" footer; mid-session manual switches update the per-solution record. Q1/Q2/Q8 auto-firing prompts on solution-open ship in a follow-up (#154). See GH #141 for the full design + close-out narrative.
- ✨ **Two-stage version picker — Compile Target inside Clarion Installation** (#134): clicking the version status bar now shows a two-stage QuickPick — Stage 1 lists Compile Targets within the active Clarion Installation (with a "↩ Switch Clarion installation…" entry), Stage 2 lists Installations auto-discovered by `ClarionInstallationDetector`. First run jumps straight to Stage 2; the manual `ClarionProperties.xml` file-pick is preserved as an escape-hatch when nothing is auto-discovered.
- ✨ **Version status-bar item reads as a compile-target label** (#133): the version indicator now renders as `Compile: <version-entry-name> (from <ide-dir>)` with a tooltip carrying the full ClarionProperties.xml path, so the "running Clarion 11, compiling as Clarion 6" case is unambiguous at a glance.
- ✨ **Hover and Goto Implementation pick the right overload on typed-variable dot-access calls** (#125): hovering on or F12-from `st.SetValue('Hello World')` now shows / targets the `(STRING, LONG=default)` overload, matching Goto Definition. Same `CallSiteArgumentClassifier` + `findOverloadByArgClassifications` overlay pattern as the Definition wire-up; falls back to paramCount-only when args can't disambiguate. `HoverFormatter.formatClassMember` also reads from `TokenCache` before disk so hover content renders correctly for unsaved buffers.
- ✨ **Goto Definition picks the right overload on typed-variable dot-access calls** (#125): F12 on `st.SetValue('Hello World')` now resolves to the `(STRING, LONG=default)` overload, not the `(StringTheory)` one — Mark's repro from #120 follow-up. New `MethodOverloadResolver.findAllMethodDeclarations` substrate exposes candidate decls without paramCount-picking; DefinitionProvider's typed-var path layers `CallSiteArgumentClassifier` + `findOverloadByArgClassifications` on top. Hover + Impl wire-up follows in the same task.
- ✨ **WordCompletion surfaces class methods + accumulates overload signatures in `detail`** (#125): `SetValue` (and other class methods declared in the current file) now appears in bare-prefix completion alongside MAP procedures and globals. For overloaded procedures/methods, the `detail` field lists all variants — Mark's "present all" framing for completion-time disambiguation (no args typed yet so no arg-classification possible). First step of #125 Phase B; Def/Hover/Impl typed-var wire-up follows.
- ✨ **Indistinguishable-prototype diagnostic extends to scalar-pair detection** (#123): the #121 walker now also flags pairs of same-name decls where both params are scalar (string-family ∪ numeric-family), covering same-family pairs (`Func(LONG)` + `Func(SHORT)`) AND cross-family pairs (`Func(LONG)` + `Func(STRING)`) per Mark's 2026-05-11 empirical verdict on Clarion's bidirectional implicit conversion. Class-vs-scalar, `*LONG` by-ref discriminator, and arity discriminator counter-examples all preserved.
- ✨ **Diagnostic: detect indistinguishable procedure prototypes** (#121): Warning fires on duplicate decls within CLASS / INTERFACE / MAP scopes (module-level + procedure-local) that the Clarion compiler treats as illegal — zero-arity overlap, structural identity (documentary labels ignored), and complex-type `*` redundancy (`Foo(StringTheory)` ≡ `Foo(*StringTheory)`). Configurable via `clarion.diagnostics.indistinguishablePrototypes.enabled` (default `true`).
- ✨ **Hover data taxonomy refactor — keywords / directives / built-ins separated** (#77): 32 keywords moved to new `clarion-keywords.json` and 6 directives into existing `clarion-directives.json`; new `KeywordService` mirrors `DirectiveService`. No user-visible change.
- ✨ **Find All References / Rename scope isolation for local MAP procedures** (#91, #95): FAR + Rename now correctly restrict to files reachable via the same procedure-local MAP scope; hover on a local-MAP procedure call in a MEMBER file is also correctly scoped.
- ✨ **Save before build** (#88): new `clarion.saveBeforeBuild` setting (default `true`) saves all unsaved open files before any build is triggered.
- ✨ **Diagnostic: procedure missing MAP declaration** (#89): MEMBER-file Warning on `GlobalProcedure` implementations with no matching declaration in the parent PROGRAM's `MAP/MODULE`. Method implementations (`MyClass.Method`) excluded.
- ✨ **F5 — Launch Clarion Debugger** + **Ctrl+F5 — Build prompt before run** (#100): F5 launches `CladbNE.exe` against the startup project's exe; Ctrl+F5 prompts Build/Run/Cancel before launch. Debugger path auto-derived from the Clarion bin folder.
- ✨ **Clarion IDE preferences sync** (#101): reads + writes back `%AppData%\SoftVelocity\Clarion\<version>\preferences\<sln>.<hash>.xml` so VS Code and the Clarion IDE share the same active startup project + build configuration.
- ✨ **Clarion Actions toolbar** (#102): new Explorer-sidebar **Actions** panel with Build / Run / Debug / Open / Close buttons + summary of solution name, startup project, and active build configuration.
- ✨ **Add MODULE with PROCEDURE code action** (#87): `Ctrl+.` inside a MAP block creates a new CLW (filename + procedure name prompted), inserts the MODULE block, registers the file in `.cwproj`, and opens it. Local-MAP variant declares the procedure inside its own `MAP/END`.
- ✨ **Quick-fix code actions for MAP diagnostics** (#90): `Ctrl+.` on any MAP declaration/implementation diagnostic offers targeted quick fixes — Add declaration, Add implementation, Update-declaration-to-match, Update-implementation-to-match.
- ✨ **Add PROCEDURE code action from MAP** (#87): `Ctrl+.` inside a MAP block (outside any MODULE) inserts the prototype + appends the implementation to the end of the current file.
- ✨ **`clarion.procedurePrototypeStyle` setting** (#87): chooses the prototype form for MAP/MODULE inserts. `"keyword"` (default): `ProcName PROCEDURE()`. `"shorthand"`: `ProcName()` with correct indentation.
- ✨ **MAP diagnostics for local and self-declared MODULE scopes** (#91): signature-mismatch diagnostics now fire for procedure-level MAPs and `MODULE('thisfile.clw')` self-declarations; `validateMissingImplementations` now also runs on MEMBER files.
- ✨ **Multi-file "update all declarations" quick-fix** (#91): a signature-mismatch fix via `Ctrl+.` now updates every file declaring the procedure (via `FileRelationshipGraph.getModuleDeclarants`); action title shows "(N files)" when multiple files are affected.
- ✨ **Warn on non-Windows-1252 characters** (#82): Warning diagnostic on any character with code point > 0xFF in `.clw`/`.inc`/`.equ`/`.int` files; `Ctrl+.` quick-fix replaces with ASCII equivalents or deletes; bulk "Fix all N invalid characters" action when multiple issues exist.
- ✨ **`isControlKeyword` consults `ControlService` — single source of truth** (#99): Gap J — `DocumentStructure.isControlKeyword` delegates to `ControlService.getInstance().isControl()`; recognised set is the union of `windowControls` + `reportControls` from `clarion-controls.json` so adding a new control to JSON automatically grows DocumentStructure's classification.
- ✨ **VIEW block helpers + structured descriptor** (#99): Gap L — each VIEW parsed into a `ViewDescriptor` (source file, projected fields, JOINs); new `getViews()`/`getViewDescriptor()`/`isInViewBlock()` API; HoverProvider's VIEW keyword renders source file + projected-field count + JOIN summary.
- ✨ **Continued-line joiner — `getLogicalLine(line)`** (#99): Gap P — joins `|`-continued physical lines into a single logical string with comments stripped + column back-translation for LSP Range reporting; consumers can regex-parse multi-line declarations directly.
- ✨ **PROGRAM / MEMBER document helpers + hover** (#99): Gap N — `getDocumentKind()`, `getProgramName()`, `getMemberParent()` read the leading `ClarionDocument` token; PROGRAM/MEMBER hover now shows program name or parent module instead of generic keyword tooltip.
- ✨ **Reverse IMPLEMENTS index — interface → implementing classes** (#99): Gap H — `getImplementors(interfaceName)` returns every CLASS in the file that implements the named interface; `findInterfaceReferences()` returns the IMPLEMENTS()-clause name tokens; HoverProvider's INTERFACE hover lists implementing classes in the same file.
- ✨ **EQUATE / ITEMIZE block index in DocumentStructure** (#99): Gap B — EQUATE Labels (plain + ITEMIZE-block members with `prefixedEquateName` PRE-expanded form) indexed by name; new `getItemizeBlocks()`/`getItemizeMembers()`/`findEquate()`/`getEquates()` API; tokenizer whitelist alignment for ITEMIZE in `STRUCTURE_PATTERNS` shipped with the same task.
- ✨ **FieldEquate (`?Ctrl`) index + USE() target resolution** (#99): Gap C — every `?Name` field-equate token indexed flat + per-container; USE keyword's argument resolved to bound symbol via `linkedTo?: Token`; `getControlsInStructure()`/`findControl()`/`getBoundTarget()`/`findReferencesToControlInFile()` API. v1 covers `USE(?Name)`, `USE(VarName)`, `USE(?)`.
- ✨ **`getStructureContextAt` — single source of truth for "what container am I in"** (#99): Gap K — returns innermost-first chain of containing structures + enclosing scope token + `inMap`/`inModule`/`inClass`/`inWindow`/`inView` flags; older boolean helpers become deprecated shims.
- ✨ **User EQUATE labels surface as constants in word completion** (#99): Gap I — user-defined `EQUATE` labels offered as `Constant` completion items with `EQUATE(value)` form in detail column (previously tagged as plain `Variable` with no value).
- ✨ **Context-aware attribute completions and diagnostics** (#80): word completions inside a control declaration filtered by surrounding context; new `invalid-attribute-context` Warning when an attribute is used on a control type that doesn't support it (uses `applicableTo` metadata).
- ✨ **Document links moved to language server** (#92, #96): `DocumentLinkProvider` for INCLUDE/MODULE/MEMBER/LINK now server-side via LSP `textDocument/documentLink` using `FileRelationshipGraph` directly — eliminates startup timing bugs where library-path includes failed to resolve until the cache was populated.
- ✨ **Rename Symbol — block ,DLL and unresolvable-MODULE procedures** (#93): F2 refuses to rename procedures declared with `,DLL` or whose parent `MODULE('x.clw')` cannot be resolved through any project's redirection parser; bare `MODULE` with no parenthesised filename also rejected.
- ✨ **Diagnostic: ITEMIZE block must contain only EQUATE declarations** (#99): Gap B follow-up — `itemize-non-equate` Warning on any non-EQUATE column-0 declaration inside an ITEMIZE; nested ITEMIZE handled by independent inner-pass validation; comments / blank lines / END terminator unaffected.
- ✨ **Labelled `LOOP` / `ACCEPT` + `BREAK <Label>` / `CYCLE <Label>` validation** (#65): tokenizer + DocumentStructure associate leading labels with their LOOP/ACCEPT structure; `resolveLoopLabel(name, fromLine)` for innermost-match lookup; ControlFlowDiagnostics warns on unresolved labels.
- ✨ **Diagnostic: VIEW `PROJECT(field)` validated against FROM file's RECORD** (#99): Gap L follow-up — `view-project-unknown-field` Warning when `VIEW(SomeFile)` projects a field name not on the FROM file's RECORD; bare and prefix-form names matched case-insensitively; v1 single-document only.
- ✨ **VIEW PROJECT/JOIN validator — cross-file FROM resolution + JOIN field validation** (#99): two extensions over v1 — cross-file FROM via `INCLUDE`/`MEMBER` chain walk (1-hop fan-out) and JOIN field validation against joined file's RECORD; both inherit v1's false-positive-trust contract (silent skip when target file unresolvable).
- ✨ **Undeclared-variable diagnostic — dotted-access leading scope (`Obj.Field`)** (#62): v2 sub-feature 3 — flags the leading scope name in dotted-access expressions when undeclared (`BogusObj.Field = 1` warns on `BogusObj`); built-in scopes (SELF/PARENT) and prefixed/indexed/field-equate forms still skipped.
- ✨ **Undeclared-variable diagnostic — IF / WHILE / UNTIL / CASE / OF / OROF / ELSIF condition expressions** (#62): v2 sub-feature 2 — flags bare-identifier references inside conditional / loop / case condition expressions; condition scan stops at first `THEN` keyword on the line.
- ✨ **Undeclared-variable diagnostic — RHS expressions on assignment lines** (#62): v2 sub-feature 1 — flags bare-identifier references on right-hand side of assignment (`MyVar = BogusName + 1` warns on both); hex/binary/octal numeric-suffix safety guard added (`pAdr = 1000h` doesn't fire false positive on `h`).
- ✨ **Diagnostic: undeclared variable on LHS of assignment** (#62): v1 — Warning on `Foo = 1` when `Foo` not declared in current file. Enabled by default; disable via `clarion.diagnostics.undeclaredVariables.enabled = false`. v1 covers bare-identifier LHS only; prefixed/dotted/indexed/field-equate forms intentionally skipped.

**Bug Fixes**

- ⚡ **Startup performance — diagnostic validators optimized** (#158): adds togglable `perfLogger` instrumentation across the LSP startup chain; memoizes `MemberLocator` lookups in `validateDiscardedReturnValues` (per-call-site Promise cache keyed by receiver+method+paramCount+self-context — eliminated redundant cross-file resolution on hot files); skips async validator pass for files inside `serverSettings.libsrcPaths` (library files are read-only by convention; sync diagnostics still run).
- 🐛 **Version `.red` redirection parsing in no-solution mode** (#156): `findFileNoSolution` now delegates to `RedirectionFileParserServer.findFile()` after the localDir tier, walking pattern-matched `.red` entries (e.g. `*.equ = .;equates;libsrc\win`) + libsrcs in one chain. Pre-#156, files routed to subdirectories not in flat `libsrcPaths` were unreachable when no solution was loaded; the version's `.red` is now the source of truth for redirection in no-solution mode, matching the Clarion IDE precedent.
- 🧹 **Remove vestigial dead methods in `DefinitionProvider` + `FileDefinitionResolver`** (#138): drops ~227 lines of unused method bodies (`DefinitionProvider.findDefinitionInIncludes` + `DefinitionProvider.findFileDefinition` + `FileDefinitionResolver.findGlobalDefinition`) identified during the 403afd0e D1 audit — parallel-structure duplicates of methods that already lived (and are actively called) in the utility class. No behavior change.
- 🐛 **Actions pane webview no longer fails to load on service-worker registration race** (#148): visibility-flip re-render in `SolutionToolbarProvider` triggered repeated service-worker registration; widened post-#132 B3 activation flow turned a latent race into a deterministic `InvalidStateError: Could not register service worker` on every extension load. Fix: remove the visibility-flip re-render + add `retainContextWhenHidden: true` to the webview view registration so VS Code preserves webview state instead of tearing it down on hide.
- 🐛 **Solution does NOT auto-reopen after explicit close** (#146): adds a `clarion.solutionExplicitlyClosed` workspaceState flag — set by the close command, consumed by `initializeFromWorkspace` to suppress the #104 `solutions[0]` fallback. Non-close empty-`currentSolution` scenarios (migration, manual edit, extension upgrade) still auto-load per #104.
- 🐛 **Client-side no-solution-mode guards removed in `SolutionCache.findFileWithExtension`** (#113 B1): drops 3 `!solutionInfo`-class short-circuits — `:1719` (removed), `:1724` (removed), `:1767` (refined to `solutionInfo && projects.length===0` to preserve the startup-race intent while letting genuine no-solution mode proceed). Unlocks the client FS walk in `tryFindFileLocally` — already libsrcPaths-aware via dd87633f substrate — without needing a server round-trip for the happy path.
- 🐛 **Client passthrough propagates `sourceUri` to `clarion/findFile`** (#113 B2 client-half): `SolutionCache.findFileWithExtension` now sends `Uri.file(sourceFilePath).toString()` as the `sourceUri` param when a sourceFilePath is available, so the server's no-solution-mode resolver (#113 B2 server-half / f74e450) can compute `localDir = dirname(sourceUri)`. Solution-loaded callers unaffected.
- 🐛 **`clarion/findFile` resolves files in no-solution mode** (#113 B2 server-half): when no `.sln` is loaded, the LSP handler now walks `dirname(sourceUri)` → `serverSettings.libsrcPaths` → extension fallback (was previously a no-op). Request params gain optional `sourceUri`; client passthrough lands alongside on the shared `feat/113-no-solution-file-resolution` branch.
- 🐛 **SignatureHelp activeSignature uses partial-arg classification (ordering-agnostic)** (#126 B2): new `MethodOverloadResolver.findActiveOverloadByPartialArgs` predicate composes existing `scoreArgParam` over the user's partial-typed args; `SignatureHelpProvider.parseMethodCall` returns `argSegments`; a text-based classifier handles in-progress arg shapes (the token-based `CallSiteArgumentClassifier` needs closed `(...)`). Active overload is now picked by type-shape (literal_string → STRING decl, literal_numeric → numeric decl) regardless of file ordering in the INCLUDE.
- 🐛 **SignatureHelp candidate-builder routes through the MEMBER-aware substrate** (#126 B1): `getClassMethodSignatures` now uses `MethodOverloadResolver.findAllMethodDeclarationsIncludingIncludes` so the overload list reflects classes reached via MEMBER → PROGRAM → recursive INCLUDE (the same #128 substrate that fixed Def/Hover/Impl). Legacy `enumerateMembersInClass` fallback preserved for SELF-in-class paths the substrate doesn't cover.
- 🐛 **Revert `[#127-trace]` instrumentation post-#128 verification** (#127, #128): Mark confirmed F12 / Hover / Goto Implementation all work correctly on his real codebase; reverts the temporary diagnostic logging from `e798c23` and restores `MethodOverloadResolver` + `DefinitionProvider` logger levels to `error`. Pure revert; no production-logic change.
- 🐛 **Def / Hover / Impl walk MEMBER → PROGRAM → recursive INCLUDE chain for overload resolution** (#128): cross-file follow-up to #127 — Mark's real-world MEMBER files (e.g. `MyNextProcedure.clw` with `MEMBER('SimpleNewSln.clw')`) have zero direct INCLUDEs; StringTheory reaches scope via the PROGRAM's INCLUDE chain, possibly transitively. New `gatherScopeMethodDeclarations` walks Clarion's compilation model (MEMBER → PROGRAM via `FileRelationshipGraph.getProgramFile`, then BFS through INCLUDE edges with cycle-protection visited-set). FRG-not-ready soft fallback to legacy direct-INCLUDE walk.
- 🐛 **Def / Hover / Impl pick the right overload when the CLASS is in an INCLUDE'd file** (#127): cross-file follow-up to #125 — Mark's actual repro has StringTheory in `stringtheory.inc`, not in the same file. New `MethodOverloadResolver.findAllMethodDeclarationsIncludingIncludes` substrate gathers candidates from BOTH the current file AND INCLUDE'd files; the three providers' arg-classify overlays swap to the cross-file variant so `st.SetValue('Hello World')` correctly resolves to the `(STRING, LONG=default)` overload across file boundaries.
- 🐛 **Undeclared-variable diagnostic no longer flags Clarion operator keywords** (#124): `AND`, `OR`, `XOR`, `NOT`, `BAND`, `BOR`, `BXOR`, `BNOT`, `BSHIFT`, `TO`, `BY` in IF conditions or assignment RHS no longer fire false positives. Fix is two-part — `KeywordService.isKeyword` filter added at 3 walker call sites (parallel to `BUILT_IN_IDENTIFIERS`) plus 8 operator keywords added to `clarion-keywords.json`. `NOT` was already in the registry today but still fired — the missing filter call was the load-bearing bug.
- 🐛 **`MethodOverloadResolver` substrate for indistinguishable-prototype detection** (#121): adds `areZeroArityCompatible` + `arePrototypesIdentical` public helpers and normalizes complex-type `*` in `extractParameterType` per rule 6 — `*StringTheory` ≡ `StringTheory` while scalar `*STRING` ≠ `STRING` discriminator preserved. Diagnostic walker that emits the indistinguishable-prototype warnings follows in a separate phase.
- 🐛 **Overload resolution honours default parameters + permits cross-family literal conversion** (#120): `findOverloadByArgClassifications` arity filter is now default-aware (mirrors `selectBestOverload`), letting N-arg calls match (N+defaults)-param decls — fixes Mark's `StringTheory.SetValue('x')` repro where FAR / Goto-Def / Goto-Impl resolved to the wrong overload. `argMatchesParam` relaxed for cross-family literals with `scoreArgParam` natural-family-preference bias (natural=3, cross=1) so existing multi-overload pins stay GREEN.
- 🐛 **`MethodOverloadResolver` regex sites accept FUNCTION-shape signatures** (#122): the INCLUDE-file method-lookup regex (`:302`) and `extractParameterTypes` regex (`:400`) extended `PROCEDURE` → `(?:PROCEDURE|FUNCTION)`, completing the PROCEDURE/FUNCTION-equivalence sweep that landed in `55c0e4be`.
- 🐛 **Undeclared-variable diagnostic — cross-file scope resolution** (#115): the diagnostic no longer false-positives on identifiers declared at PROGRAM-scope or in the parent file when used from a MEMBER. Single-file fast-path preserved; misses fall through to `SymbolFinderService.findSymbol` for canonical 7-tier resolution.
- 🐛 `parseRedFileRecursiveAsync` now serialises `{include}` chains so the async parser produces interleaved-at-include-position flat-list ordering, matching sync semantics deterministically across multiple `{include}` directives (#98).
- 🐛 Redirection parser section-name comparisons (e.g. `[Debug]` vs `[debug]`) are now case-insensitive — defensive against hand-edited `.red` case drift (#98).
- 🐛 **FAR cross-file URI normalisation + cursor-in-PROGRAM globalScope asymmetry** (#97): closes a cluster of 4 silent-asymmetry bugs in cross-file FAR / F2-rename surfaced during the FRG-fixture-upgrade test backfill — `loadGlobalScopeForCursor` cursor-in-PROGRAM asymmetry, URI/FS-path normalisation in `gatherClassMemberOverloads`, cross-file `fileLines` for impl-discrimination, and case-insensitive `filesToSearch` / result dedup.
- 🐛 **FAR / F2-rename resolves caller-cursor on class-method dot-calls** (#97): closes the Mark-reported caller-cursor null symptom where FAR / F2 from a call site like `inst.Append('x')` returned null silently. Single-substrate rewire of `resolveViaVariableType`; same machinery now serves both cursor sides — closing the silent-asymmetry where F2 from a decl found callers but F2 from the call site returned null.
- 🐛 **FAR var-type lookup completes Tier 1 (Routine Local data) — closes 7-tier scope model + fixes latent shadowing regression in procedure-local resolution** (#97): adds routine-local with own-name-scope shadowing; companion fix excludes routine-bounded lines from the procedure-local walk (latent regression masked by Tier 1's absence). Both fixes required for bidirectional pin to flip GREEN.

- 🐛 **FAR / F2-rename on class methods finds cross-procedure callers — multi-file AND same-file — with per-overload type discrimination** (#97): closes the call-site → declaration overload resolution gap that left F2-rename silently missing real callers when a class method was invoked from a non-method procedure. New `CallSiteArgumentClassifier` util + `findOverloadByArgClassifications` resolver seam + match-all fallback + `(*TYPE)` strict-mode flag (default OFF). 6-tier scope coverage (params / proc-local / class-member-via-SELF / module / global; routine-local in #97 follow-up).
- 🐛 **Multi-file FAR scope test scaffolding helper** (#97): adds `MultiFileFARFixture` for cross-file FAR scenarios — mocks `SolutionManager.instance`, seeds `TokenCache` at canonical URI shape; foundation for FAR-family follow-ups.
- 🐛 **`pretest:server` script cleans stale test outputs from `out/` before suite** (#106): one-line `package.json` script (`rimraf out/server/src/test && tsc -b`) prevents stale `.js` from a paused branch's test file masking actual fix correctness.
- 🐛 **FAR on overloaded procedures returns only the matching overload** (#97): user-reported by Mark via `<ClarionRoot>\libsrc\win\stringtheory.inc:415` — F2-rename on one overload was renaming all 10. Wires `signaturesMatch` foundation into both plain-symbol and member-access paths so type-aware comparison rules out wrong-overload decls + impls.
- 🐛 **`MethodOverloadResolver.signaturesMatch(sigA, sigB)` public wrapper** (#97): 3-line public method composing existing private `extractParameterTypes` + `parametersMatch` so external callers can ask "do these two `PROCEDURE(...)` signatures match?" without reaching into private state. Foundation for the FAR overload-distinction wire-up.
- 🐛 **Strict compiler-truth resolution Phase B: drop unused `sourceFilePath` param + redundant FRG safety net** (#98): closes the strict-compiler-truth family. 5+2 sites updated to drop the unused argument; redundant per-project `path.join(project.path, filename)` block in `FRG.resolveFile` removed (parser's Tier 2 covers it). TypeScript signature-change cascade caught 3 missed sites the pre-investigation grep had missed.
- 🐛 **Strict compiler-truth resolution: drop synthetic `*.*` catch-all + sourceFilePath sibling probe; pathed-vs-bare branching at `findFile` entry** (#98): Mark locked an architectural shift — parser now matches Clarion compiler resolution semantics exactly, dropping IDE-permissive shortcuts. 4 parser changes: drop synthetic `*.*` injection, add pathed-vs-bare branching, add explicit Tier 2 (`<projectPath>/<filename>`), drop `sourceFilePath` sibling probe.
- 🐛 **`ClarionProjectServer.getSearchPaths`: relative paths anchor on project dir, not .red dir** (#98): parallel-code-path follow-up to 01d635ef + cfaa7584 — `getSearchPaths` consumed parser-emitted entries with the same anchor bug. Single-method swap: `path.dirname(entry.redFile)` → `this.path`. 5 callers benefit transitively.
- 🐛 **FAR on interface methods scans RED-derived `.inc` directories** (#98): file-finding audit Q1 — FAR's interface-method branch was missing Layer 1 (RED-derived `.inc` dirs) entirely. Extracted dir-set construction into vscode-free `incDirsScope.ts` helper composing all three layers with build-config awareness inherited from `getSearchPaths`.
- 🐛 **`FileRelationshipGraph.resolveFile` routes through canonical redirection chain via sourceFilePath** (#98): file-finding audit follow-up C — `resolveFile` previously layered manual fallbacks on top of `findFile`. Plumbed `fromFile` through as `sourceFilePath` and dropped the now-redundant post-loop sibling block. Per-project safety net kept as degraded-mode for no-red projects.
- 🐛 **`npm run test:client` no longer crashes on stale vscode-importing test** (#107): `.mocharc-client.json` exclude list was missing `CrossFileScope.test.js`; runner died on first `MODULE_NOT_FOUND`. One-line fix; post-fix `test:client` runs 59 passing.
- 🐛 **MEMBER('parent.clw') file resolution in INCLUDE-statement commands routes through LSP redirection** (#98): file-finding audit follow-up B — sibling-only probe missed parent CLWs in RED-derived paths or libsrc. New `memberResolution.ts` helper tries LSP `clarion/findFile` first, falls back to sibling probe (preserves single-file-without-loaded-solution mode).
- 🐛 **`SolutionManager.getEquatesTokens` removed redundant libsrcPaths fallback** (#98): post-`findFile('equates.clw')` libsrc walk re-probed directories that `findFile`'s Tier 3 already covers. Removed the 7-line fallback and its `serverSettings` import.
- 🐛 **Redirection parser: `findFile` honours active build configuration** (#98): `findFile` / `findFileAsync` walked all entries regardless of section — `[Debug]`-only paths searched under Release builds. Now filters with `entry.section === "Common" || entry.section === serverSettings.configuration`. Lookup-time (not parse-time) so config switches pick up new active section without re-parsing.
- 🐛 **Redirection parser: multi-segment relative paths resolve to project dir, not .red dir** (#98): direct follow-up to 01d635ef. Real-world `.red` entries like `*.clw = .\classes` were silently anchored on `<ClarionRoot>\bin\classes` instead of `<ProjDir>\classes` under developer-modified global `.red`.
- 🐛 **Redirection parser: LIBSRC fallback layer wired into `findFile` / `findFileAsync`** (#98): plain `findFile` consumers walked only Layer 1 (RED) + Layer 2 (project dir); Layer 3 (`<libsrc>` paths from `ClarionProperties.xml`) was never consulted. Fix adds Layer 3 in both sync + async after the prior two miss. New `FilePathSource.LibSrc` enum value.

- 🐛 **Redirection parser: `.`/`..` and synthetic `*.*` catch-all resolve to project dir, not .red dir** (#98): `findFile` resolved `.` / `..` against `path.dirname(entry.redFile)`; `parseRedFileRecursive` pushed a synthetic `*.* = [path.dirname(redFileToParse)]` catch-all. Both anchors wrong per Clarion 11.1 docs. Bug masked for project-local `.red`; bit hard for global-fallback path. Fix stores `projectPath` on parser instance, uses it as resolution anchor at lookup time.
- 🐛 **Undeclared-variable diagnostic gate respects constructor default for legacy clients** (#62): the `clarion/updatePaths` handler unconditionally overwrote `serverSettings.undeclaredVariablesEnabled` based on the params field, silently clobbering the now-`true` default with `false` when the client didn't include the field. Fixed: only an explicit boolean wins; `undefined` preserves the constructor default.
- 🐛 **#62 stale-diagnostic observability hardening** (#62): `[#62]` validator-entry breadcrumb promoted from `logger.info` to `logger.error` for default release log-level visibility during diagnosis of the time-dependent stale-diagnostic bug.
- 🐛 **#62 stale-diagnostic observability hardening — TokenCache trace lines** (#62): `[TC] Cache HIT/MISS/EMPTY` lines in `TokenCache.ts:getTokens` promoted to `logger.error` for the same reason — load-bearing for diagnosing whether validator reads fresh or cached tokens per edit.
- 🐛 **Undeclared-variable validator accepts `TokenType.Function` declarations** (#62): defensive parity fix — validator's procedure-detection filter now uses `TokenHelper.isProcedureOrFunction(t)` (was `t.type === TokenType.Procedure` only). No CHANGELOG-visible behaviour change in normal usage.
- 🐛 **#62 mode-C codeRanges=0 early-exit breadcrumb** (#62): the silent early-exit at `if (codeRanges.length === 0) return diagnostics` now emits `[#62] early-exit: 0 code ranges in N tokens — uri=...` at error level for repro disambiguation. Pure observability; no logic change.
- 🐛 **#62 stale-diagnostic regression test pin — all-in-one PROGRAM shape with TokenCache divergence** (#62): RED test pins TokenCache divergence on the all-in-one PROGRAM shape (PROGRAM declarations + main CODE + multiple inline procedures). Char-by-char backspace cycle asserts cache result must match fresh-tokenize at every intermediate version. Three fingerprint sub-tests rule out the DocumentStructure-boundary hypothesis.
- 🐛 **#62 stale-diagnostic root cause fixed — `DocumentStructure.process()` dispatch idempotent for PROCEDURE tokens** (#62): not an `incrementalTokenize` merge bug — a `process()` dispatch bug triggered BY incremental merging. After first pass, PROCEDURE tokens have `type === Procedure`; dispatch-gate `type === Keyword || ExecutionMarker` skipped them, so `handleProcedureClosure` never fired on stale PROCEDURE tokens. Fix: include `TokenType.Procedure` in dispatch gate; `handleProcedureToken` is now idempotent.
- 🐛 **#62 diagnosis breadcrumbs demoted back to info** (#62): post-fix cleanup — `[#62]` validator breadcrumb, `[#62] early-exit` line, and `[TC]` cache trace lines all return to `info` level after `aeb6cea` resolved the underlying bug.
- 🐛 **`DocumentStructure.process()` children-array `.push` is idempotent** (#105): hygiene follow-up to `aeb6cea`. New `addChildOnce(parent, child)` guard prevents duplicate-pushing across multiple `process()` passes (which `incrementalTokenize` triggers). 10 call sites migrated; 4-test idempotency suite + memory-banked contract in `project_documentstructure_idempotency.md`.
- 🐛 **`MapDeclarationDiagnostics.validateMissingImplementations` resolves MODULE filenames before constructing cache URIs** (#105): MODULE branch was using bare filename `Token.referencedFile` directly with `'file:///'` prefix, producing bare-filename URIs that duplicated VS Code's canonical cache entry. Fix mirrors the INCLUDE handler — resolve via `nodePath.join(currentClwDir, ...)` first, fall back to `resolveClwPath()`, skip if neither finds it.
- 🐛 **Tokenizer recognises hex / octal / binary numeric literal suffixes** (#105): `Number` token pattern now `/\b(?:[0-9][0-9A-Fa-f]*[hH]|[0-7]+[oO]|[01]+[bB]|[0-9]+(?:\.[0-9]+)?)\b/i`. Non-decimal forms require a leading decimal digit per Clarion's lexer convention. 12 regression tests; Alice's `isGluedNumberSuffix` guard kept as defence-in-depth.
- 🐛 **Canonical `file://` URI helper at every TokenCache-feeder construction site** (#105): new `server/src/utils/UriUtils.ts` exports `pathToCanonicalUri(absPath)` — lowercases drive letter, percent-encodes colon for Windows; idempotent on its own output. 14 cache-feeder sites across 5 files swept; 7 unit tests.

**Internal**

- 🛠️ **CHANGELOG migration to GitHub issues** (task `cd957ce3`): pre-2026-05-10 verbose `[0.9.7] - Unreleased` entries migrated to GitHub issues; CHANGELOG now follows lean policy (1-2 sentences + issue link). Audit trail preserved as: 12 comments on #62 (open) + 4 new umbrella issues (#97 FAR arc, #98 file-finding audit, #99 DocumentStructure Gaps) with 8/11/23 child comments respectively + 11 standalone issues (#100–#110) + 13 audit-trail comments on existing closed issues (#65 / #77 / #80 / #82 / #87 / #88 / #89 / #90 / #91 / #92 / #93 / #95 / #96).
- 🛠️ Document sibling-dir fallback 4-site cluster invariant in `ClassMemberResolver` + 3 companion sites — DO-NOT-MODIFY-IN-ISOLATION framing prevents future drift across the cluster (#98).
- 🛠️ Document `{include}` chaining semantics in `redirectionFileParserServer.ts` — sync interleaved-at-include-position ordering, macro source semantics (no `.red`-defined macros), and flat-list-tag section-merging via case-insensitive consumer-time equality (#98).
- 🛠️ **FRG-fixture upgrade — `MultiFileFARFixture` seeds `FileRelationshipGraph` for cross-file Tier 6 / global-receiver test coverage** (#97): backfills the deferred Tier 6 (PROGRAM-scope global receiver) cross-file test coverage from three FAR-family CHANGELOG transparency disclosures. New `seedEdgesForTest(edges)` test-only API + optional `frg` opt on the fixture builder + 2 new bidirectional-pinned tests. Artificial-RED methodology surfaced 4 production silent-asymmetry bugs in adjacent surface area (shipped under #97 Bug Fixes).

**Performance**

- ⚡ **Document-level procedure and routine indexes** (#99): Gap A — name-keyed `procedureIndex` + `routineIndex` populated at end of `process()`. New `findMethodImplementations()` / `findRoutines()` / `getAllProcedures()` give O(1) lookups; consumer hot paths migrated. New `TokenCache.getStructureByUri()` helper. No behaviour change — purely faster on large solutions.
- ⚡ **RECORD-of-FILE marker** (#99): Gap M — RECORD tokens whose direct parent is a `FILE` structure carry `isFileRecord: true`; new `getFileRecord(fileToken)` helper. `StructureDiagnostics.validateFileStructures` reads the flag instead of forward-walking the token stream.
- ⚡ **Structured procedure parameter list on procedure tokens** (#99): Gap E — every procedure-style token carries `parameters?: ProcedureParameter[]` with `{name, type, typeArg?, byRef, optional, default?}`. Multi-line `|`-continuation declarations joined to the full logical signature. `SignatureHelpProvider` migrated; other consumers left for follow-up.
- ⚡ **Bare `?` tokenized as FieldEquateLabel** (#99): Gap C follow-up — anonymous-control markers like `BUTTON('OK'),USE(?)` now produce a FieldEquateLabel token (value `?`) alongside the existing named form `?MyControl`. Foundation for the FieldEquate index + USE() relationship work.
- ⚡ **`getClassMethodImplementations` — all method impls of a class in O(N)** (#99): Gap O — `getClassMethodImplementations(classToken)` + `getClassMethodImplementationsByName()` backed by Gap A's `procedureIndex`. 3-part interface impls excluded.
- ⚡ **Declared-data values on Label tokens** (#99): Gap D — column-0 Label tokens carry `dataType?: string` + `dataValue?: string`. New `DeclaredValueParser` runs after `DocumentStructure.process()`. `WordCompletionProvider.collectEquates` + `VariableHoverResolver` migrated; multi-line `|`-continuation deferred to Gap P.
- ⚡ **Structured WINDOW / APPLICATION / REPORT descriptor** (#99): Gap F — `WindowDescriptor` carries `title`, `at`, `mdi`, `icon`, `systemMenu`, `statusBar`, and fallback `attributes`. New `getWindowDescriptor()` + `getActiveWindowDescriptor(line)` helpers. Hover on WINDOW / APPLICATION / REPORT now renders a structured tooltip.
- ⚡ **Branch boundaries on CASE/IF parent tokens** (#99): Gap G — every CASE/IF token carries `branches?: BranchInfo[]` recording its `OF`/`OROF`/`ELSE`/`ELSIF` clauses with line ranges + condition text. Nested CASE/IF blocks isolated. Future folding / selection / refactor consumers can read the structured array.
- ⚡ **`TokenHelper.isProcedureOrFunction` — single source of truth across consumers** (#99): replaces ~30 hand-rolled `t.type === TokenType.Procedure` filters across 16 consumer files. Modern Clarion treats PROCEDURE and FUNCTION as semantically identical; the type-token split is a tokenizer artifact. Eliminates a class of latent bugs where FUNCTION-typed declarations were silently filtered.
- ⚡ Quieter language-server logs: `logger.warn` performance traces in `StructureDeclarationIndexer` (3 sites) and `logger.error` info traces in `FileRelationshipGraph` (2) + `IncludeVerifier` (16) demoted to `logger.debug`. Catch-block error sites unchanged.

**Hover Improvements**

- 🎨 **Standardised hover location format** (#103): all hover tooltips (procedures, methods, variables, structure types, fields, class declarations) display the source location as `filename:N` at the bottom of the tooltip, after the code block — consistent across every hover type.
- 🐛 **CLASS type header no longer picks up `Link()`/`DLL()` arguments** (#103): `CLASS(), Link('x', SomeName)` was incorrectly shown as `CLASS(SomeName)`. Type extractor now only looks inside the first `(…)` group of the structure keyword.

**Bug Fixes**

- 🐛 **Rename / Definition / Hover miss FUNCTION-typed procedure declarations** (#99): hotfix — `Foo FUNCTION(LONG),REAL` declarations were silently invisible to F2 / Go to Definition / Hover from a call site. `SymbolFinderService.findProcedureDeclaration` now uses `TokenHelper.isProcedureOrFunction(t)` instead of `t.type === TokenType.Procedure`. Same gate applied to call-site identification.
- 🐛 **`prepareRename` rejects cross-file procedure call sites** (#108): F2 on a procedure call whose declaration lived in another file failed silently — `prepareRename` validated via per-file `SymbolFinderService` while the actual rename in `provideRename` was solution-aware via `ReferencesProvider`. `prepareRename` now falls back to `ReferencesProvider.provideReferences` when the per-file resolver returns no symbol.
- 🐛 **Bare `WINDOW` / `APPLICATION` / `MENU` / `TOOLBAR` keywords tokenize correctly** (#109): bare forms (`BareWin WINDOW` with no parens or attributes) failed the keyword regex's `(`-or-`,` lookahead — `WINDOW` left a stray `INDOW` Variable; the others tokenized as plain Variables. Lookahead now also accepts whitespace-followed-by-EOL and `!` (comment).
- 🐛 **Report-band keywords `DETAIL` / `HEADER` / `FOOTER` / `FORM` classified as controls inside REPORT bodies** (#99): Gap J follow-up — these were in `clarion-controls.json` `reportControls` but missing from the tokenizer's `isDeclarationStructure` early-exit gate, so they didn't tokenize as `Structure`. Added to the declaration-structure whitelist (mirrors the ITEMIZE alignment from Gap B).
- 🐛 **Stale MAP-diagnostic race condition after code-action fix** (#104): applying a "sync signature" quick fix could leave the mismatch diagnostic visible until files were saved or the extension restarted. `CrossFileResolver` cached under un-encoded URI (`file:///f:/…`) while VS Code stored under percent-encoded (`file:///f%3A/…`). Fix: TokenCache refresh on `onDidChangeContent` now removes duplicate cache entries normalising to the same path.
- 🐛 Ctrl+P (Quick Open) includes files from redirection paths: relative paths in `.red` files now resolve relative to the `.red` file's own directory rather than the project directory, so files in accessory `libsrc` and other Clarion-managed source trees appear correctly.
- 🐛 **Auto-restore solution after cross-folder workspace switch** (#104): opening a solution from the Solution View history that lives in a different folder now correctly restores all settings (properties file, version, configuration) on the subsequent activation, eliminating the "Clarion settings are incomplete" warning.
- 🐛 **GlobalSolutionHistory saves full settings on all paths** (#104): history entries always include `propertiesFile`, `version`, and `configuration` regardless of which code path triggered the save, so cross-folder restore has the information it needs.
- 🐛 **Blank `currentSolution` no longer prevents solution load** (#104): when `clarion.currentSolution` is empty but `clarion.solutions` has entries (e.g. after closing a solution), the extension now falls back to the first solutions array entry so the solution loads correctly on next activation.

**Infrastructure**

- 🔧 **Multiterminal session-start hook portable across clones** (#110): `.claude/settings.json` project-shared settings + `.claude/hooks/session-start.ps1` are now tracked. Previously the hook script was caught by the broad `*.ps1` ignore rule, leaving cloned repos without session-start wiring. `.gitignore` now carries `!.claude/hooks/*.ps1`. `.claude/settings.local.json` stays gitignored as the per-machine slot.

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
