# Changelog — 0.9.5 (2026-04-21)

Archived from the main CHANGELOG.md on 2026-09-13 (1.0.3 release). Full text as published.

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
