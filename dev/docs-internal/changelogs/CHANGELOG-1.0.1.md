# Clarion Extension — 1.0.1 (2026-08-09)

Archived from CHANGELOG.md at the 1.0.4 release; the three newest versions stay there in full.

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

