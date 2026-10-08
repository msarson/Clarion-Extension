# Changelog

All notable changes to the Clarion Extension are documented here.

---

## Recent Versions

### [1.0.9] - Unreleased

#### Diagnostics

- **An attribute the WINDOW does not accept is flagged on its header line.** The `WINDOW` line itself was never checked, so `HIDE` or `PRE(...)` there, which the compiler rejects as an unknown attribute, went unnoticed until the build; HVSCROLL together with HSCROLL or VSCROLL is flagged as well. [#730](https://github.com/msarson/Clarion-Extension/pull/730)

#### Navigation and hover

- **Hovering an attribute on a WINDOW header line shows its card.** It showed nothing there; it now also says when the WINDOW does not accept the attribute. The TEXT control card lists HSCROLL and VSCROLL beside HVSCROLL. [#730](https://github.com/msarson/Clarion-Extension/pull/730)

---

### [1.0.8] - 2026-10-04

![1 fix](https://img.shields.io/badge/fixes-1-1f6feb?style=flat-square) ![2 performance](https://img.shields.io/badge/performance-2-8250df?style=flat-square)

A follow-up to 1.0.7 for large generated modules. Diagnostics after an edit are ready in about a third of the time — on a 61,000-line generated module, about 2.3 s instead of about 7 s on the same machine — and a warning no longer keeps a variable's old type after you change its declaration. Hover, completion and Go to Definition also stop waiting behind the background check, which removes the occasional multi-second hover.

#### Performance

- **Diagnostics after an edit are ready much sooner in a large module.** The check for discarded return values worked out the type of every object it calls a method on, and every class's members, again after each edit, even though an edit to code cannot change them; it now does that again only when a declaration changes. [#715](https://github.com/msarson/Clarion-Extension/issues/715)
- **Hover, completion and Go to Definition no longer wait behind the background check.** The check that runs after an edit, or when a module is opened, took turns with them, so a hover that needed a lot of work could take several seconds, or time out, while it ran. They now go first, and the check still gets its turn at least every quarter of a second. [#715](https://github.com/msarson/Clarion-Extension/issues/715)

#### Diagnostics

- **A discarded-return-value warning no longer keeps a variable's old type after its declaration changes.** Changing a declaration such as `obj  LongClass` to `obj  ProcClass` could leave the warning judging `obj.Method()` by the old class, when the change kept the file the same length. [#715](https://github.com/msarson/Clarion-Extension/issues/715)

---

### [1.0.7] - 2026-10-03

![1 fix](https://img.shields.io/badge/fixes-1-1f6feb?style=flat-square) ![4 performance](https://img.shields.io/badge/performance-4-8250df?style=flat-square)

A release about editing large generated modules. It fixes a 1.0.6 bug that could leave the extension reading a module wrongly after an edit, and it makes the hover after an edit much quicker: on a 61,000-line generated module, the hover just after typing nearby went from about half a second to about 0.21 s, and a hover that lands while the module is being re-checked now takes about 0.08 s.

#### Editing

- **After an edit, the extension no longer reads the module wrongly.** An edit could leave its parsed form out of step with the text until the file was reopened: a structure whose END was removed kept its old extent, a line inside a procedure could be misread (`ACCEPT` as `CCEPT`), and a new PROCEDURE line or a period in column 0 went unnoticed, so folding, the outline, hover and diagnostics worked from the wrong structure. Each edit now gives exactly what reading the whole file would. [#715](https://github.com/msarson/Clarion-Extension/issues/715)

#### Performance

- **A hover just after an edit no longer waits a second or more behind the re-check of a large module.** The check for indistinguishable prototypes took time that grew with the square of the module's size, and ran after every edit; on a 60,000-line generated module it took over a second, and now takes about 10 ms. [#715](https://github.com/msarson/Clarion-Extension/issues/715)
- **Pressing Enter in a large module no longer makes the next hover re-read the whole file, and a hover on a procedure call after an edit no longer takes seconds.** An edit that added or removed a line, touched several places at once, or fell inside a procedure that is most of the module (a generated report designer) re-read the whole module; and the procedure hover read the module from disk, so the edited buffer had to be parsed again from scratch. An edit now re-reads only the lines it changed. [#715](https://github.com/msarson/Clarion-Extension/issues/715)
- **A hover during the re-check that follows an edit no longer waits for the whole re-check, and the re-check itself is quicker.** The first part of the re-check ran as one block, and two of its checks took time that grew with the square of the module's size, so on a large module a hover could wait over a second. The re-check now lets requests in between its checks, and both checks are linear. [#715](https://github.com/msarson/Clarion-Extension/issues/715)
- **Hovering a local variable after an edit is quicker in a large module.** The hover rebuilt the outline of the whole module to find one procedure's declarations; it now reads only that procedure's data sections. [#715](https://github.com/msarson/Clarion-Extension/issues/715)

---

### [1.0.6] - 2026-10-03

![83 fixes](https://img.shields.io/badge/fixes-83-1f6feb?style=flat-square) ![9 new](https://img.shields.io/badge/new-9-2da44e?style=flat-square) ![3 performance](https://img.shields.io/badge/performance-3-8250df?style=flat-square)

Ninety-five changes, most of them making hover, Go to Definition, Go to Implementation, Find All References and completion read `SELF`, `PARENT`, a procedure's own classes and chained members the same way, so the five features agree on what a name is. Build and Run now follow the configuration actually in force and show it in the Clarion Tools pane, and hover stays fast in very large generated modules, including straight after an edit. Contributions from [@geircodes](https://github.com/geircodes), with reports from Bill Atchison.

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
- **`SELF` belongs to the procedure's own local class again, for members and their bodies.** Where a module declares the same local class label in several procedures, such as `ThisWindow`, hover, Go to Definition and Go to Implementation on `SELF.Init()` in a later procedure went to the first procedure's `Init` and its body. [#650](https://github.com/msarson/Clarion-Extension/issues/650)
- **Go to Implementation answers only on a method's name.** With the cursor on the object before the dot, on `SELF` or `PARENT`, or on an argument of a method call, it opened the method's body; on `Obj` in `Obj.Show()` it went to `Show`. Those words are the object, the class or the argument, not the method, so it now goes nowhere from them; and the inner call of `a.Outer(b.Inner())` opens its own body rather than the outer one's. [#639](https://github.com/msarson/Clarion-Extension/issues/639)
- **Go to Implementation works on `Relate:Customer.Open()` and other colon-named objects.** It read the object's name only from its last colon, so `Relate:Customer.Open()` and `Access:Customer.TryFetch(...)` found no body, and `ThisListManager:Browse:1.Init(...)` opened another class's `Init` in the same file. Go to Definition had the same gap until #612. [#644](https://github.com/msarson/Clarion-Extension/issues/644)
- **Go to Implementation on `ThisWindow.Run()` opens the window's own `Run`.** Where a procedure's local class overrides a method, as every generated window does, it opened the parent's body, such as `WindowManager.Run`, instead of the override the call runs. Hover and Go to Definition already found the override. [#642](https://github.com/msarson/Clarion-Extension/issues/642)
- **Go to Implementation and hover open the body of the overload a call binds to.** For an overloaded method called through `SELF`, `PARENT` or a chain such as `SELF.Order.AddItem(...)`, both went to the first same-named body instead of the one whose parameters match, as with `SELF.AddItem(?Control, Action)` on a window. Go to Definition already named the right overload. [#643](https://github.com/msarson/Clarion-Extension/issues/643)
- **Go to Implementation on `PARENT.Init()` finds the body when the method is inherited from further up.** Where a class sits between yours and the one that declares the method, as an application-wide window class does, it found nothing. [#645](https://github.com/msarson/Clarion-Extension/issues/645)
- **Hovering a procedure's own label shows the procedure, and says when it has no prototype.** For a procedure with no MAP prototype, the hover showed whatever else shared its name, such as an EQUATE from an include; it now names the procedure and notes that no prototype was found. A label indented from column 0 is no longer treated as a procedure. [#641](https://github.com/msarson/Clarion-Extension/pull/641) @geircodes
- **Hover and Go to Definition on `PARENT.Init()` show the method the call runs.** Where the parent class declares the method only with parameters the call does not pass, as `ReportManager.Init` does, they showed that one instead of the inherited `WindowManager.Init()` that a no-argument `PARENT.Init()` runs in every generated report. `SELF` and named objects already followed this rule. [#648](https://github.com/msarson/Clarion-Extension/issues/648)
- **Go to Implementation and hover find a method body you have not saved yet.** For `Object.Method()` and chained calls such as `SELF.Order.Init()`, the body was looked for in the file as last saved, so one typed since, or in a file never saved, was missed, and the hover card showed no prototype for a declaration in the same state. [#640](https://github.com/msarson/Clarion-Extension/issues/640)
- **Find All References on `PARENT.Kill()` lists the parent's `Kill`.** Inside a method that overrides it, the search started from the override instead, and did not even list the line it was run from. It now gives the same list as the parent's own declaration. [#637](https://github.com/msarson/Clarion-Extension/issues/637)
- **Hover and Go to Definition agree on `SELF.x`, `PARENT.x` and `obj.x`, including inherited overloads.** Where a parent class declares the same method with different parameter types, as `AddItem(STRING)` and `AddItem(LONG)`, Go to Definition on `SELF.AddItem(Count)` went to the first one while hover showed the one the argument's type picks; both now name the right one. The hover card for such a member also shows its attributes and return type, as `SELF.` members already did. [#651](https://github.com/msarson/Clarion-Extension/issues/651)
- **Hover and Go to Definition follow chains such as `FDB5.Q.DLB:Active` and `SELF.Part.Get()` through the procedure's own classes.** A chain that started at a local class read that class as its parent, so a member the local class declares for itself, as every generated browse and drop list does with its queue `Q`, was missed: hover showed nothing and Go to Definition went to an unrelated declaration of the same name. A chain starting at `SELF` in a later procedure used the first procedure's class of the same name. Both now resolve to the field or method the code names, and the argument types of a chained call pick the overload and its body as they do for `SELF.x`. A field reached through such a chain shows the same card as the field written directly, `Queue:Browse:1.LOC:ActiveFlag`. [#652](https://github.com/msarson/Clarion-Extension/issues/652)
- **Go to Implementation finds the same member as Go to Definition, and opens library bodies under their real file names.** It now asks the same question as hover and Go to Definition for `SELF.x`, `PARENT.x`, `obj.x` and chains, so it opens the body of the declaration Go to Definition shows. On a `SELF.` data member such as `SELF.Request` it goes to the declaration, as it already did for `obj.x`, where it did nothing. A body in the Clarion library opens as `ABWINDOW.CLW` rather than `abwindow.clw`. [#654](https://github.com/msarson/Clarion-Extension/issues/654)
- **Find All References and Rename work on `ThisWindow.Run()`, `obj.Method()` and `Class.Method()` wherever Go to Definition does.** They found nothing on many such calls, among them every generated procedure's `ThisWindow.Run()`, because they resolved the member their own way; they now start from the declaration Go to Definition names. [#654](https://github.com/msarson/Clarion-Extension/issues/654)
- **Completion after a procedure's own class, as `BRW1.` or `ThisWindow.`, offers the members that class declares.** It read the class as its parent and offered only the inherited members. [#654](https://github.com/msarson/Clarion-Extension/issues/654)
- **Signature help shows the parameters of `PARENT.Method(` and of a method a procedure's own class declares.** Inside an override, `PARENT.Init(` showed nothing, and `ThisWindow.Method(` found only methods inherited from the parent. [#654](https://github.com/msarson/Clarion-Extension/issues/654)
- **Hover links, Go to Definition and Find All References show library files under their real names.** On calls such as `ThisWindow.Run()`, the hover link and the editor tab Go to Definition opened read `abwindow.inc` for `ABWINDOW.INC`, and Find All References listed hits in library and generated files in lower case. It was the same file either way; only the name was wrong. [#655](https://github.com/msarson/Clarion-Extension/issues/655)
- **A file reached through a short path is shown under its real name too.** Where a folder came through in short 8.3 form, such as `PROGRA~1` or a shortened `%TEMP%`, its files kept the path as given; they now show the long names, and Rename still recognises a generated module there and leaves it alone. [#703](https://github.com/msarson/Clarion-Extension/pull/703) @geircodes
- **A field or variable declared `LIKE(name)` shows what it is like, and the type that gives it.** Hovering a browse-queue field such as `Queue:Browse:1.LOC:Flag` said only `LIKE`; its card and the declaration's now read `LIKE(LOC:Flag)` → `BYTE`, following chains of LIKE, and a field card shows its declaration as written rather than rebuilt from tokens. Hovering the name inside `LIKE(...)` shows the declaration it names, not the field being declared. [#656](https://github.com/msarson/Clarion-Extension/issues/656)
- **A queue field written in dot form shows the same card as its declaration.** `SELF.Q.LOC:Flag`, `BRW1.Q.Field` and `Rows.Extra` showed an older card, titled `Queue:Browse:1 Field:`, with no line saying where the field is declared; they now show the field's own card, as a GROUP field already did. [#657](https://github.com/msarson/Clarion-Extension/issues/657)
- **A GROUP or QUEUE field reached through a chain is never called a class property.** `Obj.Q.Field` into a structure declared in another file showed `Class Property`; it now says `Group Field` or `Queue Field`. A field of a nested GROUP reached through a chain, and a field of a GROUP or QUEUE whose type is declared in another file, now show the same card as their declaration. [#668](https://github.com/msarson/Clarion-Extension/issues/668)
- **Find All References on a procedure's own label lists every use in the program.** Asked at `Target PROCEDURE` in a member module, it listed only that line, while asking at the MAP prototype or at any call, including `START(Target)`, listed them all; Go to Definition from the same label already found the prototype. It now searches from that prototype, so Rename from the label renames the calls too. [#688](https://github.com/msarson/Clarion-Extension/pull/688), following [#602](https://github.com/msarson/Clarion-Extension/issues/602).
- **Go to Definition between a MAP line and a procedure selects the whole name.** Jumping to an implementation selected only the first nine characters of its label (the length of `PROCEDURE`), and jumping to a MAP line started at column 0 whatever its indentation; both now cover the name. [#689](https://github.com/msarson/Clarion-Extension/issues/689), noticed by @peterparker57
- **Go to Implementation to a method body, and Go to Definition to a CLASS entry, select the name.** Implementation selected nothing, the whole signature line, or the label, depending on whether the body's file was already open; Definition to a CLASS or INTERFACE member selected nothing. Both now cover the name, as #689 does for procedures. [#690](https://github.com/msarson/Clarion-Extension/issues/690)
- **Go to Definition and hover work on a parent class or type declared in the same file.** On `CLASS(Parent)`, `GROUP(Type)`, `QUEUE(Type)` or `LIKE(Type)`, both answered nothing when the type was declared in the file itself rather than an included file, as in a member module that declares a class and its child. [#698](https://github.com/msarson/Clarion-Extension/issues/698)
- **Go to Definition on SELF, PARENT or an IMPLEMENTS interface selects the name it lands on.** These landed on the right line with nothing selected; they now select the class or interface name, like every other definition. [#697](https://github.com/msarson/Clarion-Extension/issues/697)
- **A GROUP inside a CLASS, or a structure inside a TYPE, is no longer taken for a global type.** The declaration index listed these members by their bare name, so completion after an undeclared `Settings.` offered a library class member's fields, and hovering it named an unrelated field as a type. An undeclared name now gets neither. [#704](https://github.com/msarson/Clarion-Extension/pull/704) @geircodes
- **Completion in a member module offers the globals the PROGRAM includes in its data section.** A global declared in a file the PROGRAM pulls in with `INCLUDE` was missing from the list, although hover and Go to Definition found it. [#705](https://github.com/msarson/Clarion-Extension/pull/705) @geircodes
- **Completion follows a MEMBER statement taken from an included shim file.** In a module whose `MEMBER('program')` comes from a file it includes first, completion offered none of the PROGRAM's globals; hover and Go to Definition already followed the shim. [#706](https://github.com/msarson/Clarion-Extension/pull/706) @geircodes
- **Go to Definition from a MAP prototype follows unsaved edits in the module.** When the module holding the procedure was open with unsaved changes, it read the saved file and landed on the line the procedure had at the last save. It now reads the open editor's text. [#711](https://github.com/msarson/Clarion-Extension/issues/711)

#### Diagnostics

- **A redefined SELF, PARENT or NULL is reported as the compiler reports it.** SELF or PARENT as a method's parameter or local, or NULL as a procedure's name, compiles with the warning "Redefining system intrinsic", and in that method the new name hides the real SELF or PARENT, so `SELF.Draw()` there fails. The same warning now appears in the editor. [#702](https://github.com/msarson/Clarion-Extension/issues/702)
- **The reserved-keyword label check follows what the compiler accepts, not the help's list.** Built on Clarion 10 and 12, it now reports TRY, CATCH and FINALLY, and a reserved word as a GROUP field or CLASS method; it no longer reports CODE, DATA, NULL or THROW, WINDOW, CLASS, QUEUE and the like as a PROCEDURE's label, or a reserved word such as `OF` that starts a statement in column 1. [#701](https://github.com/msarson/Clarion-Extension/issues/701)
- **Problems appear for every restored tab after a restart, not only the one in front.** VS Code loads a background tab's file only when the tab is clicked, so its problems appeared only then. Each restored Clarion tab is now checked from disk once the solution has loaded, one at a time; `clarion.restoredTabDiagnostics` turns this off. [#696](https://github.com/msarson/Clarion-Extension/issues/696)
- **An INCLUDE or MEMBER naming a file that cannot be found is reported as an error.** Both fail the compile, and until now nothing said so before a build. The file's name is underlined, found the way the file graph finds it; a MODULE name is never reported, since it may name an external library, nor is anything inside OMIT or COMPILE. On by default, with the usual `clarion.diagnostics.unresolvedFileReferences` settings. [#695](https://github.com/msarson/Clarion-Extension/issues/695)
- **A report of the file references that do not resolve.** **Clarion: Unresolved File References**, or a click on the Graph row in the Clarion Tools pane, lists every INCLUDE whose file cannot be found and every MEMBER whose program file cannot be found, with the file and line, plus project sources that are missing. MODULE names with no file behind them are listed separately and not counted as problems, since a MODULE may name an external library by any identifier; so are references inside OMIT or COMPILE blocks. [#687](https://github.com/msarson/Clarion-Extension/issues/687)
- **A structure closed by a period at the end of a continued line is no longer reported as unterminated.** Where an IF's body was split across a `|` continuation and closed with a trailing period, the period was taken to end the statement rather than the structure, so the following END closed the inner IF and its parent was flagged on code the compiler accepts. [#630](https://github.com/msarson/Clarion-Extension/pull/630) @geircodes
- **A file that is not valid UTF-8 is reported once, as an encoding problem, instead of flagging its characters.** Generated Clarion separates the fields of a descriptor string with high-bit bytes, so an ANSI file opened as UTF-8 shows every delimiter as `�` and each line was reported as containing characters with no ANSI encoding — 21 findings on one file, none of them about anything in the file. The offered quick fix deleted those characters, which strips the delimiters out of the strings. The file is now named as wrongly decoded, with the warning that saving it in that state overwrites the original bytes, and no fix is offered. [#629](https://github.com/msarson/Clarion-Extension/issues/629)
- **An overloaded method is no longer reported as discarding a return value when the overload being called has none.** Where one prototype returns a value and another does not, and both accept the number of arguments passed, the call was checked against the wrong one. A name whose prototypes all return a value is still reported. [#621](https://github.com/msarson/Clarion-Extension/issues/621)
- **A discarded return value is reported on a method a procedure's own class declares.** For `BRW1.Mine()`, where the local `BRW1 CLASS(BrowseClass)` declares `Mine` with a return value, the method was looked for on BrowseClass and the call was passed over. The check's saved results from an earlier version are set aside once, so an update takes effect without editing the file. [#654](https://github.com/msarson/Clarion-Extension/issues/654)
- **Published diagnostics say which version of the document they are for.** A slower analysis pass for one version can arrive after the editor has moved to the next, and a client that reads only the standard protocol had no way to tell, so it showed the older answer against the newer text. Reported by Bill Atchison. [#619](https://github.com/msarson/Clarion-Extension/issues/619)
- **The discarded-return check looks only at procedures the file can see.** It checked calls against every file the extension had happened to read, so a same-named procedure in another project could raise a warning, and the check slowed down as hover and Go to Definition read more files. It now uses the file's own program, that program's modules and what they include. [#662](https://github.com/msarson/Clarion-Extension/issues/662)

#### Configuration and build

- **A solution in a folder with a space in its name builds, and its errors reach Problems.** A path such as `...\hand code` was split at the space on its way through the terminal's shell, so MSBuild stopped before compiling (`MSB1008: Only one project can be specified`), wrote no log, and the build failed with no errors shown. MSBuild is now started directly, without a shell; and if a build ever fails without writing a log, the message says so and points at the build terminal. [#708](https://github.com/msarson/Clarion-Extension/issues/708)
- **A build error that names a file but no line is shown on that file.** When the compiler could not open a MEMBER module's program file, Problems listed three errors against a `BuildOutput.log` in the VS Code install folder, two of them empty and one ending in `\r`. It is now one error on the source file's first line. [#693](https://github.com/msarson/Clarion-Extension/issues/693)
- **A source file added to or removed from a project while the solution is open is picked up without a reload.** The project file was read once, when the solution loaded, so a new source was left out of the file graph (Find All References, document links, the unresolved file references report) until the window was reloaded, and a removed one stayed in. [#692](https://github.com/msarson/Clarion-Extension/issues/692)
- **The Graph row in the Clarion Tools pane follows every rebuild.** The graph is rebuilt when a project file or the build configuration changes, but the row kept showing the counts from startup. [#694](https://github.com/msarson/Clarion-Extension/issues/694)
- **Set Configuration keeps the workspace file and the folder settings in step.** Where both a `.code-workspace` file and the first folder's `.vscode/settings.json` set the configuration, a pick changed only the folder copy, so a task defined in the workspace file still built the old configuration. Both copies are now updated, and so is the solution list in each. [#663](https://github.com/msarson/Clarion-Extension/issues/663)
- **The question about settings that disagree can no longer slip away.** When this workspace file and the folder settings give different values, the extension asks which to keep. It was a notification that could hide itself before you answered; it is now a dialog. [#669](https://github.com/msarson/Clarion-Extension/issues/669)
- **Keep as is in that question is remembered.** It no longer does the same as Cancel: the question returns only when a value changes or another setting starts to disagree. [#686](https://github.com/msarson/Clarion-Extension/issues/686)
- **The build configuration is stored in one format.** Set Configuration stored the bare name (`Release`) while opening the solution stored the solution's own entry (`Debug|Win32`), so a task reading `clarion.configuration` saw the format change. Both now store the solution's own entry. [#674](https://github.com/msarson/Clarion-Extension/issues/674)
- **The configuration, version and build buttons stay in the status bar while a solution is open.** They showed only while a Clarion file had focus, so from a build script or with no file open you had to click into a Clarion file first. With no Clarion file in focus, the build button builds the solution. In a folder with no Clarion solution they still stay hidden. [#675](https://github.com/msarson/Clarion-Extension/issues/675)
- **"Set Active Version" is now "Clarion: Set Version".** With a solution open it sets that solution's Clarion version, not your default, and the old name suggested the default. The Actions view now says "Set the Clarion version for this solution"; your default is still the "Set as default for new solutions" item in the list. [#677](https://github.com/msarson/Clarion-Extension/issues/677)
- **The configuration you set is kept at startup, and the Clarion IDE is told it.** The configuration the Clarion IDE last saved for the solution replaced your `clarion.configuration` every time VS Code started, and was written back into your settings. Your setting now wins, and the IDE's saved configuration is updated to match, so the IDE opens the solution on the same one. A solution already open in the IDE keeps the IDE's own choice until it is closed and reopened. With no configuration set, the IDE's choice is still used. [#664](https://github.com/msarson/Clarion-Extension/issues/664)
- **Run and Debug no longer need a file open.** Ctrl+F5 and F5 start the startup project, or the solution's only project, from anywhere in the window, including the Solution View buttons. With several projects and no startup project they use the open file's project as before, and otherwise ask which project to start instead of refusing. A project that builds a library with no StartProgram is never started, and says so before offering to build. [#666](https://github.com/msarson/Clarion-Extension/issues/666)
- **Run works whatever your default terminal is.** It sent a PowerShell command line to your default terminal, so with Command Prompt or Git Bash as the default it failed with "& was unexpected at this time." Run now opens a PowerShell terminal of its own. [#676](https://github.com/msarson/Clarion-Extension/issues/676)
- **A custom command for Run.** Set `clarion.run.command` to have **Run Without Debugging** execute your own command instead of the project's output exe, for a program that runs through a copy step or a batch file. `${exe}`, `${projectDir}` and `${args}` are filled in. [#679](https://github.com/msarson/Clarion-Extension/issues/679)
- **Run no longer leaves a terminal behind each time.** A Run closes the previous Run terminal of the same program before opening its own, and with `clarion.run.command` set the terminal is named "Run (custom): <program>". [#684](https://github.com/msarson/Clarion-Extension/issues/684)
- **The Clarion Tools pane shows the settings behind Build and Run.** A Build log row says whether the log is kept and opens the last one, a Run row appears when `clarion.run.command` is set, the Startup row picks the startup project, and a Settings row opens the build settings. [#681](https://github.com/msarson/Clarion-Extension/issues/681)
- **The Actions toolbar no longer breaks in a narrow side bar.** Its buttons wrap onto a second row instead of squeezing or disappearing, and the icons are drawn the same whatever the font. [#682](https://github.com/msarson/Clarion-Extension/issues/682)
- **Click the Clarion row in the Actions view to set the version.** It replaces the gear button, which leaves the toolbar with just the IDE, build, run and debug actions. [#683](https://github.com/msarson/Clarion-Extension/issues/683)
- **The Compile version item shows after a normal start.** It appeared only after Clarion: Set Version, because loading the solution never updated it. [#685](https://github.com/msarson/Clarion-Extension/issues/685)
- **No more "Project file updated" when nothing changed.** A solution, project or redirection file touched without being changed, by a build step, git or another tool, reloaded the solution and said it was updated. Only a change to the file's content does that now. [#680](https://github.com/msarson/Clarion-Extension/issues/680)
- **`$clarionBuildMatcher` now finds compiler errors in your own build tasks.** The problem matcher the extension contributes never matched, so a task that named it put nothing in Problems. It now reads the compiler's error and warning lines for `.clw`, `.inc`, `.equ`, `.eq` and `.int` files, and leaves out the project name even when MSBuild wraps it onto the next line. [#667](https://github.com/msarson/Clarion-Extension/issues/667), [#673](https://github.com/msarson/Clarion-Extension/issues/673)
- **The extension's build result no longer outlives another build.** When your own build task starts (Ctrl+Shift+B or a script), the extension clears its last build's Problems and a failed-build message in the status bar, which described a build that was no longer current. **Clarion: Clear Build Results** does the same on demand. [#670](https://github.com/msarson/Clarion-Extension/issues/670)
- **A full-solution build shows what it builds.** Each project of a solution build now writes the same header to the Clarion Build output as a single-project build: the project, the configuration and the MSBuild command line, which names the Clarion install used. [#671](https://github.com/msarson/Clarion-Extension/issues/671)
- **Build errors in `.eq` files appear in Problems.** The build reported errors in `.clw`, `.inc`, `.equ` and `.int` files; one in an `.eq` equate file was left out. [#672](https://github.com/msarson/Clarion-Extension/issues/672)
- **Build messages no longer end in `\r`.** A failing pre- or post-build step could reach Problems as "…cannot find the file specified.\r", because MSBuild writes a line break in a tool's output as those two characters. [#678](https://github.com/msarson/Clarion-Extension/issues/678)

#### Performance

- **No more multi-second freeze reading a class header that pads its parameter lists with spaces.** A prototype such as `Name PROCEDURE(<hundreds of spaces>)` took time that grew with the cube of the padding, so one such header held the language server for over two seconds on a first start. It now reads in a few milliseconds. [#660](https://github.com/msarson/Clarion-Extension/issues/660)
- **Hover stays fast in very large modules, also straight after an edit.** On a 60,000-line generated module a hover took over 150 ms with nothing changed, and up to 18 seconds after an edit. It now answers in a few milliseconds when nothing has changed, and in about half a second after an edit. [#711](https://github.com/msarson/Clarion-Extension/issues/711)
- **Opening or editing a large module no longer holds up the language server while it checks by-reference arguments.** The check rebuilt a list of the document's EQUATEs for every call it looked at, so on a 30,000-line module one pass took about ten seconds, during which hover and everything else waited. [#713](https://github.com/msarson/Clarion-Extension/pull/713) @geircodes

#### Editing

- **Introduce EQUATE puts the EQUATE above a use in data.** On a literal inside a declaration, such as a LIST's `FORMAT('...')` in a procedure's WINDOW, the EQUATE was inserted just before `CODE`, below its use, and the build failed with `Unknown identifier`. It now goes before the declaration that uses it; a literal in executable code still goes just before `CODE`. [#709](https://github.com/msarson/Clarion-Extension/issues/709)
- **Introduce EQUATE takes the whole of a string built from several literals.** On `'some string' & | 'Some more string' & | 'even more string'`, the EQUATE held only the literal under the cursor; it now holds the whole chain, continuation lines and all, and the whole chain is replaced by the name. The chain stops at anything that is not a literal, so `'a' & Name & 'b'` keeps its meaning. [#710](https://github.com/msarson/Clarion-Extension/issues/710)

---

### [1.0.5] - 2026-09-18

**Highlights**

- Names the extension could not resolve in a real generated application: a prefix longer than eight characters, a prototype an INCLUDE carries into a MAP, an indented prefixed prototype, and the program-wide scope of a program's MAP for Find All References.
- Find All References lists the call sites of a DLL-imported procedure, and a routine hover names the procedure the routine belongs to.
- Whitespace before the member-access dot, and a dot that ends the statement, read as the compiler reads them.
- Completion offers ROUTINE labels, and after `DO` offers only those.
- Reported by Bill Atchison, with contributions from [@geircodes](https://github.com/geircodes).

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-1.0.5.md)

---

### [1.0.4] - 2026-09-17

**Highlights**

- Configuration you can trust: the Clarion version and build configuration actually in force win over remembered ones, stick in multi-root workspaces, reach the language server straight away, and every build states what it builds and how.
- Every diagnostic check has its own on/off setting and severity, diagnostics can be pulled by the editor, and a new opt-in check reports calls to procedures declared nowhere.
- Show Call Hierarchy, hover on END/ELSE/OF/TO naming what they belong to, and Find All References and rename reaching LINK() class files, the whole DLL family and every MEMBER module.
- Editing large modules is markedly quicker: tokenizing is about three times faster, and background checking stops as soon as you type.
- Many contributions from [@geircodes](https://github.com/geircodes).

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-1.0.4.md)

---

### [1.0.3] - 2026-09-13

**Highlights**

- Generated code reads correctly: the MAP shapes an app generator emits, procedure names shared between an EXE and its DLLs, and the FILE, VIEW, KEY and JOIN structures underneath now hover and navigate.
- Fields resolve however they are reached: inherited through `QUEUE(Type)` or `GROUP(Type)`, through a dot or a chain on an ordinary variable, and `?Name` field equates as the control they name.
- New diagnostics settled by compiling a fixture: a PRIVATE procedure called from another module, every documented MAP prototype shape, and VIEW JOIN fields checked against the parent file.
- The last second-long cold starts on large programs are gone, and start-up work shows as progress in the status bar.
- Contributions from [@geircodes](https://github.com/geircodes) and [@ClarionLive](https://github.com/ClarionLive).

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-1.0.3.md)

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
