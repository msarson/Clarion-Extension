# Changelog

All notable changes to the Clarion Extension are documented here.

---

## Recent Versions

### [1.0.0] - Unreleased

**New Features**

- ✨ **Refactor: Introduce EQUATE** (#281): with the cursor on (or a selection of) a numeric or string literal, a **Ctrl+.** refactor **"Introduce EQUATE"** extracts the magic literal to a named `EQUATE`. Mirroring Surround With, it then asks — as a second step — **which data section** to declare it in (a quick pick), then prompts for the name. The candidate scopes are computed structurally from `DocumentStructure`: the routine's `DATA` (when the cursor is in a routine that has one), the enclosing procedure's local data, the file-level section (**module** data in a `MEMBER`, **global** data in a `PROGRAM`), and — from a `MEMBER('name')` module — a cross-file **Global (in name.clw)** option that inserts into the resolved `PROGRAM` file's global data. A bare/empty `MEMBER` names no program, so the global option is omitted; it's also omitted when the program file can't be resolved. The `EQUATE` is inserted in the chosen scope (label at column 0) and the literal is replaced with the name. Pictures (`@…`) and replace-all-in-scope are follow-ups.
- ✨ **Quick Fix: Create routine from an unresolved `DO`** (#280): with the cursor on a `DO SomeRoutine` whose target isn't defined, a **Ctrl+.** quick fix **"Create routine 'SomeRoutine'"** scaffolds a `SomeRoutine ROUTINE` skeleton (label at column 0, `! TODO` body) at the end of the enclosing procedure, and drops the cursor into the new body. Resolution is procedure-scoped (a routine is local to its procedure and labels legally repeat across procedures), so a same-name routine in a *different* procedure still offers the fix, and a `DO` inside a routine body resolves against its parent procedure. When the `DO` is inside a **local derived method** (its `CLASS` declared in a procedure's local data, e.g. ABC's `ThisWindow` / NetTalk classes), the routine can be placed two ways — **local to this method**, or **procedure-level, shared by all methods** — and a routine that already exists at the procedure level is recognised as in-scope (no spurious "create" offer). Nothing is offered when the routine already exists. A lightweight sibling of the CodeRush "generate from usage" idea — a routine has no parameters or return type, so there's nothing to infer.
- ✨ **Refactor: Flip IF/ELSE** (#278): with the cursor on a block-form `IF … ELSE … END`, a refactor code action (**Ctrl+.** / Refactor…, or the **Clarion: Flip IF/ELSE** palette command) negates the condition and swaps the two branches — handy when the `ELSE` is the common / early path. The condition negation reuses the Negate-condition logic (`=`↔`<>`, `~`-wrap a compound, …), branch indentation is preserved, and nested `IF`/`LOOP`/`CASE` blocks are stepped over to find the matching top-level `ELSE`/`END`. Nothing is offered when the shape is not a clean two-branch flip (no `ELSE`, an `ELSIF` chain, or a single-line `IF … THEN`), where the Negate-condition action still covers the IF line. Third of the CodeRush-inspired refactors.
- ✨ **Refactor: Negate condition** (#279): on an `IF` / `ELSIF` / `LOOP WHILE` / `LOOP UNTIL` line, a refactor code action (**Ctrl+.** / Refactor…, or the **Clarion: Negate Condition** palette command) flips the condition's logical sense — comparison operators invert (`=`↔`<>`, `<`↔`>=`, …), a bare expression gains/loses a `~`, and a compound boolean is wrapped in `~(…)`. Only the condition span is rewritten (trailing `THEN`/comments and string contents are respected). Second of the CodeRush-inspired refactors.
- ✨ **Refactor: Surround With…** (#277, #284): select one or more statement lines and wrap them in a Clarion structure — `IF … END`, `LOOP`/`LOOP WHILE`/`LOOP UNTIL … END`, or `CASE … OF … END`. Offered as refactor code actions (**Ctrl+.** or the **Refactor…** menu — no new keybinding) and as the **Clarion: Surround With…** palette command. The content is indented one level (preserving relative indentation, `OF` aligned with `CASE` per Clarion convention), and the condition/expression placeholder is selected so you can type straight over it. First of a series of CodeRush-inspired refactors.
- ⬆️ **Language client/server upgraded to LSP 8.x**, unlocking LSP 3.17 features natively.
- ✨ **Hover on an INCLUDE/MODULE/MEMBER/LINK filename shows the resolved path** (#265): hovering the filename argument now shows which physical file the redirection system actually resolves to (or a not-found note) — previously hover bailed on any cursor inside a string. Uses the same resolver as F12's filename navigation, so the two always agree.
- 🚫 **Inlay hints — implemented but disabled**: inline implicit-variable types (`Counter#` → `: LONG`) and parameter-name hints at call sites were built, but proved too noisy for Clarion, so the capability is left un-advertised. The provider/handler/tests remain in the codebase (dormant) for a possible future opt-in.
- ✨ **Diagnostic: passing a literal to a by-reference parameter** (#244): flags a string / numeric / picture literal passed to a `*TYPE` parameter (or a complex `QUEUE`/`GROUP`/`FILE`/`VIEW`/`RECORD`/`CLASS` type, which is by-reference even without the `*`) — a literal has no address and can't bind by-reference. Conservative to avoid false positives: only for calls resolving to a single unambiguous same-file `MAP` signature.
- ✨ **Hover on an overloaded built-in keyword resolves the specific overload from the argument types** (#272): hovering `ADD`, `GET`, `PUT`, `OPEN`, … on a real call now shows only the overload the arguments select (e.g. `ADD(SomeQueue)` shows the `QUEUE` overload hiding the `FILE` ones, and `OPEN(SELF.MyWindow, SELF.OwnerWindow)` where the members are `&WINDOW` shows the `WINDOW, WINDOW` overload) instead of listing every candidate. Built-in hover now shares the same `CallSiteArgumentClassifier` → `ArgumentTypeResolver` → `MethodOverloadResolver` stack signature help already used, so the two agree; when the arguments can't uniquely disambiguate it narrows to the compatible family, and falls back to the previous count-based listing when no argument type resolves. As part of this, an argument declared as an inline structure-kind reference (`&WINDOW`, `&QUEUE`, `&GROUP`, …) with no named user type now type-resolves to that kind — benefiting signature help, F12, and Find-All-References too.
- ✨ **Go-to-definition disambiguates overloads by member / reference / typed-variable argument types** (#245): F12 on an overloaded call now resolves an argument like `Self.Probs` (a queue reference) or a typed local to its type and picks the matching overload — the same resolution signature help uses. Both now share one `ArgumentTypeResolver`, so F12 and signature help agree. (Find-All-References uses the same classifier; folding its call-site loop onto the shared resolver is a follow-up.)
- ✨ **Member / reference / cross-file arguments now type-resolve for signature help** (#243): a dotted member access (`Self.Probs`), a reference variable (`x &SomeType`), or a cross-file-declared argument now resolves to its declared type — both the type **name** (to match a user parameter like `*MyQueueType`) and its structure **kind** (to match a built-in parameter typed `QUEUE`/`GROUP`/`FILE`). So `GET(Self.Probs, )` where `Probs` is a `&QUEUE` reference now highlights a `GET(QUEUE …)` overload instead of the default `GET(FILE …)`, and the active-overload fallback highlights the first *compatible* overload rather than an arbitrary one. Builds on #242 by wiring the existing member resolver into argument classification.
- ✨ **Signature help highlights the type-matching overload as you type** (#242): while typing arguments, the active signature now reflects the *types* of the arguments so far — using the same inference as hover / go-to-definition (literals, `EQUATE` values, implicit variables, and typed variables) rather than the previous literal-only heuristic. Passing an `EQUATE`, an implicit variable (`Counter#`), a typed local, or a literal now highlights the overload whose parameter type actually matches.

**Performance**

- 🚀 **Structure index persists across sessions; background builders yield the event loop** (#290): the structure-declaration index (which powers hover/F12/completion on type names and the missing-include diagnostic) re-scanned every reachable `.inc`/`.equ` on every start — ~27s on a large installation. Scan results are now persisted per project (OS temp dir) keyed by each file's **mtime**: a warm start reuses unchanged files' results at the cost of one stat each (measured 4094/4094 reused on the second start), so the rebuild drops to roughly the few files that actually changed. Additionally, requests for files that aren't project members (shared `.inc` directories, generated-source subdirs) no longer launch **rogue directory-keyed index scans** — measured racing the real build at 17–60s each and starving concurrent validators — they now reuse the solution's index, whose scan already covers the redirection search paths and libsrc. The CodeLens reference precompute also now yields the event loop after **every** file and **every** reference scan (was every 10/25), removing the multi-second freezes that could block hover/F12 during startup.
- 🚀 **Cross-file validators no longer grind on large solutions** (#289): after a solution loaded, the async diagnostics (missing includes, discarded return values, MAP declaration checks) took **10–20 seconds per large generated file** — each resolves hundreds of include/module names, and every resolution walked every project's redirection entries with a disk existence check per candidate directory. File resolution (`findFile`) now answers existence checks from a shared directory index (one directory listing per ~10s window instead of a stat per candidate), collapsing those walks to memory lookups — this also speeds up hover/F12/document-link resolution on cold caches. Additionally, the 2-second no-solution fallback no longer fires **while a solution is still loading** — previously it ran the full cross-file validation pass in degraded no-solution mode, only for everything to be re-validated again once the solution was ready (double the most expensive work on exactly the biggest solutions).
- 🚀 **Solution loading: source-file resolution batched via a directory index** (#288): resolving each project source file's path through the redirection search paths did an existence stat per candidate directory per file — on a 40-project / 3000-file solution that's tens of thousands of stat syscalls (~7.9s measured on a VM disk). Loading now lists each unique search directory **once** (shared across all projects) and answers every existence check from memory. Runtime file resolution (hover/F12/`clarion/findFile`) is deliberately untouched — the index is load-scoped and cleared per solution load, so newly created files are never masked.

**Bug Fixes**

- 🐛 **Undeclared-variable warning no longer false-fires in no-solution mode** (#287): the diagnostic resolves cross-file globals (`GlobalRequest`, `GlobalResponse`, module/global data declared elsewhere) through the solution's symbol index — but with **no solution loaded** that index doesn't exist, so every such legitimate global was flagged as undeclared (reported by a user who keeps a very large `.sln` unloaded). The diagnostic is now suppressed entirely until a solution is loaded, since its accuracy depends on that index; loading the solution restores full coverage. The `clarion.diagnostics.undeclaredVariables.enabled` off-switch remains for anyone who wants it disabled even with a solution loaded.
- 🐛 **Invalid-character warning no longer floods non-Western code pages** (#82): the warning flagged every character above code point `0xFF`, which assumed everyone edits in Windows-1252 and wrongly reported legitimate national letters — `č`, `ć`, `š`, `ž`, `đ` for Central-European CP-1250, the whole Cyrillic set for CP-1251, etc. — as invalid, filling those developers' files with warnings. It now flags a character only when it can't be represented in **any** Windows ANSI code page (1250–1258), so genuine contamination (pasted emoji, box-drawing, other-script text) is still caught while national letters for every locale pass clean. Emoji are now reported once (spanning the surrogate pair) rather than twice, and the "Fix all" quick fix uses the same test so it never deletes valid characters. There is intentionally no setting — the detection is simply correct now. (Representability is checked via `iconv-lite`.)
- 🐛 **F12 / Ctrl+F12 on a `DO routine` from inside a local derived method now navigate** (#285): when a `DO SomeRoutine` sits inside a method whose `CLASS` is declared in a procedure's local data (the ABC/NetTalk `ThisWindow` shape), a routine declared at the *enclosing procedure's* level is callable from the method (the method shares its declaring procedure's scope — Rule 4), but Go-to-Definition and Go-to-Implementation resolved nothing — hover worked, because it fell through to a broader resolver, so the three quietly disagreed. The shared routine resolver (`findScopedRoutineToken`) now searches the full routine-hosting scope chain (method → declaring procedure), innermost first, so F12/Ctrl+F12/hover agree again. This is the same scope chain the Create-routine quick fix (#280) uses, now factored into one shared helper.
- 🐛 **Client actually runs on vscode-languageclient 8.x now; clean installs build again** (#276): the client `package.json` declared `^8.1.0` but the lockfile pinned `7.0.0`, so `npm ci` failed and `npm install` upgraded to 8.x that didn't type-check (the `ErrorHandler` still used the @7 return contract). The build only worked because existing `node_modules` predated the mismatch. Completed the client's LSP 8.x move: `errorHandler` returns the 8.x `ErrorHandlerResult`/`CloseHandlerResult` shape, the lock is aligned to 8.1.0 (matching the server, already on 8.x), `@types/vscode` is bumped off the stale 1.56 pin, and `skipLibCheck` is enabled so a dependency's type definitions can't break the build. (Moving to 9.x/10.x is deferred — it requires a TypeScript 5 upgrade.)
- 🐛 **Clarion status bar no longer shows in non-Clarion editors/workspaces** (#273): opening a non-Clarion folder (e.g. a TypeScript package) used to flash "Clarion: Ready" on startup. Following the built-in TypeScript extension's model, every Clarion status item is now scoped to the active editor — the version / config / build items appear only while a Clarion document is focused, and the solution-load indicator (previously an unconditional item with a persistent "Ready") only shows during an actual solution load and disappears when done. A solution-free or non-Clarion folder shows nothing; per-file language features are unaffected. (Filed follow-up: the idiomatic `languages.createLanguageStatusItem` home for the load indicator is blocked on a stale `@types/vscode` pin.)
- 🐛 **Hover/F12 on an overloaded call resolve correctly when an argument's name collides with a structure keyword** (#274): a Clarion `WINDOW` may be labelled with the keyword itself (`Window WINDOW('Main')`), and passing it by name (`INIMgr.Fetch('Main', Window)`) mis-tokenized — the tokenizer's no-match fallback dropped the argument's leading character (`Window` → `indow`) because a reserved structure keyword matched no identifier pattern in expression context. The mangled name resolved to nothing, so overload resolution fell to match-all and hover/F12 picked the wrong overload. In a CODE section the whole identifier is now kept as a value, and a structure **instance** declared inline (`Window WINDOW`, `Q QUEUE`) now type-resolves to its structure kind — and that in-file declaration is authoritative, taking priority over the cross-file/structure-index resolver, which in a loaded solution could mis-map a name like `Window` to an unrelated class (e.g. colliding with `ThisWindow CLASS(WindowManager)`). So `INIMgr.Fetch('Main', Window)` now resolves to the `(STRING, WINDOW)` overload instead of `(STRING, STRING)`. Declaration-context parameter-type keywords are unchanged. Go-to-Implementation is fixed too: its overload picker skipped argument-type enrichment (unlike hover/F12), so it fell to a paramCount-only lookup — it now shares the same enriched resolver and signature-aware cross-file body lookup, so Ctrl+F12 lands on the correct overload's method body (e.g. in `ABUTIL.CLW`).
- 🐛 **Compiled-out code (unconditional `OMIT`) is now invisible to diagnostics and reference counts, but still renamed** (#255): diagnostics are no longer raised inside `OMIT('…')` blocks (inactive code isn't in the active build — matching how C++ IDEs treat `#if 0` regions; structural warnings like "unterminated OMIT" still surface), and Find-All-References/CodeLens counts exclude omitted occurrences. Rename deliberately deviates and still rewrites them — Clarion projects build multiple configurations from one source, and skipping inactive regions silently breaks the others. Also fixed a polarity bug: an unconditional `COMPILE('…')` block (the *always compile* directive) was treated as omitted, hiding its symbols from the outline. Conditional forms (with a define argument) remain conservatively live; define evaluation and editor gray-out are follow-ups.
- 🐛 **Client-side path comparisons no longer drop unsaved edits on spelling drift** (#266): method-implementation resolution and SECTION lookup compared open-document paths case-sensitively (or by raw string), so a drive-letter-case or separator mismatch silently fell back to the stale on-disk copy. All flagged sites now go through the client's canonical `PathUtils` helper (previously fully-formed but with zero callers), `findSourceInProject` gets full paths where the caller has them (its precise path-match strategies were unreachable behind basename-only arguments), and solution-history/settings lookups compare normalized paths.
- 🐛 **Hover and Ctrl+F12 now agree with F12 on typed-argument overloads** (#252): hover did no argument-type enrichment, so on `SELF.AddProb(SELF.Probs)` (same-arity overloads differing only by argument type) hover showed the first-declared overload while F12 jumped to the type-matched one — same cursor, two answers. All overload-overlay consumers now share one enriched choke point (`resolveOverloadDeclByArgs`), and F12's own duplicate copy was folded into it so the surfaces can't drift again. Also fixed en route: a variable whose name collides with an attribute/keyword (`ref`, `name`, `max`…) passed as a bare argument classified as unknown and never type-resolved anywhere.
- 🐛 **Occurrence highlighting is now scope-aware and covers call sites** (#254): clicking a variable no longer co-highlights unrelated same-named locals in other procedures (the provider was a whole-file bare-name scan; it now filters through the shared scope-tier index, including routine-local and module-shadowing splits). Procedure call sites — previously not highlighted at all — now highlight as Read, and declaration lines emit exactly one Write at the label instead of a duplicate whose range started at the `PROCEDURE` keyword.
- 🐛 **Find-All-References/rename from a method call site now type-checks sibling receivers** (#269): with the cursor on `inst.Check()`, other `inst.…` lines were matched by receiver **name** alone — a routine-local `inst` of a *different* class (legal Clarion shadowing) leaked into rename and got silently rewritten, while a same-class receiver under another name (`minst.Check()`) was missed entirely. Receivers are now resolved through the scope-tier index and gated on class family from both cursor sides; receivers whose type can't be resolved keep the old name match (rename-safe conservative bias).
- 🐛 **Find-All-References on an overloaded MAP procedure no longer returns the other overloads' call sites** (#268, the FAR half of #248): the plain-symbol path filtered declaration/implementation lines by signature but let every call site through unfiltered — FAR on `Foo PROCEDURE(STRING)` returned `Foo(1,2)` too, and rename merged both overload families. Call sites are now checked against the overload's arity band and classified by argument types against the sibling MAP signatures, with the established conservative bias: a call the classifier can't disambiguate stays included (rename safety).
- 🐛 **Find-All-References INCLUDE-chain walks are now cancellable and honor unsaved edits** (#256): three recursive `.inc`-chain walkers ran synchronously with no cancellation check — a deep/wide include chain could stall the language server un-cancellably (multiplied by the per-procedure reference-count CodeLens). They now check the request's cancellation token and yield the event loop periodically, and they read the live editor buffer instead of the stale on-disk copy when the file is open.
- 🐛 **Signature help and F12 now type-resolve `PRE:Field` arguments and honor Clarion scope priority** (#257 Phase 3): the shared argument-type resolver consults the scope-tier index first, so a PRE-prefixed field argument (`DoIt(QUE:Fld)`) now selects the matching overload instead of falling back to the first one, and a procedure-local variable now correctly shadows a same-named module-level variable (previously the module declaration won because the fallback resolver scanned in document order). Find-All-References already had both behaviors; the three consumers now agree. Cross-file lookups on the fallback path also gained an mtime-validated file cache.
- 🐛 **Cross-file navigation results now use VS Code's canonical URI form** (#251): ~20 sites building `Location`/link/workspace-edit/diagnostic URIs by hand-concatenating `file:///` + path (uppercase drive, unencoded colon — the #196 drift class) now route through the canonical `pathToCanonicalUri` helper. Fixes silent failures of "already at this location" guards and duplicate cache entries when a file is first reached via cross-file navigation and then opened in the editor. Internal lookup keys that are deliberately paired with encoding-insensitive lookups were left unchanged by design.
- 🐛 **F12/Ctrl+F12/hover on an overloaded MAP procedure call now pick the overload matching the call's arguments** (#248): the resolvers were handed the raw call-site line where a *signature* was expected, so on `x = Rep(4)` the parameter extraction returned nothing — which "exactly matched" a zero-parameter overload, and F12 confidently jumped to `Rep PROCEDURE()` instead of `Rep PROCEDURE(LONG)`. MAP overload selection now classifies the call's arguments (same classifier as every other overload consumer) before falling back to signature matching. Also unified Rule 6 across both signature matchers: `*GroupType` ≡ `GroupType` for complex types (by-ref is implicit), while scalar `*STRING` ≠ `STRING` remains a real discriminator.
- 🐛 **Find-All-References from a call site now anchors to the overload matching the call's argument types** (#249): the cursor-side anchor was arity-only, so for same-arity different-type overloads (`SetValue(STRING)` / `SetValue(LONG)`) FAR from `inst.SetValue(num)` returned the complete *wrong* overload family — STRING decl, impl, and call sites — while **excluding the very line it was invoked from** (rename then rewrote the wrong family and skipped the renamed occurrence). The anchor now classifies the cursor call's arguments with FAR's own type index and re-points to the matched overload. Also fixed two supporting defects: angle-bracket-only optional parameters (`<LONG x>`, no `=`) now count toward the compatible-arity band, and the call-arg counter anchors by word boundary so a longer identifier containing the method name (`SetValueEx`) can no longer hijack the count.
- 🐛 **Hover and Ctrl+F12 on `DO Routine` now resolve the enclosing procedure's routine** (#264): ROUTINE labels are procedure-local and legally repeat across procedures. F12 was scoped correctly under #211, but hover and Go-to-Implementation still did a whole-file first-match scan — showing/jumping to the *first* procedure's routine from anywhere in the file. All three now share one procedure-scoped lookup (`TokenHelper.findScopedRoutineToken`) and always agree.
- 🐛 **Two references on the same line no longer collapse in Find-All-References — rename edits every occurrence** (#253): the #196 URI-dedup fix keyed results by file+line with no column, so `res = inst.Check() + inst.Check()` reported one reference and **F2-rename rewrote only one occurrence per line, silently breaking the compile**. The dedup key now includes the column; a new suite pins both directions (same-line refs stay distinct; mixed URI encodings still collapse) end-to-end through FAR and rename.
- 🐛 **Folding provider no longer able to mutate shared cached tokens** (#259): a "finishesAt inference" fallback assigned onto the shared token objects — a contamination channel into incremental tokenization, which reads `finishesAt` to size its re-tokenize scope. Investigation showed the fallback was also unreachable dead code (its gate required a subType that is never assigned), so it was deleted rather than fixed, and a sentinel test now pins the invariant that folding leaves every cached token field-identical.
- 🐛 **Eliminated redundant document re-processing (3+ extra passes per keystroke) and a latent token-corruption vector** (#258): the diagnostics pipeline, MAP-procedure resolution (hover/F12/Ctrl+F12), and `TokenCache.getStructure()` each re-built and re-processed a `DocumentStructure` over the already-processed shared token array — every debounced edit paid 3 redundant passes, and one unguarded mutation (`localClassTokens`) duplicated its entries on every pass, compounding per keystroke for any procedure-local CLASS. The mutation is now reset-guarded (pinned by an extended idempotency suite), `getStructure()` returns the cached instance instead of discarding it on cold-cache calls, and all hot paths reuse the one cached structure.
- 🐛 **Call-site argument classifier: omitted arguments, `PRE:Field` arguments, and wrapped calls now classify correctly** (#250): three defects in the shared argument classifier feeding hover/F12/signature-help/FAR overload resolution — (1) an omitted argument (`GET(Q,,3)`, `F(a,)`) was silently dropped, shifting every following argument's position so per-position type checks compared the wrong pairs (could silently flip which overload was selected); (2) a plain `PRE:Field` argument whose prefix collides with a keyword (`PRE`, `NAME`, `MAX`…) fell through to *unknown* and type resolution was never attempted; (3) a `|` line-continuation inside a wrapped argument list corrupted the following argument. All three were common, valid Clarion shapes.
- 🐛 **FUNCTION-declared procedures and methods now get full overload support** (#247): ~26 checks across the server tested only for the literal `PROCEDURE`, so `FUNCTION`-declared procedures/methods silently lost overload filtering in Find-All-References (all overloads' references merged), arity-based overload resolution for hover/F12/Ctrl+F12 (first-declared always won), completion parameter display, and incremental-tokenization dependency expansion. All sites now honor the PROCEDURE ≡ FUNCTION equivalence, and hovering the `FUNCTION` keyword shows the same contextual docs as `PROCEDURE`.
- 🐛 **Solution activation now completes for slow-loading solutions** (#263): the server's `clarion/solutionReady` notification echoed the solution *directory* where the client expected the `.sln` file path, so the client rejected every notification as stale and the deferred activation path never ran — leaving INCLUDE/MODULE resolution degraded until a window reload. The server now sends the actual solution file path, and the client compares paths normalized/case-insensitively.
- 🐛 **Implicit variables passed as arguments now resolve the correct overload** (#241): sibling of #240 — a Clarion implicit variable (`Counter#`, `Percent$`, `Address"`) was classified as an unknown argument → conservative match-all → wrong/ambiguous overload for hover / go-to-definition. The classifier now infers its type from the label suffix (`#`→`LONG`, `$`→`REAL`, `"`→`STRING`), keeping it a variable (so it can bind the base type or a `*TYPE` reference parameter).
- 🐛 **EQUATE constants passed as arguments now resolve the correct overload** (#240): hover / go-to-definition (and Find-All-References counts) previously treated an `EQUATE` argument as an untyped variable → conservative match-all → wrong or ambiguous overload picked. The call-site argument classifier now infers the type from the EQUATE's value (numeric → `LONG`/`REAL`, string → `STRING`, picture → string-like, following alias chains), so the matching overload is chosen. Because an EQUATE is a constant, it also correctly excludes reference-parameter (`*TYPE`) overloads.
- 🐛 **Local Derived Method scope no longer leaks other procedures' locals** (#233): hover / F12 inside a method of a class declared in a procedure's local data now resolve variables against *only* that declaring procedure (not a broad scan of every global procedure), so completion and hover agree and same-named locals in unrelated procedures are no longer mixed in.
- 🐛 **Routine-body scope is no longer silently dropped** (#233): the shared "innermost scope at line" helper returned the enclosing *procedure* for lines inside a `ROUTINE` (via its dominant code path), losing routine scope for hover / definition / member resolution; it now consistently returns the `ROUTINE`. Also hardens class-member INCLUDE resolution against a missing redirection parser.
- 🐛 **Local Derived Methods can now see their declaring procedure's locals** (#233): the same-file visibility check (`canAccess`, used by go-to-definition/reference filtering) denied a method access to the local data of the procedure that declared its class; it now honors that Rule-4 visibility (and a routine's access to its enclosing procedure's data) via the resolver's visible-scope chain, while still denying unrelated procedures.

**Internal / Substrate**

- 🧹 **TokenCache contract hardening** (#260): both cache maps are now keyed canonically (percent-decoded + lowercased), so the same file reached under different URI spellings (`file:///f%3A/…` from VS Code vs `file:///f:/…` from disk-walk resolvers) shares one entry instead of holding two divergent token sets; the closed-file cache is now a bounded LRU (previously grew unbounded for the server's lifetime, across solution switches); and a no-op version bump now converges the cached version, so `getStructure()`'s fast path recovers instead of rebuilding on every call until the next real edit. The previously-untested cache contract — including the array-identity guarantee #257's index caching depends on — is now pinned by a dedicated suite.
- 🧹 **Routine-local DATA variables no longer produce phantom duplicate tokens** (#267): the tokenizer spliced a second token for every routine-local declaration (the main pass had already tokenized it), so raw-array consumers saw each variable twice with diverging metadata. The existing token is now marked in place with the Variable/ReferenceVariable subType instead.
- 🧹 **FAR's scope-tier type index extracted into a shared `ScopeTypeIndexService`** (#257 Phases 1-3): the ~380-line variable-type index covering Clarion's full scope model (routine-local shadowing → parameters → procedure locals → SELF class fields → module → PROGRAM-global, plus `PRE:`-prefix keying) moved verbatim out of `ReferencesProvider` so other resolvers can adopt it in later phases. Zero behavior change; new unit tests pin the tier-shadowing priority, PRE set-if-absent precedence, and Tier-6 cursor-in-PROGRAM/MEMBER symmetry, and a new rename-through-FAR sentinel pins the tier chain end-to-end. Phase 2 adds an identity-keyed index cache (invalidated automatically when `TokenCache` hands out a new token array), removing the per-CodeLens index rebuild that made the #189 reference-count precompute quadratic. Building the sentinel surfaced a pre-existing call-site-cursor matching bug, filed as #269.
- 🧹 **Hygiene** (#262): deleted a provably-unreachable ~60-line branch in `DocumentStructure.processLabels` (constructor-time guard on a stack only populated during `process()`) together with the never-read `nestedLabel` token field it was the sole writer of; removed a no-op `DocumentStructure` construction in `ScopeAnalyzer` whose comment claimed processing that `getTokens()` already performs.
- 🧱 **Canonical scope model foundation** (#233): new deterministic `ScopeResolver` codifying Clarion procedure / routine / local-derived-method scope rules (executable extent via the additive `Token.codeFinishesAt`, tier visibility, Rule-4 declaring-procedure linkage). Groundwork toward converging all scope resolution onto one rule set; completion (`WordCompletionProvider`) and hover (`SymbolFinderService`) are the first two consumers migrated.

---

### [0.9.9] - 2026-07-04

_Release focus: open-solution scope correctness and cross-file resolution; the no-solution changes below are additive hardening, not the primary target._

**New Features**

- ✨ **Qualifier completion now respects the typed qualifier**: when typing `Prefix:` (or `Prefix:Par`), word completion now returns only symbols declared with that exact qualifier (e.g. `TGLO:*`) and filters by the typed suffix, instead of mixing unrelated in-scope symbols.
- ✨ **Dot completion now shows member types inline**: member lists now include the declared type in the visible completion label (for example `Var1 LONG`) while still inserting only the member name when selected.
- ✨ **TypeScript-style initialization status bar flow**: startup/solution-load progress now uses a single evolving status bar item with clear phase updates (activating, language server start, loading/indexing solution, ready) instead of multiple transient “solution loaded” popups.
- ✨ **Build + generation status bar lifecycle**: Clarion build and generation commands now surface a consistent status bar lifecycle (`running` → `success` / `failure`) so users can track progress without watching terminal output continuously.
- ✨ **Cross-file global-data completion parity for MEMBER files** (#224): word completion now includes PROGRAM-file global symbols while editing MEMBER modules, including both direct globals (e.g. `GLO:*`) and `PRE(...)`-qualified global structure fields (e.g. `TGLO:FieldName`); prefixed completions now insert only the suffix after an already-typed qualifier, so accepting `GLO:Var` after typing `GLO:` no longer duplicates the prefix.
- ✨ **No-solution entry-point completion coverage extended** (#113): no-solution LSP entry-point tests now include completion validation for MEMBER files consuming PROGRAM globals (`GLO:*` and `PRE(...)`-qualified fields), and FAR global-scope loading now has a no-solution MEMBER→PROGRAM fallback when FRG is unavailable.
- ✨ **Lazy no-solution FRG substrate for DocumentLink / FAR / completion** (#140): `FileRelationshipGraph` now builds on demand around the active no-solution document using its reachable INCLUDE/MEMBER/MODULE neighborhood plus nearby libsrc/source directories, so INCLUDE links, cross-MEMBER global FAR, and MEMBER→PROGRAM completion all reuse the same graph-backed file relationships even with no `.sln` loaded.
- ✨ **Sibling MEMBER module-scope symbol resolution** (#118): `SymbolFinderService` now walks FRG MEMBER edges to resolve module-scope declarations from sibling MEMBER files of the same PROGRAM, which restores Hover/F12/FAR and the undeclared-variable hybrid path for Tier 5b cross-MEMBER module data.

**Bug Fixes**

- 🐛 **`SymbolFinder.findSymbol` now honors Tier 1 routine-local shadowing** (#116): lookups from inside a `ROUTINE` now check that routine's `DATA` section before falling back to procedure-local scope, so Hover/F12/FAR resolve same-name locals to the routine declaration instead of the parent procedure variable.
- 🐛 **Cross-file overload resolution no longer regresses when a stale/unrelated FRG is already built**: `MethodOverloadResolver` now falls back to the legacy INCLUDE walk when the graph has no edges for the active file, preventing chained/cross-file overload sites from silently dropping back to param-count-only selection after the new no-solution FRG work.
- 🐛 **`Self.MyQueue.` completion in derived methods now resolves queue members correctly**: chained `SELF.<reference>.` paths now resolve through live member enumeration, so references like `MyQueue &MyQueueType` surface `MyQueueType` fields in method scope.
- 🐛 **Cross-file return-value diagnostics now scan unopened project files deterministically** (#162): `validateDiscardedReturnValues` no longer depends on `TokenCache.getAllCachedUris()` alone; it now includes solution source files and uses shared cross-file loading (live buffer/cache/disk) so warnings do not silently depend on which files are open.
- 🐛 **F12 on `DO RoutineName` now resolves to the matching `ROUTINE` label in the current procedure scope** (#211): DefinitionProvider now uses `DocumentStructure.findRoutines()` plus parent-scope matching, so routine references in `DO ...` statements navigate correctly and do not bleed into unrelated routines.
- 🐛 **`CLIP(...)` hover now resolves as a built-in function in expression contexts** (#213): hover routing no longer misclassifies keyword collisions (e.g. `CLIP`) as control attributes outside control declarations.
- 🐛 **Hover/F12 on structure fields via typed procedure parameters now works** (#215): cases like `Info.Maximized` where `Info` is declared `*WindowInfo` (GROUP/TYPE) now resolve correctly. Parameter type extraction was added for `PROCEDURE(...)` signatures and wired into typed dot-access paths.
- 🐛 **Parameter hover on declaration lines now prefers the declaration scope** (#217): hovering `Info` directly in `PROCEDURE(... *WindowInfo Info)` no longer resolves to a same-named local from a sibling procedure.
- 🐛 **Real-world `abutil.clw` dot-access fixes (expression-safe chain detection + MEMBER-parent type resolution)** (#219): typed member access inside expressions like `CHOOSE(NOT Info.Maximized, ...)` now resolves correctly for both hover and F12; lookup now properly reaches MEMBER parent/include layouts and GROUP/QUEUE type members.
- 🐛 **Removed false `invalid-attribute-context` diagnostics for `Type` identifier usage** (#220): diagnostics now skip attribute validation when keyword-like tokens are used as dot-member suffixes (e.g. `SELF.Sectors.Type`) or as parameter names inside `PROCEDURE(...)` / `FUNCTION(...)` signatures.
- 🐛 **Deep inherited member lookup now resolves from local classes through INCLUDE ancestors** (#239): when a local class derives from an included library chain (e.g. `LocalClient CLASS(MidType)`), hover/F12/dot-member resolution now continues parent traversal using class declarations resolved from current file, INCLUDE graph, and SDI, instead of stopping when the local class is not present in the declaration index.
- 🐛 **Nested local structure chains now complete correctly from bare GROUP/QUEUE roots** (#235): dot-completion now resolves non-`SELF` chained expressions like `problems.Diabetes.` by traversing structure members through local queue/group declarations (including indented members), instead of treating the chain as a literal class name and returning no members.

**Performance**

- ⚡ **#187 high-priority search-loop cooperation + cancellation wiring landed**: `WorkspaceSymbolProvider`, `ImplementationProvider`/`ClassMemberResolver` cross-file implementation scans, and `ReferencesProvider` now share cooperative checkpoints and honor LSP cancellation tokens, so superseded Ctrl+T/Ctrl+F12/FAR requests bail early instead of running full solution scans to completion.
- ⚡ **#187 LSP handler cancellation propagation completed**: server handlers now pass request cancellation tokens into `onImplementation` and `onReferences`, and both providers now stop long-running scans promptly when requests are superseded.

---

### [0.9.8] - 2026-07-03

**Documentation**

- 📝 README updated to reflect v0.9.8 as the latest version and to keep v0.9.7 listed as the previous release.
- 📝 Release timeline documentation corrected: v0.9.7 is recorded as released on 2026-07-02.

---

### [0.9.7] - 2026-07-02

**Highlights**

- Major no-solution UX and navigation improvements across completion, Quick Open, document links, references, and diagnostics.
- Large diagnostics and symbol-resolution expansion, including undeclared-variable coverage and interface/overload correctness.
- Significant cross-file reliability/performance hardening across FAR, implementation scans, and cancellation behavior.

[**→ Full details**](docs/changelogs/CHANGELOG-0.9.7.md)

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
