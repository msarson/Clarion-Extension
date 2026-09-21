# PrefixedPrototypeTest — a hand-coded prefixed-prototype fixture

Hand-written, like `ViewJoinTest`, and for the same reason: to record what the **Clarion compiler
actually accepts** for colon-prefixed procedure prototypes, so resolution can be checked against the
language rather than against assumption.

Verified against **Clarion 10.0.12567**. It compiles and links
cleanly, producing `PrefixedPrototypeTest.exe`.

## Why it exists

The #599 corpus sweep measured 6,018 real `.clw`/`.inc` files and found that **not one declaration
in the entire corpus carries two or more colon segments**. Every prefixed name there is `PRE:Name`,
and all 632 of them sit at column 0 in the explicit-keyword form — the one shape that has always
worked. The shape @bill-atchison reported in #593 (`reg:WIN:ShowExits`, indented, keyword-less,
arriving through `INCLUDE(…,'PROTOTYPES')`) does not occur in anything we own.

That is why this class of bug keeps reaching us as a report instead of a test: we have no sample of
the shape. This fixture is the sample.

## What it pins

`protos.inc` has **no MAP of its own** — the includer supplies it — and declares seven prototypes
under `SECTION('PROTOTYPES')`, indented and keyword-less:

| shape | example |
|---|---|
| one colon, parameter list | `WIN:ShowExits()` |
| one colon, params + return | `WIN:Plain(LONG pX),LONG` |
| **two colons** | `reg:WIN:ShowExits()` |
| two colons, params + return | `reg:WIN:Plain(LONG pX),LONG` |
| bare, one colon | `WIN:BareOne` |
| bare, two colons | `reg:WIN:BareTwo` |
| bare + attribute tail | `reg:WIN:WithAttr,LONG` |

`prefixproto.clw` pulls them in with `INCLUDE('protos.inc','PROTOTYPES'),ONCE`, declares one
control case the explicit way inside a `MODULE` block (`reg:ITEM:CashOutExists PROCEDURE(),LONG` at
column 0 — the shape the corpus is full of), calls all eight, and implements them.

**All of it compiles.** So every one of these is a legal declaration the compiler resolves.

## The SECTION argument is enforced

Acceptance is not indifference. `protos.inc` also declares `reg:WIN:NotInSection()` under
`SECTION('OTHER')`. Adding a call to it fails:

```
prefixproto.clw(19,3): error : Unknown procedure label
```

So `INCLUDE(file,'PROTOTYPES')` really does admit only the named section, and a resolver that
classifies an included file's prototypes **must scope them to the requested section** — it cannot
simply take every prototype in the file. That is the rule #593's fix has to honour.

## What the extension makes of it

Before #593 was fixed, at `version-1.0.5` with #597 in:

| file | `MapProcedure` tokens |
|---|---|
| `protos.inc` | **0** of 7 |
| `prefixproto.clw` MAP | **1** — only `reg:ITEM:CashOutExists` |

One declaration of eight, in a program the compiler builds cleanly.

**After #593**, running the same merge path (`ScopeAnalyzer.getMapTokensWithIncludes`) the providers
use: **8 of 8**, with `reg:WIN:NotInSection` correctly absent — matching the compiler, which rejects
a call to it with `Unknown procedure label`.

## Building it

From **PowerShell or cmd**, not Git Bash — MSYS rewrites `/t:build` into a path and MSBuild answers
`MSB1008: Only one project can be specified`.

```
msbuild PrefixedPrototypeTest.cwproj /t:build /p:Configuration=Debug /p:Platform=Win32 ^
        /p:ClarionBinPath=<your Clarion>\bin /p:clarion_Sections=Debug
```

`C:\Windows\Microsoft.NET\Framework\v4.0.30319\MSBuild.exe` is sufficient; no Visual Studio needed.

**The sources must be CRLF.** Written with LF endings the compiler reads the whole file as line 1
and emits a wall of `Illegal character` errors plus a misleading `SECTION not found: PROTOTYPES` —
which looks like a language problem and is not one.
