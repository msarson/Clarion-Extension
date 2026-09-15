# LinkedClassTest — a class compiled through LINK(), not the .cwproj

Hand-coded fixture for issue #522 (split from #470). It reproduces the hand-coded
layout where a class implementation file is never a `<Compile>` item: the CLASS
declaration in the `.inc` carries `MODULE('ctLinked.clw'),LINK('ctLinked.clw')`, and
the compiler compiles and links the `.clw` from that attribute alone.

Verified against **Clarion 12.0.14204** (`C:\Clarion\Clarion12-12.0.14204`), built
with MSBuild: `ctLinked.obj` is produced and `LinkedClassTest.exe` links with
`main.clw` as the only Compile item. The `MEMBER()` statement living inside
`member.inc`, pulled in as the class file's first line, is accepted too; both mirror
the reporter's code.

## Files

| File | Role |
|---|---|
| `LinkedClassTest.sln` / `.cwproj` | One project; `main.clw` is the only Compile item. |
| `main.clw` | PROGRAM. Includes `ctLinked.inc`, instantiates the class. |
| `ctLinked.inc` | `ctLinked CLASS,TYPE,MODULE('ctLinked.clw'),LINK('ctLinked.clw')`. |
| `ctLinked.clw` | The implementation. First line `INCLUDE('member.inc')`, then the `.inc`. |
| `member.inc` | Holds the `MEMBER()` statement. |

## What it pins

Before #522 the file graph seeded only the `.cwproj` items and never walked into
their targets, so `ctLinked.clw` had no node: no document links, and hover on any
include in it reported "not found via project paths or redirection". With the
referenced-file closure walk the class file is reached through the CLASS MODULE edge
and both of its includes link.

Drive it through the real server with the perf driver's links mode:

```
node scripts/perf/lsp-driver.js --sln=<abs>\LinkedClassTest.sln --file=<abs>\ctLinked.clw --links
```

Expected: `document links for ctLinked.clw: 2` (member.inc, ctLinked.inc). The unit
test `server/src/test/FileRelationshipGraph.Closure522.test.ts` covers the same shape
with a deeper include chain and the edit-time expansion.

## Compile recipe

Copy the folder to a scratch directory and, from PowerShell (not Git Bash, which
rewrites `/t:build`):

```
C:\Windows\Microsoft.NET\Framework\v4.0.30319\MSBuild.exe LinkedClassTest.cwproj /t:build /p:ClarionBinPath="C:\Clarion\Clarion12-12.0.14204\bin"
```
