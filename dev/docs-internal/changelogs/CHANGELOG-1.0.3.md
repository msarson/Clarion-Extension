# Changelog — 1.0.3

Archived from the main CHANGELOG when 1.0.6 was released. The three newest versions stay in full there.

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
