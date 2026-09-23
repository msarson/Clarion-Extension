# Changelog

All notable changes to the Clarion Extension are documented here.

---

## Recent Versions

### [1.0.6] - Unreleased

#### Navigation and hover

- **A FILE with a key or field labelled `Key` or `Index` no longer floods the outline and workspace symbol search.** The label was taken for the KEY or INDEX keyword, so its outline entry swallowed the rest of the file; one workspace symbol search on a generated application returned 158 names over 100,000 characters and a 9 MB reply. A VIEW's `PROJECT(Project)` did the same. Reported by Bill Atchison. [#604](https://github.com/msarson/Clarion-Extension/issues/604)
- **Each FILE key is listed once, under its own label.** Every KEY appeared twice in the outline and in workspace symbol search, and neither entry could be found by the key's label. Keys and indexes now read like fields, `PrimaryKey KEY(PRE:ID)`, with attributes such as `DUP` and `PRIMARY` alongside. [#605](https://github.com/msarson/Clarion-Extension/issues/605)
- **`SELF.member` finds the member the class really has.** Hover and Go to Definition took a parameter name in one of the class's method prototypes for a member, and past a generated local class read on into the procedures that follow it; `SELF.Request` in a generated window landed on `Run PROCEDURE(USHORT Number,BYTE Request)` instead of the inherited `WindowManager.Request`. [#607](https://github.com/msarson/Clarion-Extension/issues/607)
- **Hover and Go to Definition on `SELF` and `PARENT` show the class they stand for.** In a method, `SELF` is that method's class and `PARENT` is its parent; hover names the class, where it is declared and what it extends, and F12 goes to its declaration. `PARENT` used to fall back to a word search and land on anything spelled `parent`. [#606](https://github.com/msarson/Clarion-Extension/issues/606)
- **`SELF` and `PARENT` belong to the procedure's own local class.** Where a module declares the same local class label in two procedures, such as `ThisWindow`, members and the parent class were looked up in the first one, whichever procedure the method belonged to. [#608](https://github.com/msarson/Clarion-Extension/issues/608)
- **`Customer:Record` and `Customer:Name` go to the right FILE.** The colon form of field qualification, a structure's own label followed by a member, is valid Clarion wherever a PRE() is not used. Go to Definition sent `Customer:Record` to whichever FILE's RECORD came first, and hover showed nothing; generated code writes it for every file. [#610](https://github.com/msarson/Clarion-Extension/issues/610)
- **Hover and Go to Definition agree on `object.Method(...)`, and both honour local overrides and the number of arguments.** Hover showed another class's method of the same name, or an overload the call could not reach; Go to Definition skipped a local class's own override and went straight to the parent. `ThisWindow.Run()` now finds the inherited `Run()` when the local class overrides only `Run(Number, Request)`, and the local override when there is one. [#611](https://github.com/msarson/Clarion-Extension/issues/611)
- **Go to Definition works on `Relate:Customer.Open()` and other colon-named objects.** Where the object's label contained a colon, as every generated procedure's file managers and list managers do, only the part after the last colon was looked up and nothing was found; hover already resolved these. [#612](https://github.com/msarson/Clarion-Extension/issues/612)
- **Hover shows the fields of a QUEUE declared from a type in the program file.** For `FieldQ QUEUE(tqField)`, where the program file declares `tqField QUEUE,TYPE`, hovering `FieldQ.Desc` in a member module showed nothing after a pause of several seconds; Go to Definition already found it. [#613](https://github.com/msarson/Clarion-Extension/issues/613)
- **Go to Definition on a `?Name` field equate goes to the control.** On a name such as `?LOC:Date:Prompt` it went nowhere, or to an unrelated equate that happened to be called `Prompt`, while hover showed the control; it now uses the same rule as hover, wherever the cursor sits in the name. [#614](https://github.com/msarson/Clarion-Extension/issues/614)
- **Go to Definition finds a prefixed name used in a program's own code.** In a PROGRAM file's main code, outside any procedure, a name such as `MatchOption:NoCase` or `CUS:Name` resolved only when its declaration was in that same file, so an ITEMIZE or FILE from an included file was not found; hover already found it. [#615](https://github.com/msarson/Clarion-Extension/issues/615)
- **Hover finds `SELF` and `PARENT` members inherited from a class in the same file.** When the parent class was declared only in the file being edited, as in a file outside the solution or a class not yet saved, hover on an inherited member showed nothing while Go to Definition found it. [#616](https://github.com/msarson/Clarion-Extension/issues/616)
- **A parameter's hover links to the procedure that declares it.** The card named the line as plain text, the one declaration hover without a link. [#617](https://github.com/msarson/Clarion-Extension/issues/617)
- **The filenames on INCLUDE, MODULE and LINK lines are clickable again.** The editor asks for a file's links once when the file opens and keeps what it gets, which was nothing — the file graph the links are read from is built a few seconds later, and the refresh meant to correct that ran too early and could not reach the editor's copy anyway. Reopening the file was the only way to see them. [#620](https://github.com/msarson/Clarion-Extension/issues/620)

- **A class derived from a parent whose name contains a colon inherits again.** For `Derived CLASS(MyOwn:Base)` the parent's name was read only as far as the colon, so no parent was recorded at all: inherited members resolved for neither hover, Go to Definition nor completion, and `PARENT.Method` found nothing — while hovering a bare `PARENT` named the class correctly, the same declaration read two ways. The on-disk declaration index is rebuilt once. [#623](https://github.com/msarson/Clarion-Extension/issues/623)
- **`PARENT.` completion offers the parent's members when the class is declared in an include file.** The parent was looked for only in the file being edited, which is not where a generated or shared class is declared, so the list came back empty; hover and Go to Definition already looked further. [#623](https://github.com/msarson/Clarion-Extension/issues/623)
- **A derived class's completion list includes the PROTECTED members it inherits.** Where another project in the solution declared a class of the same name, the test for whether the caller derives from the class was answered against that other project's copy, so inherited PROTECTED members were left out of the member list, of signature help and of the discarded-return check. [#624](https://github.com/msarson/Clarion-Extension/issues/624)
- **`SELF.Method()` picks the same overload as `Object.Method()`.** Where a class overrode a method but not with a prototype the call fits, a call through `SELF` was answered with that override while the same call written through the object name correctly found the inherited prototype that does fit. In a generated report, `SELF.AddItem(?Control, Action)` showed a one-argument `ReportManager.AddItem` instead of the two-argument `WindowManager.AddItem` it calls. Hover and Go to Definition agreed with each other on the wrong one. [#626](https://github.com/msarson/Clarion-Extension/issues/626)
- **Go to Implementation on `SELF.Method()` opens the body of the method the call actually runs.** Where a class overrode a method but not with a prototype the call fits, Ctrl+F12 through `SELF` opened the override's body instead of the inherited one's; the same call written through the object name already opened the right one. [#627](https://github.com/msarson/Clarion-Extension/issues/627)
- **`PARENT.` completion offers the right parent's members when a module declares the same class label in several procedures.** Every generated procedure has its own `ThisWindow`, and the list came from whichever was declared first in the file rather than the one the cursor is in. Hover and Go to Definition already read the nearest declaration. [#628](https://github.com/msarson/Clarion-Extension/issues/628)
- **A statement beginning with the word `DATA` no longer turns the rest of a procedure's code into outline entries.** Where a procedure's code assigns a name such as `GetAction:Data`, every following IF, OF and DO line was listed as a variable named after the expression with its operators dropped, `Loc:Flag AND01` — 28 of them on one 1,648-line procedure. A DATA section belongs to a ROUTINE; a procedure's code has none. Reported by Bill Atchison. [#618](https://github.com/msarson/Clarion-Extension/issues/618)
- **Hovering the class name on a method implementation line says where the class is declared.** For a class declared in an include file and implemented across several methods, the card named the file's own first method implementation as the declaration. Where a module declares the same class label in more than one procedure, it named the first procedure's. [#633](https://github.com/msarson/Clarion-Extension/pull/633) @geircodes
- **A procedure passed by name as an argument resolves like any other reference.** Clarion lets a procedure be named as an argument, as `SORT(Queue, CompareRows)` does for a comparison function; hover showed nothing and Go to Definition went nowhere, even where the prototype sat in the same file's MAP. A name that a declaration in scope already answers for, such as a local variable of the same name, still resolves to that declaration. Go to Implementation follows the same rule. [#631](https://github.com/msarson/Clarion-Extension/pull/631), [#635](https://github.com/msarson/Clarion-Extension/pull/635) @geircodes
- **Hovering a class name on a method implementation line says what the class extends.** The card named the class and where it is declared, but not its parent — which for a generated application, where a window or report manager derives from one of the framework classes, is usually what the hover was opened to find. [#634](https://github.com/msarson/Clarion-Extension/issues/634)
- **Go to Implementation answers only on a method's name.** With the cursor on the object before the dot, on `SELF` or `PARENT`, or on an argument of a method call, it opened the method's body; on `Obj` in `Obj.Show()` it went to `Show`. Those words are the object, the class or the argument, not the method, so it now goes nowhere from them; and the inner call of `a.Outer(b.Inner())` opens its own body rather than the outer one's. [#639](https://github.com/msarson/Clarion-Extension/issues/639)

#### Diagnostics

- **A structure closed by a period at the end of a continued line is no longer reported as unterminated.** Where an IF's body was split across a `|` continuation and closed with a trailing period, the period was taken to end the statement rather than the structure, so the following END closed the inner IF and its parent was flagged on code the compiler accepts. [#630](https://github.com/msarson/Clarion-Extension/pull/630) @geircodes
- **A file that is not valid UTF-8 is reported once, as an encoding problem, instead of flagging its characters.** Generated Clarion separates the fields of a descriptor string with high-bit bytes, so an ANSI file opened as UTF-8 shows every delimiter as `�` and each line was reported as containing characters with no ANSI encoding — 21 findings on one file, none of them about anything in the file. The offered quick fix deleted those characters, which strips the delimiters out of the strings. The file is now named as wrongly decoded, with the warning that saving it in that state overwrites the original bytes, and no fix is offered. [#629](https://github.com/msarson/Clarion-Extension/issues/629)
- **An overloaded method is no longer reported as discarding a return value when the overload being called has none.** Where one prototype returns a value and another does not, and both accept the number of arguments passed, the call was checked against the wrong one. A name whose prototypes all return a value is still reported. [#621](https://github.com/msarson/Clarion-Extension/issues/621)
- **Published diagnostics say which version of the document they are for.** A slower analysis pass for one version can arrive after the editor has moved to the next, and a client that reads only the standard protocol had no way to tell, so it showed the older answer against the newer text. Reported by Bill Atchison. [#619](https://github.com/msarson/Clarion-Extension/issues/619)

---

### [1.0.5] - 2026-09-18

![7 fixes](https://img.shields.io/badge/fixes-7-1f6feb?style=flat-square) ![1 new](https://img.shields.io/badge/new-1-2da44e?style=flat-square)

Eight changes, most of them names the extension could not resolve in a real generated application: a prefix that runs past eight characters, a prototype an INCLUDE carries into a MAP, a prototype indented inside one, and the scope a program’s MAP actually has. Two more settle what the compiler does with whitespace on either side of the member-access dot. Reported by Bill Atchison, with contributions from [@geircodes](https://github.com/geircodes).

#### Navigation and hover

- **Find All References on a procedure declared in a program's MAP now lists every use in that program.** Asked at the declaration it searched only the modules the MAP itself names, so calls in the program's other modules were missing, while asking at one of those calls listed them all. The same symbol gave two different answers depending on where it was asked. [#602](https://github.com/msarson/Clarion-Extension/issues/602)
- **Procedures prototyped in an include file are found again.** Where a MAP brings prototypes in with `INCLUDE('file.inc','PROTOTYPES')`, the include file has no MAP of its own, so those prototypes were never recorded as declarations and Go to Definition, hover and the unresolved-call check all missed every call to them. Only the section the INCLUDE names is used, as the compiler requires. Reported by Bill Atchison. [#593](https://github.com/msarson/Clarion-Extension/issues/593)
- **Find All References lists the call sites of a DLL-imported procedure.** Where a name's prefix runs past eight characters, such as `CommonLib:Init`, a call to it was read as several separate words while its declaration was read as one, so the result listed the declaration and nothing else. Generated applications call every linked DLL's init and kill procedure this way, so most of those calls were invisible. [#600](https://github.com/msarson/Clarion-Extension/issues/600)
- **A prefixed MAP prototype written without the PROCEDURE keyword is found again.** Where a prototype's name carries a prefix, such as `reg:WIN:ShowExits()`, and is written indented inside the MAP rather than at column 0, it was recorded under the wrong name or not recorded at all, so Go to Definition, hover, workspace symbol search and the unresolved-call check all missed it. Reported by Bill Atchison. [#597](https://github.com/msarson/Clarion-Extension/issues/597)
- **A routine hover names the procedure the routine belongs to.** ROUTINE labels repeat legally across procedures, so an identically named routine elsewhere in the file produced the same card. Hovering the declaration label also described it as a variable whose declared type is the word ROUTINE; it now gets a routine card of its own. [#595](https://github.com/msarson/Clarion-Extension/pull/595) @geircodes
- **Hover no longer describes a member access where the dot ends the statement.** `Obj.   Method(42)` and `Obj . Method(42)` do not compile, because a space after the dot terminates the statement, and the tokenizer already reads them that way; hover alone still presented the following name as a method or field of the object. Reported by Mark. [#603](https://github.com/msarson/Clarion-Extension/issues/603)

#### Editing

- **Completion offers ROUTINE labels, and after `DO` offers only those.** Routines were the one callable kind the word list never included. After `DO ` the list was several hundred keywords, built-ins and variables, none of them legal in that position and not one of them a routine; it now lists the routines the enclosing procedure can reach, an inner scope's routine taking precedence over a repeated name further out. [#594](https://github.com/msarson/Clarion-Extension/pull/594) @geircodes

#### Syntax

- **A method or property written with a space before the dot is understood.** `Receiver   .Method(42)` is valid Clarion, but the space caused the dot to be dropped and the line read as a call to a procedure named after the method, so hover, Go to Definition, Find All References, rename and completion all missed those uses. A space *after* the dot still ends the statement, which is what the compiler does with it. Reported by Mark. [#574](https://github.com/msarson/Clarion-Extension/issues/574)

---

### [1.0.4] - 2026-09-17

![64 fixes](https://img.shields.io/badge/fixes-64-1f6feb?style=flat-square) ![11 new](https://img.shields.io/badge/new-11-2da44e?style=flat-square) ![4 performance](https://img.shields.io/badge/performance-4-8250df?style=flat-square)

Seventy-nine changes, most of them about the things a real solution runs into: which Clarion version and settings are actually in force, how a name is resolved across a multi-project solution and a DLL family, and how Clarion source is read when it is written the way the compiler allows rather than the way generated code looks. Editing large modules is also markedly quicker — tokenizing a file is about three times faster, and background checking now stops as soon as you type.

#### Navigation and hover

- **Hovering TO shows the LOOP or CASE help it belongs to.** The check looked for token types that LOOP and OF never have, so the LOOP card was never shown and CASE ranges were found only by a text match on the line. It now reads the LOOP on the line or the CASE branch the TO is in, and a TO in a LOOP nested inside an OF branch is attributed to the LOOP. [#576](https://github.com/msarson/Clarion-Extension/pull/576) @geircodes
- **Hovering END shows what it closes.** The hover names the structure or block the END terminates, with its label, a preview of the opening line and a link back to it, so the END of a long RECORD, CLASS or nested IF/CASE can be matched to its start. An END with no opener, or the END of a one-line structure, still shows the general keyword help. [#575](https://github.com/msarson/Clarion-Extension/pull/575) @geircodes
- **Hovering a period terminator shows what it closes, as END does.** A period that closes a structure spanning several lines now names that structure and its label, previews the opening line and links to it; where several periods share a line, each describes its own. [#582](https://github.com/msarson/Clarion-Extension/issues/582)
- **The terminator of a one-line structure names it too.** Hovering the period in `IF dx > 4 THEN CYCLE .`, or the END in `IF x THEN y = 1 END`, now says which structure it closes, with its line and a link. Reported by Mark. [#586](https://github.com/msarson/Clarion-Extension/issues/586)
- **In a solution with several projects, a class found in more than one search folder resolves to the copy the open file's own project uses.** Each project's redirection file can list the same folders in a different order, but completion, hover, Go to Definition and member lookups followed the order of the first project in the solution, and INCLUDE files reached while searching for a class were resolved through that project too. Lookups now use the redirection of the project that compiles the file you are in. [#571](https://github.com/msarson/Clarion-Extension/issues/571)
- **Find All References on a class lists the prototypes that take it as a pointer parameter.** A parameter such as `*ctThing pThing` in a method declaration, its implementation or a MAP prototype was left out, although fields, variables and `&ctThing` parameters were listed, so renaming the class missed those signatures. [#561](https://github.com/msarson/Clarion-Extension/issues/561)
- **Find All References on a global name now searches the include files the program reaches.** A project file lists only modules, so a use inside an include was never found: a global instance declared in a data include, or a class field typed with the class. Includes reached from the searched modules are now searched when they mention the name. Library source folders are skipped. [#559](https://github.com/msarson/Clarion-Extension/issues/559)
- **Find All References on a type name inside a CLASS body finds the type.** With the cursor on `ctViewMetric` in a field such as `ViewMetric &ctViewMetric`, or on a parameter type in a method prototype, the request looked for a member of that name and returned no results. Only the line's label is treated as a member now, so a type resolves to the class and lists the same results as the class declaration. [#560](https://github.com/msarson/Clarion-Extension/issues/560)
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
- **Find All References works again on prefixed labels such as `GLO:Name` and `GBL:Owner`.** The index that decides which files are worth scanning split identifiers at the colon, so every file answered "not present" and the search returned nothing for any prefixed global, and the reference-count lens showed a wrong count for them. [#525](https://github.com/msarson/Clarion-Extension/issues/525)
- **Find All References on an exported global now spans the data DLL that defines it and every app that references that DLL.** A global such as `GBL:Owner` is defined in the data DLL's generated globals module, exported by name in its .exp, and re-declared EXTERNAL in each consuming app; references used to stop at the app under the cursor. The family is found through the project references and the .exp, so a same-named global in an unrelated program stays out, and an EXTERNAL declaration whose DLL is outside the solution falls back to a solution-wide search. Rename still stays inside the declaring project. The same change fixes the export index keying its parsed .exp files by folder alone, which on a solution whose .cwproj files share one folder handed the first project's exports to every project and could mis-scope procedure references too. [#526](https://github.com/msarson/Clarion-Extension/issues/526)
- **Rename now follows references across the DLL family for hand-coded files, and says why occurrences in generated files were left alone.** Renaming an exported global or a DLL-exported procedure from a hand-coded app rewrites the defining project and the other consumers too. Files the .cwproj marks as generated are never rewritten: a rename started in one is refused with the reason, and occurrences in generated files elsewhere are skipped, with a warning listing each file and its occurrence count and noting that the change belongs in the .app followed by a regenerate. [#527](https://github.com/msarson/Clarion-Extension/issues/527)
- **The rename box opens at once; the reference search runs after Enter.** F2 on a method in a large solution took five to fourteen seconds before the box appeared, because the pre-flight searched every reference to decide whether the declaration was generated. It now resolves the declaration the way F12 does and checks that, and the search happens inside the rename itself, where the editor shows progress. [#553](https://github.com/msarson/Clarion-Extension/issues/553)
- **Rename is refused only in generated code, and always there.** The checks that refused a rename because the file sat in a library folder, because the prototype carried `,DLL`, or because its MODULE could not be resolved are gone: a developer who keeps their own classes under `Accessory\libsrc\win` could not rename a method in their own file, and a rename in hand-written source is the developer's call and a single undo. The generated-code rule is now the only one, and it is absolute: a rename never starts from a generated file, whatever the symbol, and a symbol declared in a generated file is refused from anywhere; started from hand-written source, occurrences in generated files are skipped and reported. [#548](https://github.com/msarson/Clarion-Extension/issues/548), [#549](https://github.com/msarson/Clarion-Extension/issues/549)
- **A library class file the templates list in the project is not treated as generated code.** The Clarion IDE flags every file a template adds to the .cwproj as Generated, including third-party class sources it merely links, so F2 in an accessory's implementation file was refused as generated while the same method was renameable from its declaration. A file under a library folder is library source whatever the flag says. [#551](https://github.com/msarson/Clarion-Extension/issues/551)
- **A method reached through an object, such as `TemplateHelper.StoreAppFrameDimensions()`, is found by the rename pre-flight.** It was refused as "symbol not found" when the class was declared in an include the per-file lookup could not see; the method is now resolved through its class first. [#547](https://github.com/msarson/Clarion-Extension/issues/547)
- **Rename decides by where the symbol is declared, not where the cursor is.** Renaming a hand-coded class method from a call site in a generated module now proceeds, rewriting the class declaration, its implementation and every other hand-coded reference, and the warning says plainly that rename cannot alter generated code and lists the generated files left unchanged. A symbol declared in a generated file is still refused with that reason. [#528](https://github.com/msarson/Clarion-Extension/issues/528)

#### Editing

- **Member completion reads the class from the editor, not the saved file.** When a class in an open file with unsaved changes had to be found by scanning, the saved copy on disk was read, so a class added since the last save offered no members; the scan also re-read each include file from disk up to three times. It now uses the text already loaded. [#585](https://github.com/msarson/Clarion-Extension/pull/585) @geircodes
- **Word completion lists the closest names first.** Candidates are ranked by where they come from: the procedure's locals and parameters, then module and PROGRAM data, MAP procedures, project-wide EQUATEs from the declaration index, and finally keywords and built-ins, alphabetically within each group. A constant from another file no longer outranks a local variable on the same prefix. [#577](https://github.com/msarson/Clarion-Extension/pull/577) @geircodes
- **Dot completion on a procedure parameter offers its type's members.** A parameter such as `pThing` in `PROCEDURE(ctThing pThing)` completed nothing after a pause, although a local of the same type and hover on the parameter both worked. [#570](https://github.com/msarson/Clarion-Extension/pull/570) @geircodes
- **Word completion offers EQUATEs declared in another file.** A constant declared in an include the module reaches only through the PROGRAM's own INCLUDE never appeared as a completion, since only the current document's equates were collected. Once two characters are typed, the project's declaration index contributes its EQUATE and ITEMIZE entries too, each with its value and declaring file, capped at 300 and never waiting on an index still being built; the document's own declaration still wins on a name clash. [#554](https://github.com/msarson/Clarion-Extension/pull/554) @geircodes
- **A VIEW's JOIN folds, and the VIEW's own fold now reaches its own END.** JOIN was never treated as a structure, so its END closed the enclosing VIEW one line early and the JOIN itself could not be folded. The compiler confirmed the shape: every JOIN needs its own END or period, JOINs nest, and INNER is a trailing attribute (`JOIN(...),INNER`), not a prefix. [#504](https://github.com/msarson/Clarion-Extension/issues/504)
- **Prefix completion on a FILE no longer offers its PRE() argument or a KEY's field arguments as fields.** After `ORD:` the list read `ORD:ORD` and `ORD:ORD:ID` and left out `ORD:ID` itself; a structure line now contributes only its column-0 label, so fields, keys and the record group are offered by name. [#499](https://github.com/msarson/Clarion-Extension/issues/499)
- **Dot completion on a FILE label offers its fields, and structure completion lists each field with its declared type.** `Orders.` lists the same fields, keys and record group as `ORD:`, letters typed after the dot narrow the list, and on both paths each row reads as the field name, its type as declared (`LONG`, `STRING(30)`, `KEY(ORD:ID)`) and the qualified name. Previously only GROUP, QUEUE and RECORD labels answered a dot. [#505](https://github.com/msarson/Clarion-Extension/issues/505), [#507](https://github.com/msarson/Clarion-Extension/issues/507), [#508](https://github.com/msarson/Clarion-Extension/issues/508)

#### Diagnostics

- **A class-typed declaration in a data include is no longer reported as missing its include when the including module can see the class.** The missing-include check looked at a file's own includes, its MEMBER parent and the implementation module of any class it declares, but never at the files that include it, so a template-injected data include got a warning for a class the module's PROGRAM carries. The files that include it, and their programs, are now consulted. A module with a bare `MEMBER()` still gets the warning, since the compiler gives it no global scope. [#558](https://github.com/msarson/Clarion-Extension/issues/558)
- **Diagnostics can be pulled by the editor instead of pushed.** A client that supports the protocol's pull model (VS Code does) now asks the server for a file's diagnostics and gets either the full set with a result id or an "unchanged" answer, and the server asks for a re-pull when a cross-file change or the finished index alters a file's result. Editors that only understand push keep receiving pushes, and the existing `clarion/diagnosticsStatus` signal is unchanged. [#545](https://github.com/msarson/Clarion-Extension/issues/545)
- **The encoding check leaves comments alone and reports once per line.** An ASCII-art banner in comments produced hundreds of warnings, one per box-drawing character, claiming the file would be corrupted for the compiler; compiling the shape on Clarion 10 shows the compiler takes the raw bytes in a comment or a string and only a UTF-8 BOM breaks the build. Comments are now exempt, other lines get one warning spanning the characters, and the message says what is actually at stake. [#556](https://github.com/msarson/Clarion-Extension/issues/556)
- **New opt-in check: a call to a procedure that is declared nowhere.** Turn on `clarion.diagnostics.unresolvedProcedureCalls.enabled` and a call such as `Prcoess()` whose name no MAP, MODULE, include or indexed file declares gets a warning; it is off by default. A name the index does not know is resolved the way Go to Definition resolves it, through the file's MAP and its includes, the MEMBER parent's MAP and the MODULE blocks of the includes those MAPs pull in, so a third-party procedure declared in an addon's include is not flagged. Method calls, built-ins, directives, compiler flags and colon-prefixed DLL procedures are recognised, and nothing is reported while the index is still building or when a MEMBER's parent cannot be found. [#517](https://github.com/msarson/Clarion-Extension/issues/517)
- **A single-line `IF x THEN RETURN END` followed by more statements on the same line no longer leaves the enclosing CASE reported as unterminated.** Only the last token of a line was checked for the closing END, so `OF DeleteKey ; IF ~RECORDS(Q) THEN RETURN END ; GlobalRequest = Action:Delete` left the IF open, the CASE's END closed the IF instead, and the Problems tab flagged code that compiles; the same stale IF greyed out the OF lines that followed as unreachable. The terminator is now found anywhere after the keyword on its line, with a structure opened later on the same line keeping its own END. [#536](https://github.com/msarson/Clarion-Extension/issues/536)
- **The undeclared-variable check now covers a PROGRAM's main CODE section.** It only looked inside procedures, so an undeclared identifier in the program's own top-level code went unreported, and was even treated as a declaration. [#516](https://github.com/msarson/Clarion-Extension/issues/516)

#### Configuration and build

- **Clicking a solution whose remembered Clarion version is no longer registered now offers the version picker.** The solution was reported as opened but nothing loaded, because the remembered version was only checked for being non-empty; the picker now appears, and the solution loads with the version you choose. [#566](https://github.com/msarson/Clarion-Extension/issues/566)
- **Set Version on the startup prompt for a solution with a missing or outdated Clarion version now opens the solution.** Picking a version there could leave the solution closed and the old version remembered. The button now takes the same route as clicking the solution in the Solution View: pick the version, save it for the solution and load it. [#572](https://github.com/msarson/Clarion-Extension/issues/572)
- **A solution opened from the Solution View resolves library files straight away.** The language server was sent the redirection and libsrc paths of the Clarion version the session started with, so when the solution used another version, or none had loaded, hover, Go to Definition and completion into classes such as StringTheory found nothing until a restart. The paths of the solution's own version are now sent, and the redirection directory is taken from the version's `%REDDIR%` rather than left as `.`. [#567](https://github.com/msarson/Clarion-Extension/issues/567)
- **Changing the build configuration in a multi-root workspace now sticks.** A pick from the status bar or the Tools pane was saved to the first folder's settings but read back from the `.code-workspace` file, so the Tools pane, the Solution View and the build went back to the configuration stored there while the status bar showed the new one. The solution settings are now read and written in the same place, the change is no longer undone by the settings reread, and default lookup extensions are only added when no settings file sets them. [#563](https://github.com/msarson/Clarion-Extension/issues/563) If an earlier version already wrote those settings into a folder, they still take precedence over your workspace file until they are removed — see the next entry.
- **Settings an earlier version wrote into a folder are reported instead of silently overriding your workspace file.** A folder's `.vscode/settings.json` wins over the `.code-workspace` file, so leftovers there kept forcing their own solution, configuration or lookup extensions. When the two disagree, the extension now names the keys and the file and offers to remove the folder copy, so the workspace file takes effect; nothing is deleted unless you choose it. [#587](https://github.com/msarson/Clarion-Extension/issues/587)
- **A build configuration change reaches the language server straight away.** The server heard the configuration only when the solution loaded, so after a switch, files named in the redirection file's per-configuration sections kept resolving for the old configuration until a reload, affecting document links, navigation, hover and diagnostics. The change is now sent to the server, which re-resolves those files, rebuilds its file graph and declaration index, and re-checks open documents. [#564](https://github.com/msarson/Clarion-Extension/issues/564)
- **Changing the Clarion version or install in a running session rebuilds file resolution from scratch.** The language server kept the solution, redirection and caches of the previous install, so after a switch, Go to Definition and hover could still open the old install's library files alongside the new one's members. A change of version, redirection file or directory, macros or libsrc paths now discards everything resolved under the old install, and the disk caches are kept per install, so a restart never reuses another install's results and switching back is still fast. [#568](https://github.com/msarson/Clarion-Extension/issues/568)
- **A Clarion version picked with Set Version while a solution is loaded is saved for that solution and takes effect straight away.** The pick changed only the session: build and run used the new install while hover, Go to Definition, completion and diagnostics stayed on the old one, and the next start went back to the solution's previous version. The version is now saved in the solution's settings and the solution reloads against it; picking the version already in use changes nothing, and with no solution loaded a pick still applies to the session only. [#573](https://github.com/msarson/Clarion-Extension/issues/573)
- **Each diagnostic check can be reported at a severity of your choosing.** `clarion.diagnostics.<check>.severity` takes error, warning, information or hint, and its default keeps the check's built-in level, so a check that is useful but not blocking on your codebase can be demoted without turning it off, and one your team treats as a build rule can be promoted. Takes effect as soon as it is changed. [#543](https://github.com/msarson/Clarion-Extension/issues/543)
- **Every diagnostic check has its own setting, and `clarion.diagnostics.enabled` switches them all.** Only three of the twenty-four checks could be turned off before. Each now has a `clarion.diagnostics.<check>.enabled` setting, on by default apart from the existing opt-in, so a check that misfires on a codebase can be silenced on its own, and the master switch clears the Problems tab entirely. All of them take effect as soon as they are changed. [#542](https://github.com/msarson/Clarion-Extension/issues/542)
- **Changing a `clarion.diagnostics` setting takes effect straight away.** The undeclared-variable, unresolved-procedure-call and indistinguishable-prototype checks were read once when the solution loaded, so ticking or unticking one did nothing until the window was reloaded. The change is now sent to the server as it happens and every open file is re-checked, so the warnings appear or clear without a reload. [#541](https://github.com/msarson/Clarion-Extension/issues/541)
- **A remembered Clarion version that the properties file no longer registers is treated as missing, not accepted.** After an IDE update renames the installed build, the solution's remembered version pointed at nothing: the sidebar still showed it, redirection stayed unset, and a build failed with a message about a missing redirection path. The Set Version prompt now appears with the reason, and the Actions view marks the name as not registered. [#535](https://github.com/msarson/Clarion-Extension/issues/535)
- **Your own build configuration setting now wins, and changing it sticks in a multi-root workspace.** The configuration the Clarion IDE last built with, read from its .sln.cache, was applied ahead of the setting, so the Actions view could insist on Release whatever was set. Settings were also read from the .code-workspace file but written to the first folder's settings, so a change made through the picker landed somewhere else. The explicit setting or solutions entry is used first, a hand-written `Debug|Win32` is recognised as `Debug`, writes go back to the scope the value came from, and the Config row in the Actions view now opens the picker. [#530](https://github.com/msarson/Clarion-Extension/issues/530)
- **Every build now states what it is building, in which configuration, and the exact MSBuild command line.** The lines go to the Clarion Build output, which opens without taking focus, and the build result messages name the configuration too, so a Release build by mistake is visible at a glance. [#531](https://github.com/msarson/Clarion-Extension/issues/531)
- **A folder whose remembered solution has no stored Clarion version no longer ends in Initialization failed with an empty Solution View.** The view shows the found-solutions list with the remembered entry marked, and a message offers Set Version or Open Solution. [#498](https://github.com/msarson/Clarion-Extension/issues/498)
- **The Open Solution button works during startup in a window with no folder.** Clicking it before the extension finished starting reported that `clarion.openSolution` was not found; the no-folder commands are now registered before the language server starts. [#513](https://github.com/msarson/Clarion-Extension/issues/513)
- **The log level is now adjustable, so a diagnostic log can be captured for a bug report.** A new `clarion.log.level` setting and a **Clarion: Set Log Level** command raise both processes from `error` (the default) to `warn`, `info` or `debug`, taking effect immediately. The extension's warnings, previously unreachable because every module pinned `error`, now surface when the level is raised. [#440](https://github.com/msarson/Clarion-Extension/issues/440)

#### Performance

- **Tokenizing a source file is about three times faster.** Every space and tab was tested against all of the tokenizer's patterns, although nothing can start there; whitespace now skips them. Across 7,237 files tokenizing time fell from 67 s to 19 s, and the longest event-loop block while loading a large real-world solution from 1.4 s to 0.9 s. A lowercase `end` at the start of a line is also recognised now instead of being read as `nd`. [#581](https://github.com/msarson/Clarion-Extension/pull/581) @geircodes
- **Background checking no longer finishes work that typing has already made obsolete.** Each pause while typing starts a new round of file checks, and the discarded-return-value check, which resolves every method call in the file, used to run to the end even after a newer edit had replaced it. It now stops as soon as the document changes, so superseded rounds no longer compete with completion and other requests. [#583](https://github.com/msarson/Clarion-Extension/pull/583) @geircodes
- **Word completion in a MEMBER module no longer takes seconds per keystroke.** Completion collected the PROGRAM file's prefix-qualified globals by scanning the whole file once per field, so a program carrying a dictionary's file declarations spent one and a half to three seconds on every request. The fields are now gathered in one pass and remembered until the program file changes. Member completion after a dot was already fast. [#565](https://github.com/msarson/Clarion-Extension/issues/565)
- **Dot completion on a class whose header is found in more than one search folder no longer pauses for seconds.** A project keeping its own copy of a shared class header made every such class look ambiguous, so completion walked and tokenized the whole include chain, once for each ancestor. Copies of the same file are now read from the one the redirection file lists first, as the compiler binds it. [#569](https://github.com/msarson/Clarion-Extension/pull/569) @geircodes

#### Syntax

- **An implicit variable named like a keyword is read as a variable.** Clarion accepts names such as `END#`, `IF#`, `LOOP$` or `Name"`, but the keyword was matched first: `END# = RECORDS(Q)` closed the enclosing LOOP, `IF#` opened a structure that never closed, and `Line#` or `Name"` were read as a control or attribute. That upset folding, the structure view and the unterminated-structure checks for the rest of the procedure. A name ending in `#`, `$` or `"` is now always the implicit variable. [#579](https://github.com/msarson/Clarion-Extension/issues/579)
- **A comparison no longer hides a structure later on the same line.** In `IF P<2 THEN x = 1. ; IF P THEN y = 2.` the less-than was taken for the opening bracket of an optional parameter, so the second IF was not recognised as a structure and its period closed the enclosing block instead. The same happened after a greater-than. A bracket is now only counted where a parameter can start or end. [#580](https://github.com/msarson/Clarion-Extension/issues/580)
- **An END that shares its line with a one-line IF closes the right structure.** `END ; IF c THEN d = 1.` treated the END as belonging to the one-line IF, so the IF or LOOP it really closed stayed open for the rest of the file, and `IF a THEN b = 1. END` left the enclosing block open in the same way. Folding, the structure view and the unterminated-structure checks now see each END close the structure it belongs to. [#578](https://github.com/msarson/Clarion-Extension/issues/578)
- **A name ending in END, such as `ACCESS_TOKEN:END`, no longer closes the block around it.** The END part of a prefixed or dotted name was read as an END statement, so the enclosing LOOP or IF closed early and the real ENDs further down were left unmatched; `IF access_token:end > 0` was likewise taken for a one-line IF. [#584](https://github.com/msarson/Clarion-Extension/issues/584)
- **A period terminator is recognised when the next character is a semicolon or another period.** A period was only read as a terminator before a space, a comment or the end of the line, so in `DOMWriter INTERFACE .;MAP;MODULE('DOMWriter')` or `IF a THEN b = 1.; IF c THEN d = 2.` it was dropped and the structure it closes stayed open — in one shipped library file for the next 848 lines. Several nested structures closed by adjacent periods (`IF a THEN IF b THEN c = 1..`) now close one each. [#589](https://github.com/msarson/Clarion-Extension/issues/589)
- **A parameter typed with a structure keyword keeps its first letter.** In a prototype such as `Init PROCEDURE(ProcessClass PC,<REPORT R>)` the type was read as `EPORT`, and `DoIt(a,QUEUE q)` as `UEUE`, so hover, Go to Definition and Find All References had nothing to work with. `FILE`, `QUEUE`, `GROUP`, `VIEW`, `RECORD`, `REPORT`, `WINDOW`, `CLASS` and `INTERFACE` parameters are now read whole — 2,644 of them across a 7,237-file corpus. A structure passed as an argument, as in `INIMgr.Fetch('Main',Window)`, is still a reference. [#590](https://github.com/msarson/Clarion-Extension/issues/590)
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

**Highlights**

- Solution loads that silently degraded now report themselves: unresolved source files are counted and named in the log, the graph-status notification and the Clarion Tools panel.
- The `%THISDIR%`, `%WinUserApplicationData%` and `%WinCommonApplicationData%` redirection macros are implemented; an unrecognised macro used to be left in the path as text, failing every directory on the line.
- Hover, F12, completion and signature help stopped being defeated by ordinary Clarion: a bare local CLASS used as its own instance, a structure field’s own declaration, names colliding with keywords and built-ins, and a colon in the enclosing SELF or PARENT scope line.
- Hovering an undeclared bare word in a big generated module no longer froze for about ten seconds (10.5s to 13ms).
- Many of the navigation and diagnostic fixes were contributed by [@geircodes](https://github.com/geircodes).

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-1.0.2.md)

---

### [1.0.1] - 2026-08-09

**Highlights**

- Find All References, F12 and rename span the DLL boundary: an exported procedure resolves from its implementation, its declaration or any call site across the program and its DLLs.
- Navigation gained GOTO and loop labels, the section name of `INCLUDE('file','section')`, and F12 from a MAP declaration to the implementation, including a multi-DLL hop.
- Startup and hover work on the real 40-project solution: the freezes during load and the cold first interaction are gone, with the declaration index and file graph persisted across sessions.
- Generated apps read correctly: the MAP shapes the templates emit, procedure names shared between an EXE and its DLLs, and `?Ctrl` completion scoped to the procedure's own window.

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-1.0.1.md)

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

For versions **0.6.x and earlier**, see [dev/docs-internal/changelogs/CHANGELOG-HISTORICAL.md](dev/docs-internal/changelogs/CHANGELOG-HISTORICAL.md).

---

## Version Numbering

We use [Semantic Versioning](https://semver.org/):
- **Major** (x.0.0) - Breaking changes
- **Minor** (0.x.0) - New features, backwards compatible
- **Patch** (0.0.x) - Bug fixes

---

[← Back to README](README.md)
