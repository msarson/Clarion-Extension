# Changelog

All notable changes to the Clarion Extension are documented here.

---

## Recent Versions

### [1.0.4] - Unreleased

#### Editing

- **A VIEW's JOIN folds, and the VIEW's own fold now reaches its own END.** JOIN was never treated as a structure, so its END closed the enclosing VIEW one line early and the JOIN itself could not be folded. The compiler confirmed the shape: every JOIN needs its own END or period, JOINs nest, and INNER is a trailing attribute (`JOIN(...),INNER`), not a prefix. [#504](https://github.com/msarson/Clarion-Extension/issues/504)
- **Prefix completion on a FILE no longer offers its PRE() argument or a KEY's field arguments as fields.** After `ORD:` the list read `ORD:ORD` and `ORD:ORD:ID` and left out `ORD:ID` itself; a structure line now contributes only its column-0 label, so fields, keys and the record group are offered by name. [#499](https://github.com/msarson/Clarion-Extension/issues/499)
- **Dot completion on a FILE label offers its fields.** `Orders.` lists the same fields, keys and record group as `ORD:`, and letters typed after the dot narrow the list. Previously only GROUP, QUEUE and RECORD labels answered a dot. [#505](https://github.com/msarson/Clarion-Extension/issues/505)

#### Maintenance

- **Development, CI and the type definitions now all target Node 20,** the runtime VS Code 1.97 ships. `.nvmrc`, `engines.node` and `@types/node` are pinned to the 20 line, the release workflows read `.nvmrc`, and `npm run test:node20` runs the suite under Node 20 before a release dry run. [#491](https://github.com/msarson/Clarion-Extension/issues/491)
- **The build now compiles with TypeScript 6.0.3 and bundler module resolution.** Output is unchanged; the old node10 resolver, removed in TypeScript 6, could not read `exports`-only packages, which is what kept the language-server protocol package pinned. [#497](https://github.com/msarson/Clarion-Extension/issues/497)
- **The language client and server libraries moved from 8.1 to 10.1 and the protocol package from 3.17.5 to 3.18.3.** No behaviour change is intended; the transport under every feature is newer, so the whole feature set was re-exercised in an Extension Development Host. [#405](https://github.com/msarson/Clarion-Extension/issues/405)

---

### [1.0.3] - 2026-09-13

![33 fixes](https://img.shields.io/badge/fixes-33-1f6feb?style=flat-square) ![5 new](https://img.shields.io/badge/new-5-2da44e?style=flat-square) ![3 performance](https://img.shields.io/badge/performance-3-8250df?style=flat-square)

Forty-one changes, most of them about how the extension reads generated code: the MAP shapes a generated app emits, the procedure names it shares between an EXE and its DLLs, and the FILE, VIEW and KEY structures underneath. Several rules were settled by compiling a fixture, and the same work removed the last second-long cold starts on large programs. Contributions from [@geircodes](https://github.com/geircodes) and [@ClarionLive](https://github.com/ClarionLive) are credited inline.

#### Navigation and hover

- **Same-named procedures across projects.** Hover and Find All References from a call site no longer answer with another project's procedure. A declaration counts only if the calling file can reach it through its own MAP, INCLUDE or MEMBER chain. [#483](https://github.com/msarson/Clarion-Extension/issues/483)
- **MAP prototypes labelled by the MAP that declares them.** A `MODULE()`-wrapped prototype in the PROGRAM's MAP reads Global Procedure, one in a MEMBER's MAP reads Module Procedure, and a `,PRIVATE` prototype says so. [#480](https://github.com/msarson/Clarion-Extension/issues/480)
- **Call sites link the implementation as well as the prototype.** Previously only the MAP line was offered when the module opened `MEMBER('Parent')` without an extension. [#452](https://github.com/msarson/Clarion-Extension/issues/452)
- **Go to Implementation on a prototype with an attribute.** `Proto,LONG` and `Proto,NAME('_x')` now jump, as F12 already did. [#466](https://github.com/msarson/Clarion-Extension/issues/466)
- **Structure labels hover as structures.** A FILE, QUEUE, GROUP or CLASS label is badged as a structure rather than a "Global variable"; a FILE card shows driver, prefix, keys and fields. [#486](https://github.com/msarson/Clarion-Extension/issues/486)
- **One card per field.** A structure field shows the same card from its declaration, its `PRE:Field` use and its `Structure.Field` use, with the owning structure named and the type as declared. [#488](https://github.com/msarson/Clarion-Extension/issues/488)
- **A local shadowed by a same-named structure field resolves again.** With `FoundQ QUEUE,PRE(fq)` holding `loc` and a plain local `loc`, hover on the local returned nothing and references listed the field. [#487](https://github.com/msarson/Clarion-Extension/issues/487)
- **A PROGRAM's global data is Global from inside a procedure too.** It was badged Module variable there. [#489](https://github.com/msarson/Clarion-Extension/issues/489)
- **`PROJECT`, a VIEW's `JOIN` and a FILE's `KEY` now hover,** with context deciding between the VIEW clause and the same-named window attributes. [#472](https://github.com/msarson/Clarion-Extension/issues/472)
- **Fields referenced outside a procedure hover.** `PROJECT(CUS:Name)` in a VIEW showed nothing and `Customer.Name` described the file. [#474](https://github.com/msarson/Clarion-Extension/issues/474)
- **F12 on the field half of `Customer.Name`** now jumps to the field, scoped to its own structure. [#475](https://github.com/msarson/Clarion-Extension/issues/475)
- **A FILE's KEY or INDEX reports its type** instead of `UNKNOWN`. [#476](https://github.com/msarson/Clarion-Extension/issues/476)
- **Fields inherited through `QUEUE(ParentType)` or `GROUP(ParentType)`** hover and navigate. [#468](https://github.com/msarson/Clarion-Extension/pull/468), @geircodes
- **QUEUE and GROUP members read as "Queue Field" and "Group Field",** not "Class Property". [#469](https://github.com/msarson/Clarion-Extension/pull/469), @geircodes
- **A field's own declaration inside a module-scope `GROUP,TYPE`** no longer shows an unrelated same-named field from another file. [#458](https://github.com/msarson/Clarion-Extension/pull/458), @geircodes
- **Hover locations are clickable in all five remaining footers.** [#459](https://github.com/msarson/Clarion-Extension/pull/459), @geircodes
- **A ROUTINE's declaration is reported at its label,** not at the `ROUTINE` keyword, in references, F12 and Ctrl+F12. [#461](https://github.com/msarson/Clarion-Extension/pull/461), @ClarionLive
- **Chained access on an ordinary variable** resolves its third and later segments even with a statement to the left. [#456](https://github.com/msarson/Clarion-Extension/pull/456), @geircodes
- **`?Name` field equates hover as the control they name,** scoped to the enclosing procedure's window. [#454](https://github.com/msarson/Clarion-Extension/pull/454), @geircodes
- **Colon-named class members reached through a dot** hover and navigate. [#451](https://github.com/msarson/Clarion-Extension/pull/451), @geircodes
- **A method implementation whose qualified name contains colons** is indexed as a method, not as a global procedure named after its last segment. [#448](https://github.com/msarson/Clarion-Extension/pull/448), @geircodes
- **A method of a procedure-local CLASS** no longer resolves to another procedure's same-named implementation. [#444](https://github.com/msarson/Clarion-Extension/issues/444)

#### Diagnostics

- **Calling a PRIVATE procedure from another module is reported,** matching the compiler's *Invalid use of PRIVATE procedure*. Passing the procedure as a reference is allowed; an overloaded name is flagged only if every overload is private. [#481](https://github.com/msarson/Clarion-Extension/issues/481)
- **Every documented MAP prototype shape is recognised:** a bare name, `MyProc,LONG`, `MyProc,NAME('_x')`, `Func46(*CSTRING),REAL,C,RAW`. None is reported as undeclared. [#462](https://github.com/msarson/Clarion-Extension/issues/462), [#466](https://github.com/msarson/Clarion-Extension/issues/466)
- **Procedures named `Map…` or `Module…`** are matched to their prototypes; two keyword checks compared by prefix. [#477](https://github.com/msarson/Clarion-Extension/issues/477)
- **A VIEW's JOIN fields are checked against the parent file,** as the compiler does; fields projected inside a JOIN are checked against the joined file. [#473](https://github.com/msarson/Clarion-Extension/issues/473), [#465](https://github.com/msarson/Clarion-Extension/pull/465), @ClarionLive
- **Dot notation in a VIEW** (`File.Field`, `File.Key`) is understood on both the PROJECT and the JOIN side. [#467](https://github.com/msarson/Clarion-Extension/issues/467)
- **Discarded return values through an intermediate field** (`RecordQ.Item.Recalculate(1)`) are reported. [#457](https://github.com/msarson/Clarion-Extension/pull/457), @geircodes
- **Extension-less `MEMBER`, `INCLUDE` and `MODULE` targets** resolve everywhere, so a module opening `MEMBER('Name')` is no longer reported as missing every procedure. [#447](https://github.com/msarson/Clarion-Extension/issues/447), [#449](https://github.com/msarson/Clarion-Extension/issues/449)
- **A file declaring `!UTF8`** is no longer warned that its characters will corrupt the build. [#403](https://github.com/msarson/Clarion-Extension/issues/403)
- **A `RETURN` continued with `|`** no longer greys out its own continuation lines. [#445](https://github.com/msarson/Clarion-Extension/issues/445)

#### Performance

- **First hover, F12 or references on a generated program.** PROGRAM-file MAP prototypes are now indexed, so a member module's first request takes about 60ms instead of 2s. [#483](https://github.com/msarson/Clarion-Extension/issues/483)
- **A call site inside the PROGRAM file** no longer expands the MAP's INCLUDEs for a prototype the file already declares, and a DLL named by `MODULE('x.dll')` no longer reaches the tokenizer. First request about 1.7s to under 250ms. [#484](https://github.com/msarson/Clarion-Extension/issues/484)
- **A quadratic tokenizer phase is gone.** Every function call was being scanned as if it opened a data section: 1.47s to 1ms on a 6,000-line library source, and the whole 7,000-file corpus tokenises in 74s instead of 135s. Two column-0 labels beginning with a keyword, `return:xml` and `Omit:pXPos`, now tokenise as labels. [#485](https://github.com/msarson/Clarion-Extension/issues/485)

#### Configuration and build

- **A `ClarionProperties.xml` outside `%APPDATA%` can be chosen** from the installation list, is offered when a solution opens, and shows as a Config dir row while active. [#479](https://github.com/msarson/Clarion-Extension/issues/479)
- **Builds follow the selected properties file** by passing `ConfigDir` to MSBuild. [#471](https://github.com/msarson/Clarion-Extension/issues/471)
- **On macOS or Linux the extension says why it cannot work** instead of doing nothing. [#446](https://github.com/msarson/Clarion-Extension/issues/446)

#### Syntax

- **Clarion 12 Unicode preview highlighting:** `USTRING`, `REPORT,UNICODE`, `BLOB,UNICODE`, `UCHR`, `UVAL`, `TOANSI`, `TOUNICODE`, and `U'…'` literals with embedded code points. [#399](https://github.com/msarson/Clarion-Extension/issues/399)

---

### [1.0.2] - 2026-09-06

![21 fixes](https://img.shields.io/badge/fixes-21-1f6feb?style=flat-square) ![1 performance](https://img.shields.io/badge/performance-1-8250df?style=flat-square)

A correctness release about silent failure: several ways a solution could load in a degraded state looked identical to a healthy load, so features returned nothing and the extension read as broken rather than misconfigured. Those now report themselves. Many of the navigation and diagnostic fixes were contributed by [@geircodes](https://github.com/geircodes).

#### Solution and configuration

- **Unresolved source files are counted and named.** They were dropped from the file graph in silence while the build still reported healthy; now a log line, the graph-status notification and the Clarion Tools panel all carry `N of M unresolved`. [#434](https://github.com/msarson/Clarion-Extension/issues/434)
- **Re-opening a recent solution validates its stored build configuration** instead of adopting a stale one that matches no `.red` section. [#437](https://github.com/msarson/Clarion-Extension/issues/437)
- **The `%THISDIR%`, `%WinUserApplicationData%` and `%WinCommonApplicationData%` redirection macros are implemented.** An unrecognised macro was left in the path as text, so every directory on that line failed to resolve; `%THISDIR%` expands per file inside included `.red` files. [#435](https://github.com/msarson/Clarion-Extension/issues/435)
- **Every command carries a `Clarion` category,** so typing "clarion" in the Command Palette finds all 57, including Open Solution. [#438](https://github.com/msarson/Clarion-Extension/issues/438)
- **Open Detected Solution is hidden from the Command Palette,** where it failed for want of the path the extension's own UI supplies. [#433](https://github.com/msarson/Clarion-Extension/issues/433), @ClarionLive

#### Navigation and hover

- **A bare local CLASS used as its own instance resolves** for hover, F12, Ctrl+F12, completion, signature help and the discarded-return warning, as a bare QUEUE, GROUP or FILE already did. [#439](https://github.com/msarson/Clarion-Extension/pull/439), @geircodes
- **A GROUP, QUEUE or CLASS field's own declaration hovers as that field,** not as an unrelated same-named variable, and the card names the owning structure. [#424](https://github.com/msarson/Clarion-Extension/pull/424), @geircodes
- **Attribute, built-in and keyword names that collide with your own names** no longer hijack the hover card or the diagnostic. [#425](https://github.com/msarson/Clarion-Extension/pull/425), @geircodes
- **A colon in the enclosing SELF or PARENT scope line** no longer truncates identifiers and kills hover, F12, completion and signature help. [#431](https://github.com/msarson/Clarion-Extension/pull/431), @geircodes
- **A local CLASS's indented END** no longer captures the following PROCEDURE as one of its methods. [#430](https://github.com/msarson/Clarion-Extension/pull/430), @geircodes
- **61 built-ins that hovered as "undefined"** now show their signatures; the loader reads both shapes the built-ins data is authored in.
- **The Outline no longer repeats `in <Parent>` after every symbol,** and filtering the Structure View by a procedure's name still shows what it declares. [#426](https://github.com/msarson/Clarion-Extension/pull/426), [#418](https://github.com/msarson/Clarion-Extension/issues/418), @geircodes

#### Diagnostics

- **Discarded-return warnings survive a trailing comment** on a CRLF line. [#429](https://github.com/msarson/Clarion-Extension/pull/429), @geircodes
- **A colon-named dot-call receiver or method** (`My:StringTheory.IsEmpty()`) is checked for a discarded return value. [#427](https://github.com/msarson/Clarion-Extension/pull/427), @geircodes
- **An undeclared bare word is no longer accepted because an unrelated CLASS or INTERFACE declares a same-named member;** the procedure index now tracks structure bodies. A class member named `Map` no longer hides the file's later method implementations from that index. [#392](https://github.com/msarson/Clarion-Extension/pull/392), @geircodes
- **The missing-include check follows a `MEMBER` reached through an `INCLUDE('member.clw')` shim,** and understands the extension-less `MEMBER('Program')` form. [#395](https://github.com/msarson/Clarion-Extension/pull/395), @geircodes
- **A structure keyword used as an attribute argument or parameter type** (`FROM(QUEUE)`, `PROCEDURE(FILE,KEY)`) no longer loses its first character. [#416](https://github.com/msarson/Clarion-Extension/issues/416)
- **No false "missing END" on a WINDOW** whose control references a structure keyword on a continuation line. [#415](https://github.com/msarson/Clarion-Extension/issues/415)

#### Performance

- **Hovering an undeclared bare word in a big generated module** no longer freezes for about 10 seconds before showing nothing (10.5s to 13ms), and Clarion's predefined compiler flags such as `DLL_MODE` and `_DEBUG_` get a hover card instead of an undeclared warning. [#420](https://github.com/msarson/Clarion-Extension/issues/420)

#### Maintenance

- **The shelved ANTLR grammar experiment moved to its own archived repository,** [Clarion-ANTLR-Grammar](https://github.com/msarson/Clarion-ANTLR-Grammar); its lockfile had been raising Dependabot alerts against a toolchain the extension does not use.

---

### [1.0.1] - 2026-08-09

![48 fixes](https://img.shields.io/badge/fixes-48-1f6feb?style=flat-square) ![9 new](https://img.shields.io/badge/new-9-2da44e?style=flat-square) ![23 performance](https://img.shields.io/badge/performance-23-8250df?style=flat-square)

A stability release on top of the 1.0 overhaul: more startup and hover performance work verified on the real 40-project, 3,000-file solution, and a long run of hover, completion and diagnostic fixes, many contributed by [@geircodes](https://github.com/geircodes). The first interaction after startup is no longer cold, the startup validators no longer freeze the editor, and `.app` global data is no longer flagged undeclared in generated modules.

#### New

- **Find All References spans the DLL boundary.** From an exported procedure's implementation, its declaration, or any consuming app's `MODULE('x.dll')` re-declaration or call, the results cover all of them; exports are read from the project's `.exp`. [#330](https://github.com/msarson/Clarion-Extension/issues/330)
- **F12 on a MAP declaration navigates to the implementation,** including a multi-DLL re-declaration that hops into the defining project. [#330](https://github.com/msarson/Clarion-Extension/issues/330)
- **GOTO labels, and BREAK/CYCLE loop labels, are navigation symbols** with references, F12 and hover scoped to the enclosing procedure or routine. [#321](https://github.com/msarson/Clarion-Extension/issues/321)
- **The section name in `INCLUDE('file','section')`** resolves to the `SECTION('name')` line for F12 and hover. [#343](https://github.com/msarson/Clarion-Extension/issues/343)
- **`?Ctrl` field-equate completion is scoped to the current procedure's window.** [#385](https://github.com/msarson/Clarion-Extension/pull/385), @geircodes
- **Hover footers render locations as clickable links.** [#389](https://github.com/msarson/Clarion-Extension/pull/389), @geircodes
- **`INCLUDE`, `MEMBER`, `OMIT`, `COMPILE` and `PRAGMA` are offered as completions.** [#394](https://github.com/msarson/Clarion-Extension/pull/394), @geircodes
- **A `clarion/getServerVersion` request** returns the running server's version and build date, also surfaced by a Show Server Version command.

#### Navigation and hover

- **`.app` global data is no longer flagged undeclared in a generated MEMBER module.** [#396](https://github.com/msarson/Clarion-Extension/issues/396), @peterparker57
- **Member completion keeps working past the dot** (`SELF.Th`, `oKanban.Ini`). [#370](https://github.com/msarson/Clarion-Extension/issues/370)
- **Go To Definition works on globals declared in INCLUDEd files,** including header-less data includes, and globals pulled in via `INCLUDE(...),ONCE` are visible to F12 and the undeclared-variable check. [#339](https://github.com/msarson/Clarion-Extension/issues/339), [#334](https://github.com/msarson/Clarion-Extension/issues/334)
- **Bare names no longer bind to fields of PRE()'d or PRE-less structures;** a field needs its `Pre:Field` or `Structure.Field` qualifier, as the language requires. [#265](https://github.com/msarson/Clarion-Extension/issues/265), [#350](https://github.com/msarson/Clarion-Extension/issues/350)
- **Hover and F12 share one symbol finder,** so the two can no longer disagree on which declaration a variable resolves to. [#265](https://github.com/msarson/Clarion-Extension/issues/265), [#327](https://github.com/msarson/Clarion-Extension/issues/327)
- **Hover on a bare word no longer matches an unrelated CLASS or INTERFACE member.** [#391](https://github.com/msarson/Clarion-Extension/pull/391), @geircodes
- **A colon-prefixed dotted access** (`GLOB:Helper.Prop`) resolves its full receiver. [#386](https://github.com/msarson/Clarion-Extension/pull/386), @geircodes
- **`GROUP(TypeName)`, `QUEUE(TypeName)` and `RECORD(TypeName)` hover to the referenced type.** [#383](https://github.com/msarson/Clarion-Extension/pull/383), @geircodes
- **A hover doc-comment no longer drops its first character.** [#387](https://github.com/msarson/Clarion-Extension/pull/387), @geircodes
- **A local instance no longer hovers as a same-named WINDOW control,** and control-named labels, bare built-in constants and keyword-prefixed type names are classified correctly. [#381](https://github.com/msarson/Clarion-Extension/issues/381), [#380](https://github.com/msarson/Clarion-Extension/pull/380), @geircodes
- **Class members declared after a same-line self-closing GROUP, QUEUE or RECORD** are no longer hidden. [#376](https://github.com/msarson/Clarion-Extension/pull/376), @geircodes
- **F12 on a parameter** no longer jumps to an earlier parameter whose name it is a prefix of. [#377](https://github.com/msarson/Clarion-Extension/pull/377), @geircodes
- **Hovering inside a string literal runs no resolvers,** and a cross-file miss is not re-paid on every hover. [#373](https://github.com/msarson/Clarion-Extension/issues/373)
- **Signature help shows all inherited overloads** in an embedded-editor shadow buffer. [#369](https://github.com/msarson/Clarion-Extension/issues/369)
- **References and CodeLens counts no longer collapse to 2** for a procedure whose name also exists in another project, and reference counts on procedure-local class methods no longer bleed across the app family. [#364](https://github.com/msarson/Clarion-Extension/issues/364), [#346](https://github.com/msarson/Clarion-Extension/issues/346)
- **Prefixed-field lookups follow redirection to the parent program,** and dictionary FILE fields pulled in by INCLUDE are no longer flagged undeclared. [#348](https://github.com/msarson/Clarion-Extension/issues/348), [#347](https://github.com/msarson/Clarion-Extension/issues/347)
- **Comment banners above `MEMBER(...)`** no longer disable cross-file features; the module header is found wherever it is. [#337](https://github.com/msarson/Clarion-Extension/issues/337)
- **Multi-argument file references** (`INCLUDE('file','section')`, `LINK('file',flag)`) get their hover, link and graph edge. [#342](https://github.com/msarson/Clarion-Extension/issues/342)
- **Files changed outside the editor** no longer serve stale results until a reload. [#340](https://github.com/msarson/Clarion-Extension/issues/340)
- **Prefix highlighting no longer bleeds through comments.** [#397](https://github.com/msarson/Clarion-Extension/issues/397), @krosoftware

#### Diagnostics

- **A structure keyword used as a plain variable or label name** no longer draws a false "structure not terminated"; `GROUP` as a global PROCEDURE label is no longer flagged. [#378](https://github.com/msarson/Clarion-Extension/pull/378), [#384](https://github.com/msarson/Clarion-Extension/pull/384), @geircodes
- **`PRAGMA(...)` is no longer mistyped as a function** that swallowed every later procedure's completion scope. [#393](https://github.com/msarson/Clarion-Extension/pull/393), @geircodes
- **A prefixed label whose prefix is a reserved word** (`Return:NotSet EQUATE(0)`) is no longer flagged as a reserved-keyword label. [#372](https://github.com/msarson/Clarion-Extension/issues/372)
- **PROJECT of overlay-GROUP fields** is no longer flagged. [#349](https://github.com/msarson/Clarion-Extension/issues/349)
- **Bare MAP prototypes implemented in the same member module** no longer warn. [#338](https://github.com/msarson/Clarion-Extension/issues/338)
- **A comment on the `CODE` line** no longer breaks the whole procedure body. [#333](https://github.com/msarson/Clarion-Extension/issues/333)
- **Compile constants defined as EQUATEs in included files** are no longer reported missing. [#335](https://github.com/msarson/Clarion-Extension/issues/335)
- **The attribute-applicability table was swept against the Clarion 11.1 docs:** 96 additions across 20 attributes, removing false "not applicable" warnings such as `ICON` on a menu ITEM. [#332](https://github.com/msarson/Clarion-Extension/issues/332)

#### Performance

- **The first hover, F12 or Find All References after startup is no longer cold,** and the cross-file index pre-warm survives a restart. [#363](https://github.com/msarson/Clarion-Extension/issues/363), [#295](https://github.com/msarson/Clarion-Extension/issues/295)
- **Startup validators no longer freeze the editor** in multi-second blocks: they run one at a time with yields between them. [#367](https://github.com/msarson/Clarion-Extension/issues/367)
- **F12 on a built-in function** no longer runs a 24-second cold walk before finding nothing. [#374](https://github.com/msarson/Clarion-Extension/issues/374)
- **F12 on a library procedure** no longer freezes the editor for 15 seconds; hover on a procedure call resolves from the procedure index instead of tokenizing the include chain. [#362](https://github.com/msarson/Clarion-Extension/issues/362)
- **Hover on a large program module** no longer freezes for tens of seconds, and a repeated Go To Definition on the same symbol is instant. [#361](https://github.com/msarson/Clarion-Extension/issues/361)
- **Tokenising large files is about three times faster.** [#353](https://github.com/msarson/Clarion-Extension/issues/353)
- **Opening a file no longer freezes while the VIEW field validator warms up,** and validators no longer repeat their cross-file work on every pass. [#352](https://github.com/msarson/Clarion-Extension/issues/352), [#345](https://github.com/msarson/Clarion-Extension/issues/345)
- **Undeclared-variable analysis** no longer stalls on built-in statements, chases fragments of compound names or the leaves of dotted chains, or probes every member module per name. [#345](https://github.com/msarson/Clarion-Extension/issues/345), [#351](https://github.com/msarson/Clarion-Extension/issues/351), [#358](https://github.com/msarson/Clarion-Extension/issues/358)
- **The missing-include check** no longer re-walks the include universe per class or rebuilds the reachability walk redundantly; include-chain resolution is cached per project. [#345](https://github.com/msarson/Clarion-Extension/issues/345), [#366](https://github.com/msarson/Clarion-Extension/issues/366), [#344](https://github.com/msarson/Clarion-Extension/issues/344)
- **The discarded-return-value check** caches its class enumerations across passes and across restarts. [#358](https://github.com/msarson/Clarion-Extension/issues/358)
- **Cross-file diagnostics no longer wait for a startup disk sweep,** and startup background work no longer stampedes the disk. [#355](https://github.com/msarson/Clarion-Extension/issues/355), [#357](https://github.com/msarson/Clarion-Extension/issues/357)
- **Reference-count CodeLens** shows an estimate during the startup burst instead of running its exact scan. [#316](https://github.com/msarson/Clarion-Extension/issues/316)
- **Hovering a procedure call** no longer costs about 350ms every time, and `DocumentStructure` no longer builds trace strings on every tokenize. [#354](https://github.com/msarson/Clarion-Extension/issues/354)
- **Class-constant and project-constant lookups are cached,** and code actions no longer re-scan every project's files on each cursor move. [#368](https://github.com/msarson/Clarion-Extension/issues/368), [#365](https://github.com/msarson/Clarion-Extension/issues/365)
- **Opening a MEMBER file no longer re-validates its whole parent PROGRAM,** and no-op change events skip the pipeline. [#359](https://github.com/msarson/Clarion-Extension/issues/359)

#### Configuration and build

- **Custom build configurations no longer lose `[Debug]` and `[Release]` redirection entries;** those sections follow the mode switch, not the configuration name. [#331](https://github.com/msarson/Clarion-Extension/issues/331)
- **Redirection honours the `|` stop marker.** [#356](https://github.com/msarson/Clarion-Extension/issues/356)
- **Owner-project-first redirection on every navigation surface,** so same-named includes no longer resolve to another project's copy. [#328](https://github.com/msarson/Clarion-Extension/issues/328), [#329](https://github.com/msarson/Clarion-Extension/issues/329)

#### Maintenance

- **Hover is served entirely by the language server,** and 2,100 lines of dead client-side document machinery are removed. [#326](https://github.com/msarson/Clarion-Extension/issues/326), [#341](https://github.com/msarson/Clarion-Extension/issues/341)
- **`brace-expansion` denial-of-service advisories patched** in the transitive dependency; no runtime change.

---

### [1.0.0] - 2026-07-11

**Highlights**

- Ground-up performance overhaul verified on a real 40-project / 3,000-file solution: indexes persisted across sessions, background work time-sliced, no event-loop freezes; hover says "still indexing" during startup instead of vanishing.
- Overload-aware navigation everywhere — F12, Ctrl+F12, hover, references and signature help pick the overload matching the call's argument types, including member, reference and cross-file arguments.
- New refactors on Ctrl+.: Surround With…, Negate Condition, Flip IF/ELSE, Introduce EQUATE, Create routine from `DO`; new diagnostic for a literal passed to a by-reference parameter; hover on INCLUDE/MODULE/MEMBER/LINK filenames shows the resolved path.
- Language client/server upgraded to LSP 8.x.

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-1.0.0.md)

---

### [0.9.9] - 2026-07-04

**Highlights**

- Completion: qualifier completion honours the typed qualifier, dot completion shows member types inline, cross-file global-data parity for MEMBER files, wider no-solution entry-point coverage.
- Status bar: TypeScript-style initialization flow and a build/generation lifecycle.
- Resolution fixes: routine-local shadowing honoured, cross-file overloads no longer regress on a stale graph, `Self.MyQueue.` completion in derived methods, F12 on `DO RoutineName`, `CLIP(...)` hover in expressions.

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-0.9.9.md)

---

### [0.9.8] - 2026-07-03

**Highlights**

- Documentation-only release: README and release timeline corrected for 0.9.7.

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-0.9.8.md)

---

### [0.9.7] - 2026-07-02

**Highlights**

- Major no-solution UX and navigation improvements across completion, Quick Open, document links, references, and diagnostics.
- Large diagnostics and symbol-resolution expansion, including undeclared-variable coverage and interface/overload correctness.
- Significant cross-file reliability/performance hardening across FAR, implementation scans, and cancellation behavior.

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-0.9.7.md)

---

### [0.9.6] - 2026-04-23

**Highlights**

- New Solution wizard and stale-solution cleanup.
- Missing INCLUDE diagnostic with a code action, missing DefineConstants diagnostic, missing Link/DLL equates code action.
- Find All References / Rename fixes; false-positive missing-include, missing-constants and `BREAK outside LOOP` diagnostics removed (#85, #86); commented-out INCLUDEs ignored.

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-0.9.6.md)

---

### [0.9.5] - 2026-04-21

**Highlights**

- Hover documentation expanded across hundreds of built-ins: compiler directives, file I/O, data statements, graphics, OCX/OLE, registry/INI, window/event, and report band structures.
- Built-in hover narrows overloads by first-argument type; context-aware hover for `HIDE`, `DISABLE` and `TYPE`; method hover redesigned into structured sections.

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-0.9.5.md)

---

### [0.9.4] - 2026-04-19

**Highlights**

- Hover and completion for `PROP:`, `PROPPRINT:` and `EVENT:` equates; CodeLens reference counts above procedures and classes (#72).
- Flatten continuation lines (#70), Expand Selection through structure nesting (#71), discarded-return warnings for MAP/MODULE procedures (#51).
- Fixes: INTERFACE member navigation via `&IfaceName`, reference-variable hover types, reserved keywords as labels (#69), six formatter bugs (#66), structure keywords at column 0 (#68), unreachable-code false positives (#67), diagnostics flashing on open.

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-0.9.4.md)

---

### [0.9.3] - 2026-04-19

**Highlights**

- Diagnostics: reserved keywords used as labels, discarded return values, `BREAK`/`CYCLE` outside `LOOP`/`ACCEPT`; false-positive unreachable code after sequential `IF..RETURN..END` fixed; diagnostics no longer flash and vanish on open.
- Editing: Flatten continuation lines, Expand Selection through structure nesting, CodeLens reference counts; six formatter bugs fixed.
- Hover and completion for `PROP:`, `PROPPRINT:` and `EVENT:` equates.

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-0.9.3.md)

---

### [0.9.2] - 2026-04-18

**Highlights**

- `StructureDeclarationIndexer` replaces the class-only indexer; CLASS index build parallelised; hot-path disk reads and the hover/F12 hang on cursor movement eliminated.
- Discarded method return values warned; F12 for procedure parameters, `LOC:`-prefixed parameters, inherited-method hover and overloaded implementations fixed; client logs routed to the VS Code Output channel.

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-0.9.2.md)

---

### [0.9.1] - 2026-04-14

**Highlights**

- Extension bundled with esbuild; GitHub Actions moved to Node.js 24-compatible versions; `testrelease.yml` dry-run workflow added.

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-0.9.1.md)

---

### [0.9.0] - 2026-04-14

**Highlights**

- Dot-triggered member completion for CLASS instances and `SELF`; signature help for class methods.
- Hover, F12 and Ctrl+F12 across parent/include files for equates, methods on typed variables and cross-file dot access; `MemberLocatorService` unifies dot-access resolution.
- Find All References fixes for MAP procedure calls and module-scoped symbols; ROUTINE-scoped local variable navigation.

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-0.9.0.md)

---

### [0.8.9] - 2026-04-13
**Security Patch**

**Highlights:**
- Resolved Dependabot alerts: `serialize-javascript` RCE, `diff` DoS
- Replaced deprecated `vscode-test` with `@vscode/test-electron`

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-0.8.9.md)

---

### [0.8.8] - 2026-04-12
**Rename Symbol, Document Highlight & Workspace Search**

**Highlights:**
- Rename Symbol (F2) — scope-aware rename across entire workspace
- Document Highlight — all occurrences highlighted on cursor
- Workspace Symbol Search (Ctrl+T) — find any procedure/class/label across solution
- Hover/F12 for local class instances inside `MethodImplementation` scopes
- `!!!` doc comments now shown in hover for local variables and classes
- FAR on CLASS labels now returns correct positions and method implementations
- `SELF.Method()` / `PARENT.Method()` Go to Implementation and hover cross-file fix

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-0.8.8.md)

---

### [0.8.7] - 2026-03-15
**Find All References, INTERFACE Support & Hover Quality**

**Highlights:**
- Find All References (Shift+F12) — full scope-aware coverage: SELF/PARENT members, typed variables, chained chains, MAP/MODULE procedures, structure fields, interfaces, IMPLEMENTS, CLASS type names, overload filtering
- Complete Clarion INTERFACE language support — hover, F12, Ctrl+F12, references for interface methods, IMPLEMENTS(), and 3-part `Class.Interface.Method` implementations
- Hover quality overhaul — clean class type cards, class property / interface method labels, implementation body previews removed, F12/Ctrl+F12 hints suppressed when already at declaration/implementation
- Deep chained navigation — `SELF.Order.RangeList.Init` hover/F12/Ctrl+F12 at any chain depth
- Typed variable member navigation — hover, F12, Ctrl+F12, and references for `obj.Method()` patterns
- 25 new built-in function hovers; COMPILE/OMIT folding
- 597 tests passing

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-0.8.7.md)

---

### [0.8.6] - 2026-01-12
**Cross-Project Navigation & Solution View Enhancements**

**Highlights:**
- 50-70% faster Ctrl+F12 navigation via CrossFileCache (2-4s → <100ms)
- Full support for routines with namespace prefixes (`DumpQue::SaveQState`)
- Dependency-aware build order with progress indicators
- Fixed FUNCTION declarations, procedures without parameters
- Method hover priority fix (methods named like keywords)
- Batch UpperPark commands and enhanced context menus
- All 498 tests passing

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-0.8.6.md)

---

### [0.8.5] - 2026-01-09
**Folding Provider Fix**

**Highlights:**
- Fixed APPLICATION structures not creating folds
- Fixed nested MENU structures not folding
- Removed arbitrary indentation limits for structure recognition

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-0.8.5.md)

---

### [0.8.4] - 2026-01-09
**Architecture Refactoring & Documentation Overhaul**

**Highlights:**
- New SymbolFinderService eliminates ~510 lines of duplicate code
- Full Clarion Template language support (.tpl/.tpw files)
- Complete documentation restructure with user-friendly guides
- Major performance improvements in MAP resolution
- Unicode quote conversion fix in Paste as Clarion String

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-0.8.4.md)

---

### [0.8.3] - 2025-12-31
**Token Performance Optimization (Phase 1)**

**Highlights:**
- 50-60% performance improvement via DocumentStructure caching
- Parent scope index for O(1) lookups
- 15 new tests for caching infrastructure
- Foundation for incremental tokenization

**Key Changes:**
- Implemented DocumentStructure caching service
- Added parent index for fast scope lookups
- Fixed double-caching issue in SolutionManager
- All 492 tests passing

---

### [0.8.2] - 2025-12-30
**Build System Enhancements**

**Highlights:**
- Fixed build configuration persistence
- MSBuild parameter handling improvements
- Separate keyboard vs context menu build behavior
- Terminal reuse for build tasks

**Key Changes:**
- Configuration changes now save correctly
- PowerShell command escaping fixed
- Auto-migration of old-style configurations
- Improved build completion messages

---

### [0.8.0] - 2025-12-30
**Major Refactoring & Performance**

**Highlights:**
- CrossFileResolver service consolidation
- Eliminated scanning hundreds of MEMBER files
- Fast MODULE resolution
- Critical MAP resolution fixes

**Key Changes:**
- Unified cross-file navigation logic
- Fixed FUNCTION token filtering
- Improved DLL/LIB MODULE handling
- Enhanced MAP INCLUDE tracking

---

### [0.7.9] - 2025-12-29
**Navigation & Scope Analysis**

**Highlights:**
- Scope-aware F12 (Go to Definition)
- New ScopeAnalyzer service
- 29 new scope analysis tests
- Variable shadowing fixes

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

For versions **0.7.0 and newer**, see the individual changelog files in [dev/docs-internal/changelogs/](dev/docs-internal/changelogs/).

For versions **0.6.x and earlier**, see [docs/archive/CHANGELOG-HISTORICAL.md](docs/archive/CHANGELOG-HISTORICAL.md).

---

## Version Numbering

We use [Semantic Versioning](https://semver.org/):
- **Major** (x.0.0) - Breaking changes
- **Minor** (0.x.0) - New features, backwards compatible
- **Patch** (0.0.x) - Bug fixes

---

[← Back to README](README.md)
