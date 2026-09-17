# Diagnostics & Validation

[← Back to Documentation Home](../../README.md)

Real-time error detection and code validation as you type.

## Overview

The Clarion Extension provides real-time diagnostics:

- **Immediate feedback** - Errors highlighted as you type
- **Squiggly underlines** - Visual indicators in code
- **Problems panel** - List of all issues
- **Hover for details** - Error descriptions on hover
- **Quick fixes** - Suggested solutions (where applicable)

---

## Supported Diagnostics

### Structure Validation

#### Unterminated Structures

**Detects missing END statements:**

```clarion
IF x = 1 THEN
  DoSomething()
  ! ❌ Error: Missing END
```

**Structures checked:**
- `IF/THEN` → requires `END`
- `LOOP` → requires `END`
- `CASE/OF` → requires `END`
- `EXECUTE` → requires `END`
- `BEGIN` → requires `END`
- `CLASS` → requires `END`
- `GROUP` → requires `END`
- `MAP` → requires `END`
- `MODULE` → requires `END`

**Error message:**
```
Unterminated IF structure
Expected END statement
```

---

#### Mismatched Terminators

**Detects wrong termination keywords:**

```clarion
IF x = 1 THEN
  DoSomething()
UNTIL   ! ❌ Error: Expected END, got UNTIL
```

---

### RETURN Statement Validation

#### Missing RETURN in PROCEDURE

**Detects procedures without RETURN:**

```clarion
MyProc PROCEDURE
CODE
  x = 10
  ! ❌ Warning: Missing RETURN statement
```

**Note:** Not required for ROUTINE blocks.

---

#### Multiple RETURN Paths

**Validates all code paths have RETURN:**

```clarion
MyProc PROCEDURE
CODE
  IF condition
    RETURN  ! ✅ OK
  ELSE
    x = 10
    ! ❌ Warning: Missing RETURN in ELSE branch
  END
```

---

### FILE Validation

#### Missing DRIVER Attribute

**FILE declarations must have DRIVER:**

```clarion
MyFile FILE
Record   RECORD
         END
       END    ! ❌ Error: FILE missing DRIVER attribute
```

**Should be:**
```clarion
MyFile FILE,DRIVER('TOPSPEED'),CREATE
Record   RECORD
         END
       END    ! ✅ OK
```

---

#### Missing RECORD Structure

**FILE declarations must have RECORD:**

```clarion
MyFile FILE,DRIVER('TOPSPEED')
       END    ! ❌ Error: FILE missing RECORD definition
```

**Should be:**
```clarion
MyFile FILE,DRIVER('TOPSPEED')
Record   RECORD
Field      LONG
         END
       END    ! ✅ OK
```

---

### CASE/EXECUTE Validation

#### Invalid CASE Clauses

**Only OF/OROF allowed in CASE:**

```clarion
CASE x
  OF 1
    DoSomething()
  ELSE         ! ❌ Error: ELSE not allowed in CASE (use OROF)
    DoOther()
END
```

**Should be:**
```clarion
CASE x
  OF 1
    DoSomething()
  OROF 2 TO 10  ! ✅ OK
    DoOther()
END
```

---

#### Invalid EXECUTE Clauses

**Only BEGIN allowed in EXECUTE:**

```clarion
EXECUTE choice
  OF 1
    DoSomething()  ! ❌ Error: Use BEGIN instead of OF in EXECUTE
END
```

**Should be:**
```clarion
EXECUTE choice
  BEGIN
    DoSomething()  ! ✅ OK
  END
END
```

---

### OMIT/COMPILE Block Validation

#### Unterminated OMIT Block

**Detects missing OMIT terminator:**

```clarion
OMIT('DEBUG')
  DebugCode()
  ! ❌ Error: Missing OMIT terminator
```

**Should be:**
```clarion
OMIT('DEBUG')
  DebugCode()
!   ! ✅ OK
```

---

#### Unterminated COMPILE Block

**Detects missing COMPILE terminator:**

```clarion
COMPILE('DEBUG')
  DebugCode()
  ! ❌ Error: Missing COMPILE terminator
```

#### Compiled-Out Code Is Skipped

Code inside an **unconditional `OMIT`** block isn't part of the active build, so diagnostics are not raised inside it and it doesn't count toward reference-count lenses — matching how C++ IDEs treat `#if 0` regions. Structural checks (like the unterminated-block errors above) still apply. **Rename deliberately still rewrites omitted code** — Clarion projects build multiple configurations from one source, and skipping inactive regions would silently break the others. Conditional `OMIT`/`COMPILE` (with a define argument) is conservatively treated as live.

---

### Reserved Keyword Usage

**Detects user-defined labels that clash with Clarion reserved keywords:**

```clarion
LOOP LONG  ! ❌ Error: 'LOOP' is a reserved keyword and cannot be used as a label
```

---

### Discarded Return Values

**Warns when a procedure or method with a return type is called as a statement and the result is discarded:**

```clarion
MAP
  GetCount(), LONG
END

CODE
  GetCount()        ! ⚠️ Warning: Return value of GetCount() is discarded
  x = GetCount()    ! ✅ OK
  obj.Calc()        ! ⚠️ Warning — method calls on typed variables are checked too
  SELF.Calc()       ! ⚠️ Warning — SELF./PARENT. call sites are checked (v1.0)
```

**What stays quiet:**
- Prototypes carrying the `,PROC` attribute (the language's own "callable as a statement" marker) — ABC's generated calls (`SELF.Init()`, `SELF.Run()`, …) are declared with `PROC` and never warn
- Calls whose receiver type can't be resolved (conservative — no guessing)

---

### Literal Passed By Reference

**Flags a literal passed to a parameter that requires an addressable variable:**

```clarion
MAP
  UpdateIt(*LONG counter)
END

CODE
  UpdateIt(5)     ! ⚠️ Warning: a literal has no address and can't bind to *LONG
  UpdateIt(myVar) ! ✅ OK
```

Applies to `*TYPE` reference parameters and complex types (`QUEUE`/`GROUP`/`FILE`/`VIEW`/`RECORD`/`CLASS` — by-reference even without the `*`). Conservative: only fires when the call resolves to a single unambiguous same-file MAP signature.

---

### Undeclared Variables

**Flags names used in executable code that resolve to no declaration** through the full Clarion scope model — routine-local, parameters, procedure locals, module data, the MEMBER parent's PROGRAM globals, and INCLUDE-chain/libsrc EQUATEs.

- Cross-file aware: a global declared in the app's PROGRAM file or an EQUATE from `KEYCODES.CLW` never fires
- Suppressed entirely until a solution is loaded (accuracy depends on the solution's indexes)
- Opt-out: `clarion.diagnostics.undeclaredVariables.enabled`

---

### Unresolved Procedure Calls (opt-in)

**Flags a call to a procedure whose name is declared nowhere the extension can see** — not in this file's MAP or its MAP includes, not in the MEMBER parent's MAP or the MODULE blocks those MAPs pull in (the same places F12 looks), and not in the solution's declaration index. It catches typos and calls to procedures that no longer exist.

**Off by default** — turn it on with:

```json
{
  "clarion.diagnostics.unresolvedProcedureCalls.enabled": true
}
```

Conservative on purpose:
- A procedure that exists in the solution but isn't reachable from the call is not flagged
- Method calls (`obj.Method`) are out of scope
- Nothing is reported while the index is still building, or when a MEMBER's parent file can't be found
- Needs a loaded solution

---

### Indistinguishable Prototypes

**Flags MAP overloads that a call could never disambiguate** (same name and effectively identical parameter shapes). Opt-out: `clarion.diagnostics.indistinguishablePrototypes.enabled`.

---

### Character-Set Validation

**Flags characters that can't be represented in any Windows ANSI code page (1250–1258)** — pasted emoji, box-drawing characters, other-script contamination.

National letters for every locale (`č`, `ć`, `š`, `ž`, `đ`, Cyrillic, Greek, Turkish, …) pass clean — the check is *"representable in some ANSI code page"*, not *"is Windows-1252"*. The **Fix all** quick fix uses the same test, so it never deletes valid characters.

Comments are left alone, and a line reports once rather than once per character — an ASCII-art banner in comments is not a problem for the compiler, which takes those bytes as they are.

---

### BREAK/CYCLE Outside Loop

**Detects control flow statements used in invalid context:**

```clarion
MyProc PROCEDURE
CODE
  BREAK    ! ❌ Error: BREAK must be inside a LOOP or ACCEPT block
  CYCLE    ! ❌ Error: CYCLE must be inside a LOOP or ACCEPT block
```

---

### Missing INCLUDE Diagnostic

**Detects variables whose class type is defined in an `.inc` file that isn't included:**

```clarion
st   StringTheory    ! ⚠️ Warning: 'StringTheory' is defined in 'StringTheory.inc' which is not included.
af   &FileManager    ! ⚠️ Warning: 'FileManager' is defined in 'ABFile.inc' which is not included.
```

**How it works:**
- Checks global-scope variable declarations (column 0) whose type is a known `CLASS` or `INTERFACE`
- Walks the full transitive include chain (any depth, cycle-safe) — a type included via `A.inc → B.inc` is correctly resolved
- Also checks the `MEMBER` parent file's includes if the current file has a `MEMBER('parent.clw')` statement
- Also checks the files that *include this one*: a class-typed declaration in a data include is not reported when every module that pulls the include in can already see the class

**Quick fix (`Ctrl+.`):**
- **Add INCLUDE to this file** — inserts `INCLUDE('type.inc'),ONCE` at module scope
- **Add INCLUDE to MEMBER parent** — inserts into the parent `.clw` file instead
- **Add INCLUDE + constants** — inserts the include *and* any missing `DefineConstants` entries in one step

---

### Missing DefineConstants Diagnostic

**Detects class types whose `.inc` is present but required `Link()`/`DLL()` constants are missing from the project:**

```clarion
st   StringTheory    ! ℹ️ Info: 'StringTheory' requires project constants that are not defined: ST_LinkMode, ST_DllMode
```

This fires as **Information** severity (blue squiggle) — the code compiles but will link or run incorrectly without the constants.

**Quick fix (`Ctrl+.`):**
- **Add Link constants** — QuickPick prompts: *Static link* (`LinkMode=>1, DllMode=>0`) or *DLL mode* (`LinkMode=>0, DllMode=>1`). Adds the chosen constants to `DefineConstants` in the `.cwproj`.

The diagnostic clears immediately once the constants are added (the extension watches the `.cwproj` file for changes).

---

## Viewing Diagnostics

### In-Editor Indicators

**Squiggly underlines:**
- **Red squiggles** - Errors
- **Yellow squiggles** - Warnings
- **Blue squiggles** - Information

**Hover for details:**
- Place mouse over squiggle
- Tooltip shows error message
- May include suggested fix

---

### Problems Panel

**View all issues:**
1. Press `Ctrl+Shift+M`
2. Or: **View → Problems**

**Shows:**
- File name and path
- Line and column number
- Error severity (Error/Warning/Info)
- Error message

**Click to navigate:**
- Click any problem in list
- Editor jumps to that line
- Squiggle highlighted

---

### Status Bar

**Bottom-left shows issue count:**
```
❌ 2  ⚠️ 3  ℹ️ 1
```

- **❌** - Errors
- **⚠️** - Warnings  
- **ℹ️** - Information

**Click count to open Problems panel**

---

## Error Severity Levels

### Errors (Red)

**Critical issues that prevent compilation:**
- Unterminated structures
- Missing required attributes (DRIVER, RECORD)
- Invalid syntax

**Must be fixed** before application can be built.

---

### Warnings (Yellow)

**Issues that may cause problems:**
- Missing RETURN statements
- Unreachable code
- Questionable patterns

**Should be reviewed** but won't prevent compilation.

---

### Information (Blue)

**Suggestions and hints:**
- Code style recommendations
- Optimization opportunities
- Best practice hints

**Optional** to fix.

---

## Configuration

Every check has its own pair of settings, and there is one master switch over all of them. Changes take effect as you make them — no reload, no reopening the solution.

### Turn everything off

```json
{
  "clarion.diagnostics.enabled": false
}
```

Nothing is reported while this is `false`, whatever the individual checks say.

---

### Turn one check off

```json
{
  "clarion.diagnostics.unterminatedStructures.enabled": false,
  "clarion.diagnostics.unicodeCharacters.enabled": false
}
```

---

### Report a check at a different severity

```json
{
  "clarion.diagnostics.undeclaredVariables.severity": "error",
  "clarion.diagnostics.discardedReturnValues.severity": "hint"
}
```

`default` keeps the check's own level; `error`, `warning`, `information` and `hint` override it. So a check you find useful but not blocking can be demoted, and one your team treats as a build rule promoted.

The full list of check ids, their defaults and what each one reports is in the **[Settings Reference](../reference/settings.md#diagnostics)**.

---

## Unreachable Code Detection

### What It Does

**Visually dims code that cannot be executed:**

```clarion
MyProc PROCEDURE
CODE
  IF condition
    RETURN
  END
  
  x = 10      ! ← Dimmed (unreachable after RETURN)
  RETURN
```

**Detected patterns:**
- Code after unconditional RETURN
- Code after unconditional EXIT
- Code after unconditional HALT

---

### How It Works

**Scope-aware detection:**
- Only dims code at top execution level
- ROUTINE blocks always considered reachable
- Respects Clarion semantics (STOP is not a terminator)

**Visual effect:**
- 40% opacity dimming
- Non-intrusive
- Zero false positives

---

### Configuration

**Disable unreachable code detection:**

```json
{
  "clarion.unreachableCode.enabled": false
}
```

---

## Best Practices

### Fix Errors First
1. Address red squiggles (errors) before warnings
2. Errors prevent compilation, warnings don't
3. Use Problems panel to see all errors at once

### Review Warnings
1. Warnings indicate potential issues
2. May cause runtime problems
3. Consider fixing before production

### Use Diagnostics as You Code
1. Don't wait until end to check errors
2. Fix issues as they appear
3. Faster than debugging later

---

## Troubleshooting

### False Positives

**If diagnostic is incorrect:**

1. Check code syntax is valid
2. Verify structure termination
3. Report issue on GitHub if bug confirmed

**Workaround:** Disable specific validation temporarily

---

### Missing Diagnostics

**If errors not detected:**

1. Check `clarion.diagnostics.enabled` is `true`
2. Verify file extension is `.clw`, `.inc`, or `.equ`
3. Reload window: `Ctrl+Shift+P` → "Developer: Reload Window"

---

### Performance Impact

Checking runs in the background and stops as soon as you type, so a result your edit has already invalidated is abandoned rather than finished. Typing is never blocked waiting for diagnostics.

**If you still want less work done:**

1. Turn off the checks you don't use (`clarion.diagnostics.<check>.enabled`)
2. Turn everything off with `clarion.diagnostics.enabled` while working in a very large generated module
3. `clarion.log.performance.enabled` writes a timeline if you want to report where the time goes

---

## Related Features

- **[Code Editing](code-editing.md)** - Tools to fix issues quickly
- **[Common Tasks](../guides/common-tasks.md)** - Handling errors
- **[Settings Reference](../reference/settings.md)** - All diagnostic settings

