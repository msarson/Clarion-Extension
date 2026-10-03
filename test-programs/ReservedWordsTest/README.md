# ReservedWordsTest — which keywords can be labels, and where

Issue #701. The Language Reference's *Reserved Words* page has two tables: words that "may not be used as labels for any purpose", and words that "may not be the label of any PROCEDURE statement". This project asks the compiler instead.

`run.js` builds one small program per word and place, with MSBuild and the Clarion targets, and writes the results table:

```
node test-programs/ReservedWordsTest/run.js --clarion=<Clarion install root> [--words=IF,CODE]
```

It tries every word of both tables in 13 places: global data, procedure-local data, a GROUP field, a CLASS property, a CLASS method, a global PROCEDURE (MAP prototype and implementation), a ROUTINE, a procedure parameter (alone, first of two, last of two), an executable statement's label, a method parameter and a method-local. `Foo` is the control and must build everywhere; two cases that must fail (a statement in column 1, an indented label) check that the harness notices a failure at all. A full run is 990 builds, about seven minutes.

Results: [Clarion 10](results-10.md) (10.0.12567) and [Clarion 12](results-12.md) (12.0.14204) — identical.

## What the compiler says

- **44 words cannot be a label anywhere:** ACCEPT AND ASSERT BEGIN BREAK BY CASE CATCH CHOOSE COMPILE CONST CYCLE DO ELSE ELSIF END EXECUTE EXIT FINALLY FUNCTION GOTO IF INCLUDE LOOP MEMBER NEW NOT OF OMIT OR OROF PRAGMA PROCEDURE PROGRAM RETURN ROUTINE SECTION THEN TIMES TO TRY UNTIL WHILE XOR. That includes a GROUP field and a CLASS method or property.
- **As a parameter name, each of those 44 builds alone or as the last parameter, and fails when another parameter follows it** (`(LONG If)` and `(LONG X, LONG If)` build, `(LONG If, LONG X)` does not: `Expected: <ID> )`). Every other word builds in any position.
- **CODE, DATA, NULL and THROW are not reserved**, though the help's first table lists them. **CATCH, FINALLY and TRY are**, in Win32 Clarion too.
- **The second table is not enforced.** All 27 words (WINDOW, CLASS, QUEUE, SELF, PARENT, ...) build in every place, a global PROCEDURE's label included. (The harness declares the global PROCEDURE and does not call it.)
- **SELF, PARENT and NULL are system intrinsics.** Naming a method's parameter or local `Self` or `Parent`, or a PROCEDURE or method `Null`, builds with the warning `Redefining system intrinsic` (`W` in the tables). The new name then hides the intrinsic: a `Self` local makes `SELF.Draw(1)` in that method fail with `Field not found: DRAW` / `Unknown procedure label`; other methods keep the real SELF. (A `Null` procedure did not stop `Ref &= NULL` compiling; that was checked at compile time only.) So the help's SELF/PARENT note is right in effect, if not in the letter.
- A clean exit is not a clean build: the tables mark warnings apart from passes (`W`), and list every one.
- **A reserved word that starts a statement may stand in column 1.** `OF 1`, `IF X = 1`, `END`, `LOOP`, `ELSE`, `RETURN` and `CODE` all build there; a statement that starts with an ordinary name (`X = 1`) does not. So a reserved word is only an error as a *label*: when a declaration follows it.

The extension's check (`server/src/providers/diagnostics/LabelDiagnostics.ts`) follows these results.

## Traps

- One build at a time (the default). Parallel builds collide in the linker and report runtime symbols (`AddCommand in ClaRUN.dll`, `ActivateActCtx in KERNEL32.dll`) as duplicates, failing cases at random.
- Sources must be CRLF; with LF the compiler reads the whole file as one line.
- Run it with Node directly or from PowerShell, not through Git Bash, which rewrites `/t:build`.
