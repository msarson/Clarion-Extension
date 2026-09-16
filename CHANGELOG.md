# Changelog

All notable changes to the Clarion Extension are documented here.

---

## Recent Versions

### [1.0.4] - Unreleased

#### Navigation and hover

- **A call written with a space before its parenthesis is a call everywhere.** NetTalk generates `NetDebugTrace ('…')` throughout a program, and `EQUATE (5)`, `COMMAND ('/x')` and `DIM (5)` are common hand-written forms. The tokenizer read the name, the space and the arguments as a single token, so Find All References never listed those sites, call hierarchy and the unresolved-call check could not see them, and hover on a string inside one ran the full resolver chain. Whitespace before the parenthesis now tokenizes exactly as none does; on a 6,000-file solution that surfaces 863 such calls with no change to any structure or diagnostic. [#546](https://github.com/msarson/Clarion-Extension/issues/546)
- **Find All References on a class method reaches every module of the program.** A call in another MEMBER module was found only when the cursor was in that module, because the search covered the class's own files and the files that include its .inc, and a module calling a method on an object declared in the PROGRAM includes nothing of the sort. Every PROGRAM the search reaches now contributes its MEMBER modules, as the search for PROGRAM globals already does. Rename benefits directly: started at the implementation it now rewrites callers in other modules and lists the generated ones it skipped. [#550](https://github.com/msarson/Clarion-Extension/issues/550)
- **F12, hover and references reach a field of a GROUP declared inline in a CLASS.** `SELF.AppFrame.ClientYPos` in a class method found nothing after `AppFrame`, because the chain walk asked for the class named by the member's type and a bare GROUP names none. An inline GROUP, QUEUE or RECORD member is now its own type: the next segment is looked up among its fields in the declaring file, and a nested inline structure chains the same way. [#552](https://github.com/msarson/Clarion-Extension/issues/552)
- **Find All References on an INCLUDE line lists every file that includes that file.** With the cursor on `INCLUDE('x.inc')`, or on the name inside the quotes, the result is the INCLUDE line in every file of the solution that includes the same file, one hop up, so the file that carries an include into a program's global scope is one search away; run it again on that line to go up another level. Includes inside conditional COMPILE or OMIT blocks are listed like any other. [#557](https://github.com/msarson/Clarion-Extension/issues/557)
- **Show Call Hierarchy works on procedures, methods and routines.** Shift+Alt+H, or Peek Call Hierarchy, on a procedure name or a call lists who calls it and what it calls, a level at a time. Callers come from Find All References narrowed to actual call sites, so a procedure passed to START() is not counted; `DO Name` is a call to the routine; a call from a PROGRAM's main code is attributed to a PROGRAM item; a callee resolves to its implementation the way Ctrl+F12 does. [#509](https://github.com/msarson/Clarion-Extension/issues/509)
- **A variable declared with a colon-qualified structure type, such as `GROUP(CFG:ConnectionSettingsType)`, now completes and hovers its fields.** The type argument was dropped or cut at the prefix, so the variable was looked up under its own name and offered nothing, while the same declaration with a bare type name worked. [#537](https://github.com/msarson/Clarion-Extension/pull/537) @geircodes
- **Types declared with a prefixed label, such as `GLOB:SomeType GROUP,TYPE`, and types declared in the project's own folder are now in the declaration index.** The index skipped any label containing a colon, and resolved the redirection file's `.\` entries against the Clarion install rather than the project, so a type sitting beside the .app was invisible to completion and hover while Go to Definition still found it. The on-disk index cache is rebuilt once. [#538](https://github.com/msarson/Clarion-Extension/pull/538) @geircodes
- **Field hover reaches a type declared outside the current file's INCLUDE chain, and the fields a typed QUEUE or GROUP adds inline.** Hover walked only this file's own includes, so `Var.Field` was silent where completion and F12 already answered; and a `QUEUE(SomeType)` with extra fields of its own resolved through the type only, so those fields hovered as nothing. The declaration index is consulted, preferring a copy in the requesting file's own folder, and the variable's own declaration block is searched first, scoped to the nearest declaration above the cursor. [#539](https://github.com/msarson/Clarion-Extension/pull/539) @geircodes
- **Hovering the structure name in `Struct.Field` outside any procedure now describes the structure, not the field.** With the cursor on `ItemQ` in `ItemQ.CategoryName` the hover showed the CategoryName field card when that field was declared inline in the QUEUE, but the QUEUE itself when the field came from the type argument. The dotted-reference lookup answers only for a cursor at or past the dot, as the in-procedure path already does; the field half is unchanged. [#540](https://github.com/msarson/Clarion-Extension/issues/540)
- **A colon-joined label is one word to the editor.** Ctrl+hover on `DO CopyAssembly:CopyNow:CopyWalls:One:Adj` underlined only `CopyNow`, and double-click or Ctrl+D selected one segment, because the language declared no word pattern and VS Code's default stops at a colon. The word pattern now joins prefix segments across `:` and `::`, and a language default for the editor's word separators does the same for double-click and Ctrl+D, while dot notation stays per segment. [#534](https://github.com/msarson/Clarion-Extension/issues/534)
- **The Structure view no longer lists `IF x THEN DO Routine END` lines inside a routine as data declarations.** A routine without a DATA section was treated as if declarations could follow, so each such line appeared as a field named `DO Routine`, with the name cut at the first colon; it is executable code from its first line and shows nothing. [#533](https://github.com/msarson/Clarion-Extension/issues/533)
- **Clarion Quick Open now honours files.exclude and search.exclude, lists same-named files separately, and covers every workspace root.** Files under an excluded folder such as `**/Archive` no longer appear, two files with the same name in different folders are both listed and told apart by their folder, shown as `root • folder` like VS Code's own picker, and a multi-root workspace's other roots are searched too. Previously the first folder scanned won and hid the others. [#532](https://github.com/msarson/Clarion-Extension/issues/532)
- **Hovering ELSE, ELSIF, OF or OROF now says which CASE or IF it belongs to, its position among the branches, its own condition, and links back to the opening line.** ELSE previously showed the generic keyword card whatever it belonged to, because the owner lookup checked a token type CASE and IF never have; the branch data the structure walker already records is read instead, so a nested unrelated IF earlier in a CASE no longer steals the attribution. [#518](https://github.com/msarson/Clarion-Extension/pull/518), [#520](https://github.com/msarson/Clarion-Extension/pull/520) @geircodes
- **A class implementation compiled through LINK() and not listed in the .cwproj now gets document links, and every file the solution reaches is in the file graph.** The graph scanned only the files each .cwproj lists, so a hand-coded class file reached through its CLASS MODULE attribute had no node: nothing in it was underlined and hover reported its includes as not found. The build now walks the referenced-file closure, an edit that names a new include pulls it in straight away, and the perf driver has a links mode for checking a file. [#522](https://github.com/msarson/Clarion-Extension/issues/522)
- **Find All References and rename now search a class implementation compiled through LINK().** The search set came from the .cwproj file lists, so a call to a MAP procedure made inside such a file was never found and rename left it untouched. Implementation files the file graph reaches through a CLASS MODULE attribute are now searched too, within the declaring project. [#523](https://github.com/msarson/Clarion-Extension/issues/523)
- **Find All References on a PROGRAM global now reaches every MEMBER('program') module.** A variable declared in the PROGRAM file, or in a file it includes at global level, was searched in the declaring file only, so every use inside a member module went unreported. The search now covers the program's named member modules and leaves a bare MEMBER() universal module out, as the language does. [#524](https://github.com/msarson/Clarion-Extension/issues/524)
- **Find All References works again on prefixed labels such as `GLO:Name` and `GVF:Owner`.** The index that decides which files are worth scanning split identifiers at the colon, so every file answered "not present" and the search returned nothing for any prefixed global, and the reference-count lens showed a wrong count for them. [#525](https://github.com/msarson/Clarion-Extension/issues/525)
- **Find All References on an exported global now spans the data DLL that defines it and every app that references that DLL.** A global such as `GVF:Owner` is defined in the data DLL's generated globals module, exported by name in its .exp, and re-declared EXTERNAL in each consuming app; references used to stop at the app under the cursor. The family is found through the project references and the .exp, so a same-named global in an unrelated program stays out, and an EXTERNAL declaration whose DLL is outside the solution falls back to a solution-wide search. Rename still stays inside the declaring project. The same change fixes the export index keying its parsed .exp files by folder alone, which on a solution whose .cwproj files share one folder handed the first project's exports to every project and could mis-scope procedure references too. [#526](https://github.com/msarson/Clarion-Extension/issues/526)
- **Rename now follows references across the DLL family for hand-coded files, and says why occurrences in generated files were left alone.** Renaming an exported global or a DLL-exported procedure from a hand-coded app rewrites the defining project and the other consumers too. Files the .cwproj marks as generated are never rewritten: a rename started in one is refused with the reason, and occurrences in generated files elsewhere are skipped, with a warning listing each file and its occurrence count and noting that the change belongs in the .app followed by a regenerate. [#527](https://github.com/msarson/Clarion-Extension/issues/527)
- **The rename box opens at once; the reference search runs after Enter.** F2 on a method in a large solution took five to fourteen seconds before the box appeared, because the pre-flight searched every reference to decide whether the declaration was generated. It now resolves the declaration the way F12 does and checks that, and the search happens inside the rename itself, where the editor shows progress. [#553](https://github.com/msarson/Clarion-Extension/issues/553)
- **Rename is refused only in generated code, and always there.** The checks that refused a rename because the file sat in a library folder, because the prototype carried `,DLL`, or because its MODULE could not be resolved are gone: a developer who keeps their own classes under `Accessory\libsrc\win` could not rename a method in their own file, and a rename in hand-written source is the developer's call and a single undo. The generated-code rule is now the only one, and it is absolute: a rename never starts from a generated file, whatever the symbol, and a symbol declared in a generated file is refused from anywhere; started from hand-written source, occurrences in generated files are skipped and reported. [#548](https://github.com/msarson/Clarion-Extension/issues/548), [#549](https://github.com/msarson/Clarion-Extension/issues/549)
- **A library class file the templates list in the project is not treated as generated code.** The Clarion IDE flags every file a template adds to the .cwproj as Generated, including third-party class sources it merely links, so F2 in an accessory's implementation file was refused as generated while the same method was renameable from its declaration. A file under a library folder is library source whatever the flag says. [#551](https://github.com/msarson/Clarion-Extension/issues/551)
- **A method reached through an object, such as `TemplateHelper.StoreAppFrameDimensions()`, is found by the rename pre-flight.** It was refused as "symbol not found" when the class was declared in an include the per-file lookup could not see; the method is now resolved through its class first. [#547](https://github.com/msarson/Clarion-Extension/issues/547)
- **Rename decides by where the symbol is declared, not where the cursor is.** Renaming a hand-coded class method from a call site in a generated module now proceeds, rewriting the class declaration, its implementation and every other hand-coded reference, and the warning says plainly that rename cannot alter generated code and lists the generated files left unchanged. A symbol declared in a generated file is still refused with that reason. [#528](https://github.com/msarson/Clarion-Extension/issues/528)

#### Editing

- **Word completion offers EQUATEs declared in another file.** A constant declared in an include the module reaches only through the PROGRAM's own INCLUDE never appeared as a completion, since only the current document's equates were collected. Once two characters are typed, the project's declaration index contributes its EQUATE and ITEMIZE entries too, each with its value and declaring file, capped at 300 and never waiting on an index still being built; the document's own declaration still wins on a name clash. [#554](https://github.com/msarson/Clarion-Extension/pull/554) @geircodes
- **A VIEW's JOIN folds, and the VIEW's own fold now reaches its own END.** JOIN was never treated as a structure, so its END closed the enclosing VIEW one line early and the JOIN itself could not be folded. The compiler confirmed the shape: every JOIN needs its own END or period, JOINs nest, and INNER is a trailing attribute (`JOIN(...),INNER`), not a prefix. [#504](https://github.com/msarson/Clarion-Extension/issues/504)
- **Prefix completion on a FILE no longer offers its PRE() argument or a KEY's field arguments as fields.** After `ORD:` the list read `ORD:ORD` and `ORD:ORD:ID` and left out `ORD:ID` itself; a structure line now contributes only its column-0 label, so fields, keys and the record group are offered by name. [#499](https://github.com/msarson/Clarion-Extension/issues/499)
- **Dot completion on a FILE label offers its fields, and structure completion lists each field with its declared type.** `Orders.` lists the same fields, keys and record group as `ORD:`, letters typed after the dot narrow the list, and on both paths each row reads as the field name, its type as declared (`LONG`, `STRING(30)`, `KEY(ORD:ID)`) and the qualified name. Previously only GROUP, QUEUE and RECORD labels answered a dot. [#505](https://github.com/msarson/Clarion-Extension/issues/505), [#507](https://github.com/msarson/Clarion-Extension/issues/507), [#508](https://github.com/msarson/Clarion-Extension/issues/508)

#### Diagnostics

- **Diagnostics can be pulled by the editor instead of pushed.** A client that supports the protocol's pull model (VS Code does) now asks the server for a file's diagnostics and gets either the full set with a result id or an "unchanged" answer, and the server asks for a re-pull when a cross-file change or the finished index alters a file's result. Editors that only understand push keep receiving pushes, and the existing `clarion/diagnosticsStatus` signal is unchanged. [#545](https://github.com/msarson/Clarion-Extension/issues/545)
- **The encoding check leaves comments alone and reports once per line.** An ASCII-art banner in comments produced hundreds of warnings, one per box-drawing character, claiming the file would be corrupted for the compiler; compiling the shape on Clarion 10 shows the compiler takes the raw bytes in a comment or a string and only a UTF-8 BOM breaks the build. Comments are now exempt, other lines get one warning spanning the characters, and the message says what is actually at stake. [#556](https://github.com/msarson/Clarion-Extension/issues/556)
- **New opt-in check: a call to a procedure that is declared nowhere.** Turn on `clarion.diagnostics.unresolvedProcedureCalls.enabled` and a call such as `Prcoess()` whose name no MAP, MODULE, include or indexed file declares gets a warning; it is off by default. A name the index does not know is resolved the way Go to Definition resolves it, through the file's MAP and its includes, the MEMBER parent's MAP and the MODULE blocks of the includes those MAPs pull in, so a third-party procedure declared in an addon's include is not flagged. Method calls, built-ins, directives, compiler flags and colon-prefixed DLL procedures are recognised, and nothing is reported while the index is still building or when a MEMBER's parent cannot be found. [#517](https://github.com/msarson/Clarion-Extension/issues/517)
- **A single-line `IF x THEN RETURN END` followed by more statements on the same line no longer leaves the enclosing CASE reported as unterminated.** Only the last token of a line was checked for the closing END, so `OF DeleteKey ; IF ~RECORDS(Q) THEN RETURN END ; GlobalRequest = Action:Delete` left the IF open, the CASE's END closed the IF instead, and the Problems tab flagged code that compiles; the same stale IF greyed out the OF lines that followed as unreachable. The terminator is now found anywhere after the keyword on its line, with a structure opened later on the same line keeping its own END. [#536](https://github.com/msarson/Clarion-Extension/issues/536)
- **The undeclared-variable check now covers a PROGRAM's main CODE section.** It only looked inside procedures, so an undeclared identifier in the program's own top-level code went unreported, and was even treated as a declaration. [#516](https://github.com/msarson/Clarion-Extension/issues/516)

#### Configuration and build

- **Each diagnostic check can be reported at a severity of your choosing.** `clarion.diagnostics.<check>.severity` takes error, warning, information or hint, and its default keeps the check's built-in level, so a check that is useful but not blocking on your codebase can be demoted without turning it off, and one your team treats as a build rule can be promoted. Takes effect as soon as it is changed. [#543](https://github.com/msarson/Clarion-Extension/issues/543)
- **Every diagnostic check has its own setting, and `clarion.diagnostics.enabled` switches them all.** Only three of the twenty-four checks could be turned off before. Each now has a `clarion.diagnostics.<check>.enabled` setting, on by default apart from the existing opt-in, so a check that misfires on a codebase can be silenced on its own, and the master switch clears the Problems tab entirely. All of them take effect as soon as they are changed. [#542](https://github.com/msarson/Clarion-Extension/issues/542)
- **Changing a `clarion.diagnostics` setting takes effect straight away.** The undeclared-variable, unresolved-procedure-call and indistinguishable-prototype checks were read once when the solution loaded, so ticking or unticking one did nothing until the window was reloaded. The change is now sent to the server as it happens and every open file is re-checked, so the warnings appear or clear without a reload. [#541](https://github.com/msarson/Clarion-Extension/issues/541)
- **A remembered Clarion version that the properties file no longer registers is treated as missing, not accepted.** After an IDE update renames the installed build, the solution's remembered version pointed at nothing: the sidebar still showed it, redirection stayed unset, and a build failed with a message about a missing redirection path. The Set Version prompt now appears with the reason, and the Actions view marks the name as not registered. [#535](https://github.com/msarson/Clarion-Extension/issues/535)
- **Your own build configuration setting now wins, and changing it sticks in a multi-root workspace.** The configuration the Clarion IDE last built with, read from its .sln.cache, was applied ahead of the setting, so the Actions view could insist on Release whatever was set. Settings were also read from the .code-workspace file but written to the first folder's settings, so a change made through the picker landed somewhere else. The explicit setting or solutions entry is used first, a hand-written `Debug|Win32` is recognised as `Debug`, writes go back to the scope the value came from, and the Config row in the Actions view now opens the picker. [#530](https://github.com/msarson/Clarion-Extension/issues/530)
- **Every build now states what it is building, in which configuration, and the exact MSBuild command line.** The lines go to the Clarion Build output, which opens without taking focus, and the build result messages name the configuration too, so a Release build by mistake is visible at a glance. [#531](https://github.com/msarson/Clarion-Extension/issues/531)
- **A folder whose remembered solution has no stored Clarion version no longer ends in Initialization failed with an empty Solution View.** The view shows the found-solutions list with the remembered entry marked, and a message offers Set Version or Open Solution. [#498](https://github.com/msarson/Clarion-Extension/issues/498)
- **The Open Solution button works during startup in a window with no folder.** Clicking it before the extension finished starting reported that `clarion.openSolution` was not found; the no-folder commands are now registered before the language server starts. [#513](https://github.com/msarson/Clarion-Extension/issues/513)
- **The log level is now adjustable, so a diagnostic log can be captured for a bug report.** A new `clarion.log.level` setting and a **Clarion: Set Log Level** command raise both processes from `error` (the default) to `warn`, `info` or `debug`, taking effect immediately. The extension's warnings, previously unreachable because every module pinned `error`, now surface when the level is raised. [#440](https://github.com/msarson/Clarion-Extension/issues/440)

#### Syntax

- **Eight catalogued built-in functions are now highlighted, and `REGISTEREVENT` and `UNREGISTEREVENT` are recognised.** `CALLBACK`, `NULL`, `SQL`, `SQLCALLBACK` and the four `HTTPWEBREQUEST` and image functions added in 1.0.4 had hover and completion but were painted as plain identifiers; the two event-handler alias prototypes had the reverse gap. A test now checks that every name in the built-in catalog is matched by the grammar. [#521](https://github.com/msarson/Clarion-Extension/issues/521)

#### Maintenance

- **Twelve documented built-in functions were added to the built-in catalog** — `COMPRESS`, `DEBUGHOOK`, `DECOMPRESS`, `HTTPWEBREQUEST`, `HTTPWEBREQUESTtoFile`, `ImageRotateFlip`, `ImageToPng`, `PRINTERDIALOGA`, `SETLAYOUT`, `QUOTE`, `UNQUOTE` and `WHERE` — so they are recognised by completion, hover and diagnostics rather than treated as unknown. [#519](https://github.com/msarson/Clarion-Extension/issues/519)
- **The language server now publishes a `clarion/diagnosticsStatus` completion signal,** so a tool driving the server over LSP can tell the sync pass from the finished analysis instead of guessing from a quiet period. It carries the document version and a `complete`, `deferred` or `superseded` state; `publishDiagnostics` is unchanged, so the VS Code experience is unaffected. [#460](https://github.com/msarson/Clarion-Extension/issues/460)
- **Folding no longer logs a spurious "circular reference" warning for nested structures.** A VIEW's JOIN, or a QUEUE inside a GROUP, was walked twice and warned about each time; the redundant second walk is removed, with folding output unchanged. [#514](https://github.com/msarson/Clarion-Extension/issues/514)
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

- **Start-up work now shows as standard progress in the status bar.** Building the declaration index, building the file graph and re-checking the open files after the index is ready are reported through the protocol's progress channel, so VS Code and any other client show what the server is doing on a large solution instead of nothing. [#544](https://github.com/msarson/Clarion-Extension/issues/544)
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
