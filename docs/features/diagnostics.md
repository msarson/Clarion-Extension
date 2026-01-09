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

### Enable/Disable Diagnostics

**Turn all diagnostics off:**

```json
{
  "clarion.diagnostics.enabled": false
}
```

---

### Disable Specific Validations

**Structure validation:**
```json
{
  "clarion.diagnostics.validateStructures": false
}
```

**FILE validation:**
```json
{
  "clarion.diagnostics.validateFiles": false
}
```

**RETURN validation:**
```json
{
  "clarion.diagnostics.validateReturns": false
}
```

---

### Adjust Severity Levels

**Make warnings errors:**
```json
{
  "clarion.diagnostics.missingReturn": "error"  // Default: "warning"
}
```

**Suppress warnings:**
```json
{
  "clarion.diagnostics.missingReturn": "information"
}
```

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

**If diagnostics slow down editor:**

1. Disable validations you don't need
2. Larger files take longer to validate
3. Consider disabling for very large files (10K+ lines)

```json
{
  "clarion.diagnostics.validateOnChange": false  // Validate on save only
}
```

---

## Related Features

- **[Code Editing](code-editing.md)** - Tools to fix issues quickly
- **[Common Tasks](../guides/common-tasks.md)** - Handling errors
- **[Settings Reference](../reference/settings.md)** - All diagnostic settings

