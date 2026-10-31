# Changelog

All notable changes to the Clarion Extension are documented here.

---

## Recent Versions

### [1.0.10] - Unreleased

#### Navigation and hover

- **YIELD, COMMIT, TODAY and other built-ins written without parentheses are no longer called constants.** Clarion calls a built-in that needs no arguments without parentheses, and the hover captioned every such word "Built-in constant"; it now shows the built-in's own card, as a statement when it returns nothing (YIELD, COMMIT, HALT) and as a function when it returns a value (TODAY, ERRORCODE). The DATE entry described the DATE data type and now describes `DATE(month, day, year)`. [#784](https://github.com/msarson/Clarion-Extension/issues/784)
- **A MAP prototype continued onto a second line with `|` is one entry in the Structure view.** The continuation was read as a new declaration, so `EXPORT,NAME('x')` on the second line appeared as a procedure called EXPORT. [#790](https://github.com/msarson/Clarion-Extension/issues/790)
- **An indented MAP prototype keeps its whole label in the Structure view.** A label with two colons, such as `XL:Column:S`, was shown as `S` when the prototype was indented. [#789](https://github.com/msarson/Clarion-Extension/issues/789)
- **The attributes of a MAP prototype have hover cards, and NAME says what it means there.** NAME on a prototype showed the card for the `NAME(file)` function, and PROC, DLL, RAW, C and PASCAL showed nothing; NAME now explains the external name the linker uses, and the others show their own cards. [#791](https://github.com/msarson/Clarion-Extension/issues/791)
- **BAND, BOR, BXOR and BSHIFT hover as built-in functions.** Their cards called them operators and showed `expr1 BAND expr2`; they now show the built-in function card, `BAND(value, mask)`, `BOR(value, mask)`, `BXOR(value, mask)` and `BSHIFT(value, count)`. [#798](https://github.com/msarson/Clarion-Extension/issues/798)
- **An INCLUDE in a COMPILE or OMIT block that does not compile is no longer followed.** A block is decided from the EQUATEs before it, including those of an earlier INCLUDE such as a version file, and from PRAGMA defines; one whose switch is not known is followed as before. Version-specific declarations chosen this way now resolve to the version actually compiled, and the file name of an INCLUDE that is not followed still opens with F12 or Ctrl+click. [#807](https://github.com/msarson/Clarion-Extension/issues/807)
- **A COMPILE or OMIT block in a project's source is decided by the project's defines.** The .cwproj's conditional switches for the active configuration, a legacy .prj's `#pragma define` and a source's own `/define` now count, when every project that compiles the file agrees; a header shared by several projects is still followed as before. [#812](https://github.com/msarson/Clarion-Extension/issues/812)
- **A prototype whose label stands alone on its line keeps its name in the Structure view.** A long label continued with `|` and `PROCEDURE` on the next line showed as an entry named `|`. [#804](https://github.com/msarson/Clarion-Extension/issues/804)
- **Go to Implementation from a call finds a procedure prototyped behind an extra INCLUDE.** When the file included in the global data only included the one holding the MAP, the call went unresolved although Go to Definition found the prototype. [#809](https://github.com/msarson/Clarion-Extension/issues/809)
- **The INTERFACE card shows a parent interface and COM.** The syntax now reads `INTERFACE([parentinterface]) [,TYPE] [,COM]`, and the card no longer says every method must be implemented: a derived class that re-implements its parent's interface may leave methods to the parent. [#797](https://github.com/msarson/Clarion-Extension/issues/797)
- **Signature help for a class method shows which parameters can be omitted.** An omittable parameter lost its `<...>` and a default value its `=1`, so `<*InfoGroup pInfo>, LONG pMode=1` read as two required arguments; both now show as declared, for procedures too. [#813](https://github.com/msarson/Clarion-Extension/pull/813) @geircodes
- **Completion offers what a module's own INCLUDE declares.** A MEMBER module that INCLUDEs a header before its first procedure can use the header's types and globals, but completion only followed the PROGRAM's INCLUDEs, so typing the start of such a type offered nothing. A class's properties are also no longer offered as globals by name. [#814](https://github.com/msarson/Clarion-Extension/pull/814) @geircodes
- **The parameters of a prototype continued with `|` are not Outline entries.** A parameter typed with a colon name, such as `*HTTP:Query request` on a continuation line, appeared in the Outline as an entry called `Query request`. `MODULE('')` showed as `MODULE(""")`. [#818](https://github.com/msarson/Clarion-Extension/issues/818)
- **A type with a colon is shown whole in the Outline.** `session &HTTP:Session` showed as `session &HTTP`, and a generated `&Queue:Browse:1` as `&Queue1`. A variable declared with a colon type such as `Q:Type` now appears at all. [#819](https://github.com/msarson/Clarion-Extension/issues/819)
- **A label named like an attribute keeps its own card.** A parameter called `Password` in a CLASS method's prototype showed the PASSWORD attribute card, and so did most other attribute names; a parameter called `Key` showed the KEY card, and a field called `Hide` the HIDE card. Attribute cards now show only where an attribute is written. [#820](https://github.com/msarson/Clarion-Extension/issues/820)
- **The PROP:VLBval and PROP:VLBproc cards are complete.** They stopped where the help went on to list the procedure's parameters; 15 other runtime property cards that were cut the same way are complete too. [#822](https://github.com/msarson/Clarion-Extension/issues/822)
- **PROP:Value on a control shows what it means for a control.** `?Radio{PROP:Value}` and `?Check{PROP:Value}` showed the FILE meaning; a control shows the control meaning, a FILE the FILE meaning, and both are shown when the target is not known. [#823](https://github.com/msarson/Clarion-Extension/issues/823)
- **Hover, Go to Definition and Find All References find a parameter of a header continued with `|`.** When a procedure's parameters ran over several lines, none of them, not even those on the first line, had a card or a definition; a parameter on a continued MAP or CLASS prototype line now has its card too. [#825](https://github.com/msarson/Clarion-Extension/issues/825)
- **A procedure's parameter has its card inside the procedure's ROUTINEs.** A ROUTINE sees its procedure's parameters, but hovering one there showed nothing; the card now shows it and names the procedure. [#757](https://github.com/msarson/Clarion-Extension/issues/757)
- **Completion and hover read the local GROUP the code sees.** When several procedures of a module each declare their own `Request GROUP`, typing `Request.` offered the first procedure's fields, and hover on a field only a later GROUP has showed a different card, slowly; both now use the ROUTINE's or procedure's own GROUP, else the module-level one, also for a method reached through its field (`Request.Payload.KeepOnly`). [#829](https://github.com/msarson/Clarion-Extension/pull/829), [#830](https://github.com/msarson/Clarion-Extension/pull/830), [#833](https://github.com/msarson/Clarion-Extension/pull/833) @geircodes
- **Signature help works on a chained receiver.** A call such as `Request.Payload.KeepOnly(` or `SELF.Order.Add(` showed no parameter list, though hover found the method; the receiver chain is now walked as hover and Go to Definition walk it. [#832](https://github.com/msarson/Clarion-Extension/pull/832) @geircodes
- **A local class's methods see their procedure's GROUP.** In `ThisWindow.Init` and the other methods of a class declared in a procedure, `Request.` offered the first procedure's fields and hover showed the fallback card; they now read that procedure's own GROUP. Where only another procedure declares the label, the module's own or INCLUDEd declaration answers. [#831](https://github.com/msarson/Clarion-Extension/issues/831)
- **BREAK and CYCLE show the LOOP or ACCEPT they act on.** Hovering one names the loop it leaves or restarts, labelled or innermost, with a link to its opening line, and for BREAK the END, period, UNTIL or WHILE that execution continues after. [#836](https://github.com/msarson/Clarion-Extension/pull/836) @geircodes
- **A call to a procedure prototyped in a file INCLUDEd in the MAP resolves without a MODULE block.** For a bare `Worker PROCEDURE` in such a file, hover linked only the prototype, Go to Definition went to the procedure, Go to Implementation found nothing and the call was reported as unresolved; all four now treat it as a prototype of the module whose MAP includes it, or of the MEMBER parent. [#837](https://github.com/msarson/Clarion-Extension/pull/837) @geircodes

#### Diagnostics

- **An implementation that names its parameters without their types no longer mismatches its MAP prototype.** Clarion allows `Test PROCEDURE (q)` for the prototype `Test (LONG)`: in a procedure's definition a parameter's type is optional and its label required. Both sides were flagged as a signature mismatch; a parameter of another type, or a different count, still is. [#793](https://github.com/msarson/Clarion-Extension/issues/793)
- **An interface method whose prototype spans several lines is no longer reported as not implemented.** Its parameters were counted from the first line only, so an implementation with the full list never matched; a label continued onto the next line was read as `|`. [#805](https://github.com/msarson/Clarion-Extension/issues/805)
- **A misspelt attribute on a declaration is reported.** A word in attribute position that is not a Clarion attribute, such as IMPLUMENTS on a CLASS or a typo on a variable or a window control, gets the compiler's "Unknown attribute" warning. EXPORT on a CLASS, which the compiler accepts though the help does not document it, is not reported. [#806](https://github.com/msarson/Clarion-Extension/issues/806), [#839](https://github.com/msarson/Clarion-Extension/issues/839)
- **A class implementing a derived interface is warned when it leaves out an inherited method.** For `IChild INTERFACE(IParent)`, the methods IChild inherits must also be implemented, as `Class.IChild.Method`; the check counted only IChild's own methods. [#797](https://github.com/msarson/Clarion-Extension/issues/797)
- **A RETURN on one branch of an EXECUTE no longer greys out the branches after it.** Each statement of an EXECUTE, or a BEGIN ... END block, is its own branch and only one runs, so the next one is still reachable. [#808](https://github.com/msarson/Clarion-Extension/issues/808)
- **A MEMO or BLOB in a VIEW's PROJECT is not reported as a missing field.** A MEMO or BLOB is declared in the FILE before its RECORD, and only the RECORD's fields were counted; a field the FILE does not have is still reported. [#817](https://github.com/msarson/Clarion-Extension/issues/817)
- **A parameter named like a structure no longer opens one.** In a prototype continued with `|`, a parameter called `option` (or GROUP, QUEUE, MENU and the like) opened an OPTION structure, so the MAP was reported as having no END and the MODULE's END was said to close OPTION. [#821](https://github.com/msarson/Clarion-Extension/issues/821)
- **An implemented interface method is no longer reported as missing when its header spans several lines or it is named Data or Code.** The implementation's parameters were counted from its first line only, and `Class.Interface.Data PROCEDURE` was read as a DATA section rather than a method. [#834](https://github.com/msarson/Clarion-Extension/issues/834)

#### Syntax

- **The file-handling built-ins are coloured alike.** STREAM, EMPTY, PACK, BUFFER, SKIP, APPEND, RELEASE, WATCH, LOGOUT, COMMIT and ROLLBACK took the function colour while FLUSH, OPEN, CLOSE and SET took the keyword colour; they now all share the keyword colour. [#799](https://github.com/msarson/Clarion-Extension/issues/799)

#### Configuration and build

- **A project's options open as the Clarion IDE's pages.** Project Properties (a click on a project in the Solution View, a `.cwproj` in the Explorer, or Open With…) shows Application, Compiling, Debug and Build Events for a configuration, with each value marked as applying to all configurations or that one, and offers only the options the installation's build understands. A Sources tab lists the compiled sources, project references, file drivers and libraries, and adds or removes them. Changes are ordinary edits to the `.cwproj`, undone and saved like any other, and its XML is one click away. [#792](https://github.com/msarson/Clarion-Extension/issues/792)
- **A solution's settings are on one page.** Solution Properties (a click on the solution in the Solution View, or its gear) shows the Clarion installation, compiler version, configuration and startup project, each project's type, references and export file, and the build log, run and file graph settings; changes apply at once. [#792](https://github.com/msarson/Clarion-Extension/issues/792)
- **Solution Properties adds projects to the solution.** New project makes one in the solution's folder, an EXE or a DLL with its main source file and, for a DLL, its export file; Add an existing project adds a .cwproj from disk. The project is added to the .sln for every configuration, and the rest of the file is left as it was. [#795](https://github.com/msarson/Clarion-Extension/issues/795)
- **A new project can go in a sub-folder of the solution.** New project takes an optional folder below the solution's folder, such as `Libs\Orders`, and makes it when it is missing. Such a project reads the redirection file in its own folder, not one beside the .sln, and the add warns when that applies. [#796](https://github.com/msarson/Clarion-Extension/issues/796)
- **The property pages show where each project is.** Solution Properties shows each project's path from the solution's folder under its name, and Project Properties shows the project's full path the way Solution Properties shows the solution's. [#800](https://github.com/msarson/Clarion-Extension/issues/800)
- **Open Solution asks its questions on one page.** When a solution's installation, compiler version or configuration has to be chosen, Open Solution shows them together, with why it is asking, instead of a quick pick for each; a solution whose remembered choice still works opens without it. [#792](https://github.com/msarson/Clarion-Extension/issues/792)
- **New Solution asks everything on one page.** The folder (the open one, or another chosen or created there, which the window then opens), the Clarion installation, compiler version and configuration, whether to start from the programs already in the folder or a new empty program, and the name are chosen together, with no quick pick first. From the programs, the projects it would make, as EXE or DLL with their sources, references and export files, the modules to place and the possible leftovers are reviewed on the same page and created with one click. [#792](https://github.com/msarson/Clarion-Extension/issues/792)
- **The Actions pane is gone; its buttons are on the Solution View.** Build, Run, Debug and Solution Properties are on the Solution View's title bar, Build and Run, Build and Debug and Open in Clarion IDE in its `…` menu, and the pane's rows on the Solution Properties page. With no solution open, the Solution View lists Open, New and the recent solutions. [#794](https://github.com/msarson/Clarion-Extension/issues/794) [#783](https://github.com/msarson/Clarion-Extension/issues/783)
- **New Solution builds a project for each program already in the folder.** In a folder of existing sources it offers one project per PROGRAM, as an EXE or a DLL, with its modules, the library sources it calls (such as Clarion's cwutil.clw) and references to the DLLs it imports from, so they build first; it asks only about modules it cannot place or that nothing calls. A DLL's export file is found through redirection, written when the DLL marks its exports with EXPORT, and otherwise left to generating the application in the IDE. [#763](https://github.com/msarson/Clarion-Extension/issues/763) [#787](https://github.com/msarson/Clarion-Extension/issues/787)
- **The Solution View shows a project as the Clarion IDE does.** Each project lists File Drivers; Libraries, Objects and Resource Files; Projects to include; and Referenced Projects before its sources, with Add on each folder and Remove on each entry, as the IDE's menus offer them. Project Properties' Sources tab gains Projects to include. [#803](https://github.com/msarson/Clarion-Extension/issues/803)
- **Refresh Solution reads a changed .sln or .cwproj again.** A project or source added outside the extension, in the Clarion IDE or by hand, now shows after Refresh Solution; it only fetched the solution as parsed when it loaded. [#801](https://github.com/msarson/Clarion-Extension/issues/801)
- **The Solution View follows a project saved from Project Properties.** Sources added or removed on the page, and its other list edits, show in the Solution View when the .cwproj is saved; until now only reloading the solution showed them. [#810](https://github.com/msarson/Clarion-Extension/issues/810)
- **A legacy .prj or .pr under Projects to include is read.** The Clarion sources its `#compile` lines name belong to the project and show under it in the Solution View, so redirection paths relative to the project folder now resolve for them; its `#include`d files, macros and `#if` conditions are followed, and a changed .prj is read again with the solution. [#758](https://github.com/msarson/Clarion-Extension/issues/758)
- **New Solution from a folder follows a legacy .prj.** Where a .prj or .pr compiles a program, its project gets exactly the sources the .prj lists, including a shared one outside the folder, and includes the .prj so its defines still apply; nothing is guessed for it. [#811](https://github.com/msarson/Clarion-Extension/issues/811)
- **A recent solution in the folder already open loads when you pick it.** Picking it from the recent solutions selected it but never loaded it, so nothing happened. [#785](https://github.com/msarson/Clarion-Extension/issues/785)
- **A solution opened from another folder loads with the version chosen for it.** When that folder still remembered an installation that no longer works, the version chosen on the way in was ignored after the switch, and the solution loaded with the old one or not at all; the chosen one now loads and replaces it. [#792](https://github.com/msarson/Clarion-Extension/issues/792)
- **Project Properties offers the CustomDll link mode.** The Clarion IDE offers Dll, Lib and CustomDll; only the first two were listed. [#815](https://github.com/msarson/Clarion-Extension/issues/815)
- **A source can have its own pragmas.** Each source on the Sources tab has Pragmas, for its own defines and the vid, warnings, line_num, check_stack and check_index settings, stored in the .cwproj as the Clarion IDE stores them; a source's own defines also decide its COMPILE and OMIT blocks. [#816](https://github.com/msarson/Clarion-Extension/issues/816)

#### Maintenance

- **The release runs the test suite as the dry run does, and stops if it fails.** It ran the server tests on Linux with their result ignored, where the suite cannot pass, so the 1.0.9 release showed 331 failures under a green step. The server and client suites now run on Windows first, and nothing is merged, tagged or published unless they pass; the release then ships the commit they passed on, publishing the same VSIX to the Marketplace as to GitHub, and stops if the branch or the version's tag names another commit. [#781](https://github.com/msarson/Clarion-Extension/issues/781)
- **Loading a solution no longer logs "Failed to refresh solution cache from server".** Two steps of the load fetch the solution moments apart, and the second gave up at once instead of waiting for the first, so every load reported a failure that had not happened; it now waits and reports the result. [#788](https://github.com/msarson/Clarion-Extension/issues/788)
- **The language server reads a project's file drivers, libraries and other files.** It looked for these `.cwproj` items under the wrong spelling and always found none; a project reference without a `<Name>` is now named from its path, so Find All References includes the projects that use such a DLL. [#802](https://github.com/msarson/Clarion-Extension/issues/802)

---

### [1.0.9] - 2026-10-24

![41 fixes](https://img.shields.io/badge/fixes-41-1f6feb?style=flat-square) ![8 new](https://img.shields.io/badge/new-8-2da44e?style=flat-square) ![1 performance](https://img.shields.io/badge/performance-1-8250df?style=flat-square)

Fifty changes. Hover cards for controls, for WINDOW, APPLICATION and REPORT headers and for FILE declarations list the attributes they set, flag the ones the compiler rejects, and add or remove them with a click. Solutions on custom-named Clarion versions, with redirection files named by full path, quoted paths or masks such as `ab*.inc`, now resolve their includes, and a solution opened from another folder loads the first time. Contributions from [@geircodes](https://github.com/geircodes) and [@ClarionLive](https://github.com/ClarionLive).

#### Navigation and hover

- **Hover on a global no longer shows a MAP procedure whose name merely starts with it.** Hovering `Log` showed the prototype of `LogViewer`; a MAP prototype now matches only its whole name. [#716](https://github.com/msarson/Clarion-Extension/issues/716) @ClarionLive
- **An OMIT or COMPILE terminator that starts with END no longer closes the structure around it.** A terminator line such as `END***` was read as an END, so a MAP closed early and the globals declared after it were missing from hover and Go to Definition. [#718](https://github.com/msarson/Clarion-Extension/issues/718) @ClarionLive
- **A word spelled like a control is no longer that control outside a WINDOW.** A variable such as `text` or `Button` outside a WINDOW, APPLICATION or REPORT no longer hovers as the control, and `BOX`, `LINE`, `IMAGE` and `ELLIPSE` in code now show their built-in procedure. [#722](https://github.com/msarson/Clarion-Extension/pull/722) @geircodes
- **ITEMIZE equates in library files are known by their real names.** An indented `END` now closes the block, a prefix with a colon such as `PRE(IC:RESET)` is read whole, a labelled `ITEMIZE,PRE` names its members after its label, and a member already written with the prefix is not prefixed twice. [#723](https://github.com/msarson/Clarion-Extension/pull/723), [#724](https://github.com/msarson/Clarion-Extension/pull/724) @geircodes
- **Dot completion on a FILE declared in an include lists its record fields.** `Orders.` offered only the keys and the record label when the FILE came from an INCLUDE; it now offers the fields as well. [#725](https://github.com/msarson/Clarion-Extension/pull/725) @geircodes
- **Hovering a field named through a FILE no longer shows the line under the cursor.** When a queue or group held a plain field named like a FILE, hovering `Notes` in `Widget.Notes` showed the hovered line itself; it now shows the FILE's field, where Go to Definition goes. [#726](https://github.com/msarson/Clarion-Extension/pull/726) @geircodes
- **Completion in an included file offers its PROGRAM's globals.** A class header or TYPE file included by a MEMBER module now lists the PROGRAM's prefixed dictionary fields. [#727](https://github.com/msarson/Clarion-Extension/pull/727) @geircodes
- **Hover and Go to Definition use the include file the program compiles.** A stale copy of a dictionary include left in the project folder no longer wins over the copy the program actually includes, and dot completion on a FILE lists that copy's fields too. [#728](https://github.com/msarson/Clarion-Extension/pull/728) @geircodes, [#732](https://github.com/msarson/Clarion-Extension/issues/732)
- **Go to Definition on the field of `File.Field` works when the FILE is declared in another file.** It now lands on the field inside the dictionary include, the declaration hover names. [#729](https://github.com/msarson/Clarion-Extension/pull/729) @geircodes
- **Hovering an attribute on a WINDOW header line shows its card.** It also says when the WINDOW does not accept the attribute. [#730](https://github.com/msarson/Clarion-Extension/pull/730) @geircodes
- **Hovering IF, LOOP, CASE, EXECUTE, BEGIN or ACCEPT shows what closes it.** The card links to the closing END, period, UNTIL or WHILE, says when the block is never closed, and warns when its END lines up with an enclosing block instead, which usually means a nested block is missing its END. [#734](https://github.com/msarson/Clarion-Extension/pull/734) @geircodes
- **Hovering a control on its own declaration shows the attributes it sets.** The card lists them, offers the flags the control accepts and does not set yet, and flags an attribute it does not accept. Every WINDOW and REPORT control is covered, with the lists checked against the compiler, so a control in a REPORT and a STRING with a picture are judged by what they actually accept. [#736](https://github.com/msarson/Clarion-Extension/pull/736) @geircodes, [#737](https://github.com/msarson/Clarion-Extension/issues/737)
- **Completion after a comma on a control or a WINDOW, APPLICATION or REPORT header offers only the attributes it accepts.** The list is the compiler-checked one for that control where it sits, less what the declaration already sets, and an attribute that takes a value is inserted with its brackets. [#740](https://github.com/msarson/Clarion-Extension/issues/740)
- **A click on an attribute in a control's card adds or removes it.** Under Attributes a name removes the attribute with its value, under Available it adds a flag, and under With value it adds an attribute such as TIP or AT with the cursor on its value; one undo puts the line back. The card offers only what the control accepts where it sits, and no links in a generated module, where the next generate would undo the edit. [#741](https://github.com/msarson/Clarion-Extension/pull/741) @geircodes, [#739](https://github.com/msarson/Clarion-Extension/issues/739), [#743](https://github.com/msarson/Clarion-Extension/issues/743)
- **Hovering WINDOW, APPLICATION or REPORT on its header line lists its attributes as a control card does.** The card shows the attributes the header sets, the flags it accepts and those that take a value, each one a link that adds or removes it outside a generated module, and it flags an attribute the structure does not accept. [#745](https://github.com/msarson/Clarion-Extension/pull/745) @geircodes
- **Hovering FILE, KEY, INDEX, MEMO or BLOB on its declaration lists its attributes as a control card does.** The card shows what the declaration sets, the flags it accepts and those that take a value, each one a link outside a generated module; DRIVER is never offered for removal, adding ENCRYPT or DLL brings the OWNER or EXTERNAL it needs, and removing OWNER or EXTERNAL takes ENCRYPT or DLL with it. Completion after a comma on these lines offers the same lists. [#746](https://github.com/msarson/Clarion-Extension/issues/746)
- **A variable named like a data type hovers as the variable in code.** `Key = Memo` showed the KEY and MEMO data types, and a call to `DATE(...)` showed the DATE data type rather than the built-in; in a CODE section a data type is now offered only after NEW. [#752](https://github.com/msarson/Clarion-Extension/issues/752)
- **A parameter's data type in a prototype shows its card.** Hovering `LONG` in `PROCEDURE(LONG pX)`, in a MAP, a CLASS or an implementation, showed nothing, or a variable that happened to be named `Long`. [#753](https://github.com/msarson/Clarion-Extension/issues/753)
- **Hover on a call finds a prototype in a library's own include file.** A procedure declared in a MAP inside an INC that the program includes in its global data, as a DLL usually ships its prototypes, now shows its card at the call site, as Go to Definition already did. A module whose first statement includes the file holding its MEMBER line now reaches its parent's includes as well. [#754](https://github.com/msarson/Clarion-Extension/pull/754) @geircodes
- **A parameter's card names the procedure that declares it.** The line linking to the declaration read `PROCEDURE, file:line` for every parameter; it now reads `Compute, file:line`, or `Counter.Add, …` in a method. [#755](https://github.com/msarson/Clarion-Extension/pull/755) @geircodes
- **The MEMO, BLOB, KEY and FILE data-type cards agree with the compiler, and INDEX has one.** A BLOB no longer shows a length, a MEMO's length is required, MEMO and BLOB list NAME and BINARY instead of EXTERNAL and DLL and no longer claim to sit in the RECORD, and FILE lists DLL and OEM. [#750](https://github.com/msarson/Clarion-Extension/issues/750)
- **A control with a numeric picture is read correctly.** `ENTRY(@n5)` showed as `ENTRY(@n5))` in the outline and breadcrumbs, and its card listed none of the attributes it sets: the picture took the control's closing bracket. [#744](https://github.com/msarson/Clarion-Extension/issues/744)
- **Hover and Go to Definition work on `SELF.InterfaceName`.** In a class that IMPLEMENTS an interface, `SELF.IHasProgress` names the class's own implementation of it. Hover showed nothing there and F12 went nowhere; both now go to the INTERFACE, including one an ancestor implements. [#773](https://github.com/msarson/Clarion-Extension/issues/773)
- **`SELF.InterfaceName.Method` is the interface's method.** In a class with a method of the same name, the call was checked against the class's own method and could be reported as discarding a return value; hover on it showed nothing. [#779](https://github.com/msarson/Clarion-Extension/issues/779)
- **Untyped variable-parameters keep their `*` in the outline, and `?` and `*?` have hover cards.** A prototype such as `memcpy(*?, *?, UNSIGNED),*?` showed `(?, ?, UNSIGNED), ?`, but `*?` (passed by address) and `?` (passed by value) are different types. [#772](https://github.com/msarson/Clarion-Extension/issues/772)
- **The COLOR card says what the colour is on a BOX, ELLIPSE, REGION or LINE.** On the first three it is the border colour, and on a LINE the colour of the line; the card said background colour for every control. [#777](https://github.com/msarson/Clarion-Extension/issues/777)
- **A member chain to the right of `SELF` on the same line has hover and Go to Definition.** In `SELF.List {PROP:Text} = glo.UI.Font`, the receiver of `UI` was read from the `SELF` further left, so `UI` had no hover and `Font` had neither. [#774](https://github.com/msarson/Clarion-Extension/issues/774)

#### Diagnostics

- **Code inside an OMIT block no longer pairs with the structures around it.** The structures and ENDs in the body of an unconditional OMIT block are matched on their own, so code that compiles no longer reports a CYCLE outside a LOOP or ACCEPT, or a CASE that is not terminated. [#720](https://github.com/msarson/Clarion-Extension/issues/720) @ClarionLive
- **An attribute the WINDOW does not accept is flagged on its header line.** `HIDE` or `PRE(...)` there, which the compiler rejects, went unnoticed until the build. Attributes the help lists as alternatives, such as HVSCROLL with HSCROLL, compile, so they get a hint instead. [#730](https://github.com/msarson/Clarion-Extension/pull/730) @geircodes, [#738](https://github.com/msarson/Clarion-Extension/issues/738)
- **An attribute an APPLICATION or REPORT header does not accept is flagged too.** Their header lists are now checked against the compiler, like the WINDOW's: a REPORT's ORIENT or COPIES, for example, is an unknown attribute. [#740](https://github.com/msarson/Clarion-Extension/issues/740)
- **An attribute a FILE, KEY, INDEX, MEMO or BLOB declaration does not accept is flagged.** The lists are checked against the compiler, so TYPE on a FILE or DUP on a MEMO is a warning, and so is ENCRYPT without OWNER or DLL without EXTERNAL, which the compiler rejects. [#746](https://github.com/msarson/Clarion-Extension/issues/746)
- **A parameter or prototype named like a control no longer draws an attribute warning.** In `DeclApply PROCEDURE(STRING Text),LONG,PRIVATE` the `Text` was taken for a TEXT control, so the valid `PRIVATE` read as "not applicable to TEXT", and the `BOX(...),NAME('Cla$BOX')` prototype in builtins.clw got a NAME warning. Attributes are now checked against a control only inside a WINDOW, APPLICATION or REPORT. [#759](https://github.com/msarson/Clarion-Extension/issues/759) [#760](https://github.com/msarson/Clarion-Extension/issues/760)
- **Overloads written without the PROCEDURE keyword are no longer flagged as indistinguishable.** A MAP prototype such as `memcpy(*?, *?, UNSIGNED)` was read as having no parameters, so any two overloads of it were "callable with zero arguments". The rules now match the compiler: a reference parameter, `*?` included, distinguishes an overload from a value one, while `?`, LONG and STRING by value do not. [#761](https://github.com/msarson/Clarion-Extension/issues/761)
- **A type from a nested include is no longer reported as "not included" after the include becomes reachable.** The saved list of the includes each file reaches ignored any include that could not be found, and everything it includes. When that include could be found later, after a redirection fix or because the file appeared, the old list was still used. The list is now rebuilt in both cases. [#770](https://github.com/msarson/Clarion-Extension/issues/770)
- **A call to a prototype whose parameters continue onto the next line is no longer reported as discarding a return value.** In `RegisterEXE (LONG addr, |` the `LONG` of the first parameter was read as the return type. The hover card on the call now shows the whole prototype. [#775](https://github.com/msarson/Clarion-Extension/issues/775)
- **Calls in a PROGRAM's own CODE section are checked for a discarded return value.** Once the file implemented a procedure, they were skipped. A method whose prototype continues onto the next line is also no longer reported as returning a value. [#778](https://github.com/msarson/Clarion-Extension/issues/778)
- **A CLASS's MODULE attribute on a continued line is no longer flagged.** When a CLASS declaration was continued with `|` and the next line began with `MODULE('...')`, that MODULE was read as a MODULE structure and reported "not terminated with END". [#771](https://github.com/msarson/Clarion-Extension/issues/771)

#### Performance

- **Looking up a procedure through the MAP includes no longer redoes its work for every name.** Each INCLUDE's location and each file's prototypes are worked out once instead of once per procedure, so the lookups behind call-site hover, Go to Implementation and the unresolved-call warning answer a further name in a fraction of a millisecond. [#756](https://github.com/msarson/Clarion-Extension/issues/756)

#### Configuration and build

- **A Clarion version registered under your own name is no longer called "no longer registered".** The check behind that message counted only versions named `Clarion ...`, so a solution remembering a custom-named version did not load until the version was picked again, although the version picker listed it. [#764](https://github.com/msarson/Clarion-Extension/issues/764)
- **A redirection file named by its full path is found.** A Clarion version whose Redirection File is set to a full path, rather than a file name in its bin folder, had no redirection file read at all, so shared includes, classes and equates did not resolve. [#765](https://github.com/msarson/Clarion-Extension/issues/765)
- **Quoted paths in a redirection file are read.** A directory or `{include}` path in double quotes, as the help recommends for paths with spaces, kept its quotes and was never found, and so did an `{include ... }` written with a space before the brace. [#766](https://github.com/msarson/Clarion-Extension/issues/766)
- **Redirection masks such as `ab*.inc` match.** Only masks of the form `*.inc` worked; a mask with a prefix or a `?` matched nothing, so its INCLUDE files were reported missing and couldn't be opened, and their folders were left out of reference searches. [#769](https://github.com/msarson/Clarion-Extension/issues/769)
- **The Open Solution dialog starts where your solutions are.** It opened in the folder of the file being edited, often a project's SRC sub-folder; it now starts at the current solution's folder, else the most recently opened one's, else the workspace folder. [#762](https://github.com/msarson/Clarion-Extension/issues/762)
- **A solution opens even when its settings can't be saved.** When the folder's `.vscode\settings.json` had an error, VS Code refused to save the solution's settings and the solution never opened, so no file had its project, shared includes did not resolve, and every reopen asked for the version again. The solution now opens for the session, and the warning names the settings file to fix and offers to open it. [#767](https://github.com/msarson/Clarion-Extension/issues/767)
- **A solution whose settings can't be saved is still remembered.** The extension keeps the version and configuration itself until the folder's settings file can be written again, so the folder reopens the solution on the next start and opening it again doesn't ask for them. A solution's remembered version and configuration are also no longer lost when it is reopened from the solution list or another folder. [#768](https://github.com/msarson/Clarion-Extension/issues/768)
- **A solution opened from another folder loads the first time.** Opening a solution with no folder open, or one in another folder, switched to its folder and opened it as a plain folder, with the version asked for only in a notification that was easy to miss; from another folder it could instead take the current solution's version and configuration. The version and configuration are now chosen for the solution before the switch, unless it remembers ones that still load, and it loads as the window reopens. [#780](https://github.com/msarson/Clarion-Extension/issues/780)

#### Editing

- **FILL shows a colour swatch, as COLOR does.** The same colour written twice on one line now gets a swatch at each place, not two at the first. [#776](https://github.com/msarson/Clarion-Extension/issues/776)
- **Typing END and pressing Enter no longer turns it into ENDPAGE.** Completion now offers END, BY, TO, GOTO, ROUTINE, PROGRAM and PROCEDURE as keywords, so the word as typed comes first instead of a longer one such as ENDPAGE, BYTES or TOOLBAR. Hover no longer describes BNOT, an operator Clarion does not have. [#747](https://github.com/msarson/Clarion-Extension/issues/747)
- **Signature help inside a KEY, INDEX or MEMO declaration shows that declaration.** Typing `MyKey KEY(` in a FILE showed the window control's `KEY(keycode)` attribute; it now shows the key's components, an INDEX its optional components, and a MEMO its required length. The KEY and ALRT attributes on a control describe their keycode instead of a placeholder. [#748](https://github.com/msarson/Clarion-Extension/issues/748)
- **Completion after a label inside a FILE offers only what a FILE holds there.** Before the RECORD it offers KEY, INDEX, MEMO, BLOB and RECORD, instead of the window control attribute KEY and built-ins such as KEYBOARD; KEY, INDEX and MEMO come with their brackets. [#749](https://github.com/msarson/Clarion-Extension/issues/749)

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

**Highlights**

- Hover, Go to Definition, Go to Implementation, Find All References and completion read `SELF`, `PARENT`, a procedure's own classes and chained members such as `FDB5.Q.DLB:Active` the same way, so the five features agree on what a name is.
- Build and Run follow the configuration actually in force, keep it in step with the Clarion IDE, and show it in the Clarion Tools pane; Run works with any default terminal and takes a custom command.
- An INCLUDE or MEMBER naming a file that cannot be found is an error, with a report of every file reference that does not resolve, and Problems appear for every restored tab after a restart.
- Hover stays fast in very large generated modules, including straight after an edit.
- Reported by Bill Atchison, with contributions from [@geircodes](https://github.com/geircodes).

[**→ Full details**](dev/docs-internal/changelogs/CHANGELOG-1.0.6.md)

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
