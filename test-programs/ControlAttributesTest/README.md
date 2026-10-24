# ControlAttributesTest — which attributes each control accepts

Issue #737. Hovering a control on its own declaration lists its attributes and offers the ones it could still add (#736). Those lists have to come from the compiler, because the help's syntax lines are wrong in both directions: TEXT accepts IMM and CAP, which its syntax line leaves out, and rejects AUTO and MDI, which pass `applicableTo: CONTROL`.

`run.js` asks the compiler. For every control, in a WINDOW and in a REPORT, it builds one program holding one copy of the control per candidate attribute, each in its own WINDOW or REPORT, and reads the errors back by line:

```
node test-programs/ControlAttributesTest/run.js --clarion=<Clarion install root> [--controls=TEXT,LIST]
node test-programs/ControlAttributesTest/run.js --clarion=<Clarion install root> --headers-only   # reruns only the headers (#740)
node test-programs/ControlAttributesTest/run.js --clarion=<Clarion install root> --files-only     # reruns only the FILE declarations (#746)
node test-programs/ControlAttributesTest/apply.js            # writes the lists into server/src/data/clarion-controls.json
node test-programs/ControlAttributesTest/apply.js --check    # exit 1 when the data file does not match the results
```

- **Candidates:** the attribute pages of the Language Reference's *Window and Report Attributes* chapter, plus DROPID and NOTICKS from the control pages.
- **Forms:** each attribute is tried bare, then with sample arguments until one builds.
  - An attribute that builds bare is a flag (`HIDE`). One that only builds with a value is listed as `TIP()`.
  - AT, USE, FONT, DROPID and DRAGID build bare but do nothing without their value, so they are listed with one.
- **Rejected** means the compiler said `Unknown attribute`. The compiler checks the argument count *before* it checks whether the control takes the attribute, so `Wrong number of parameters` proves nothing either way. Only a build with the right arguments, or `Unknown attribute`, settles it.
- **Headers (#740):** the WINDOW, APPLICATION and REPORT header lines are probed the same way, with the structure-page names (PRE, ORIENT, COPIES, DRIVER, NAME, TO) added to the candidates. `apply.js` writes their lists onto the `containerStructures` entries; header diagnostics, the header card and attribute completion read them.
- **FILE declarations (#746):** a FILE header, and a KEY, INDEX, MEMO and BLOB inside a FILE, are probed with the FILE chapter's attributes plus the data attributes (STATIC, PRIVATE, AUTO, DIM, ...). Inside a FILE a rejection reads `Invalid FILE attribute`, `Invalid KEY/INDEX attribute` or `Invalid data declaration attribute` (MEMO, BLOB), naming the declaration and not the attribute. A batch of rules (`FILE_RULES`) builds the combinations the help describes: no DRIVER, ENCRYPT without OWNER, DLL without EXTERNAL, PRIMARY with DUP, and so on. `apply.js` writes `fileStructures`, keeping on each declaration only what its help page lists and every FILE run accepts, and writes a `requires` or `required` rule only when its failing case fails and its building case builds in every run.
- **Checks:** each batch starts with the control alone, which must build, and ends with `,NOSUCHATTR`, which must fail. That proves the compiler read the whole file.
- **Clashes:** pairs that look like alternatives (HSCROLL/HVSCROLL, LEFT/RIGHT/CENTER, INS/OVR, ...) are built together.
- **Speed:** a full run is about 60 builds a version, about five minutes.

Results: [Clarion 10](results-10.md) (10.0.12567), [Clarion 11.1](results-11.md) (11.1.13855, run by @geircodes) and [Clarion 12](results-12.md) (12.0.14204). `apply.js` keeps an attribute only when every results file accepts it, so the card never offers what an older compiler rejects. To add another version, run `run.js` against it and then `apply.js`. The server test `HoverProvider.ControlAttributeCard.test.ts` fails until the data file matches the results again. The FILE phase has been run on Clarion 10 and 12, which agree; 11.1 treats FILE declarations as they do, so it has no FILE run, and a results file without one does not vote on the FILE lists.

## What the compiler says

- **Clarion 10, 11.1 and 12 agree on everything except one case:** IMAGE accepts COLOR on 10 and rejects it on 11.1 and 12.
- **A REPORT is not a WINDOW.** A TEXT in a REPORT rejects 16 attributes that a WINDOW accepts: CURSOR, KEY, MSG, HLP, ALRT, DROPID, TIP, FLAT, FULL, the three scroll bars, READONLY, REQ, SCROLL and SINGLE. RESIZE and EXTEND are accepted only in a REPORT. LIST, COMBO, CHECK, OPTION, RADIO, GROUP, IMAGE and STRING also drop their focus and input attributes in a REPORT (ALRT, KEY, MSG, TIP, CURSOR, ...). All of them except COMBO, and BOX, LINE and ELLIPSE too, take EXTEND there. The other controls (BUTTON, ENTRY, SHEET, ...) build in a REPORT with exactly their WINDOW list. MENUBAR, MENU, ITEM and TOOLBAR are not valid in a REPORT at all.
- **A STRING with a picture is not a STRING with text.** In a REPORT, `STRING(@n9)` takes SUM, CNT, AVE, MIN, MAX, PAGE, PAGENO, RESET(break) and TALLY(detail). `STRING('Total')` rejects all of them with `Unknown attribute`. The data file keeps the picture form's list as `pictureAttributes`.
- **Headers agree on Clarion 10, 11.1 and 12.**
  - A WINDOW header takes TIP and TRN as well as the #730 list. STATUS builds bare, so it is a flag.
  - An APPLICATION header takes the WINDOW list without MDI, MODAL, TOOLBOX, DOCK, DOCKED, DROPID, GRAY and TRN.
  - A REPORT header takes AT, COLOR, FONT, LANDSCAPE, LAYOUT, MM, PAPER, POINTS, PREVIEW, THOUS and PRE. ORIENT, COPIES, DRIVER and NAME, which the data file used to list, are `Unknown attribute`. TO is a reserved word (`Expected: <ID>`).
- **A bare RTF is `Wrong number of parameters`:** it takes a save target, `RTF(TEXT:Field)`.
- **No pair clashes.** The compiler builds HSCROLL with HVSCROLL, LEFT with RIGHT, DOUBLE with NOFRAME on a WINDOW, and even the same attribute twice. The help presents these as alternatives, but the compiler does not enforce it.
- **FILE declarations agree on Clarion 10 and 12.**
  - A FILE header takes DRIVER, NAME, PRE, CREATE, RECLAIM, OWNER, ENCRYPT, BINDABLE, THREAD, EXTERNAL, DLL and OEM. TYPE, which the help marks Clarion# only, is `Invalid FILE attribute`.
  - The compiler enforces three rules: `FILE must have DRIVER attribute`, `ENCRYPT attribute requires OWNER` and `DLL attribute requires EXTERNAL attribute`. EXTERNAL builds alone, and EXTERNAL('x') and DLL(1) build with their optional values.
  - PRIMARY with DUP, PRIMARY with OPT and DUP with OPT all build, although the help defines PRIMARY as unique and holding every record.
  - A KEY and an INDEX both take NAME, DUP, NOCASE, OPT, PRIMARY and AUTO. The help lists DUP and PRIMARY for a KEY only and AUTO for neither, so `fileStructures` leaves those off. A KEY needs components (`KEY must have components`); `INDEX()` builds.
  - A MEMO and a BLOB take NAME and BINARY. A MEMO needs its size (`Wrong number of parameters`).
- **`#ORIG(...)`**, which the IDE's window-formatter defaults file (`DEFAULTS.CLW`) carries, is not source the compiler accepts: `Illegal character`.

## Traps

- Sources must be CRLF; with LF the compiler reads the whole file as one line.
- Run it with Node directly or from PowerShell, not through Git Bash, which rewrites `/t:build`.
- A control that only exists inside another is built inside it: RADIO in an OPTION, TAB in a SHEET, MENU in a MENUBAR, ITEM in a MENU.
