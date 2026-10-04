# Changelog — 1.0.5

Archived from the main CHANGELOG when 1.0.8 was released. The three newest versions stay in full there.

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
