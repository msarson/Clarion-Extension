# Clarion Syntax Test Specification

This document validates each test procedure in TEST_CLARION_SYNTAX.clw against the Clarion Language Reference knowledge base.

## Test Validation Criteria

Based on `docs/CLARION_LANGUAGE_REFERENCE.md`, the following rules apply:

### Column Rules
- **Labels MUST be at column 0**: Variables, Procedures, Data structures
- **Keywords that MUST NOT be at column 0**: `PROGRAM`, `MEMBER`, `MAP`, `END` (best practice to indent)

### Structure Terminators
- **Dot (.)** can replace `END` for any structure
- **Only IF requires END/dot** - ELSIF and ELSE do NOT require their own terminators
- **END can follow statements with space** - no semicolon needed

### Procedures
- **PROCEDURE does NOT have END** - implicitly terminated by next procedure or EOF
- **No DATA keyword in procedures** - everything before CODE is data definition
- **All data declarations before CODE**

### Semicolons
- **Required** for multiple statements on same line (space alone insufficient)
- **Exception**: END can follow with just space

## Test Procedure Validations

### ✅ TestProc1: Single-line IF with dot terminator
```clarion
TestProc1 PROCEDURE()
a LONG
b LONG
c LONG
d LONG
  CODE
  a = 1
  b = 1
  IF a=b THEN c=d.
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ All variables at column 0
- ✅ No DATA keyword (correct)
- ✅ All data declarations before CODE
- ✅ IF terminated with dot
- ✅ No END for procedure (correct)
- ✅ RETURN statement present

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

### ✅ TestProc2: IF-THEN-statement on same line with dot
```clarion
TestProc2 PROCEDURE()
x LONG
result LONG
  CODE
  x = 15
  IF x > 10 THEN result = 1.
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ All variables at column 0
- ✅ No DATA keyword (correct)
- ✅ IF with THEN and statement on same line
- ✅ Dot terminates the IF structure
- ✅ No END for procedure (correct)

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

### ✅ TestProc3: IF with statement on next line and dot terminator
```clarion
TestProc3 PROCEDURE()
a LONG
b LONG
c LONG
d LONG
  CODE
  a = 5
  b = 5
  IF a=b THEN
    c=d.
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ All variables at column 0
- ✅ IF statement with statement on next line
- ✅ Dot terminates the statement inside IF
- ❓ **QUESTION**: Does the dot after `c=d.` terminate just the statement or the entire IF?

**Expected Result:** ⚠️ NEEDS CLARIFICATION - Is this valid? Does IF need explicit termination?

---

### ✅ TestProc4: IF with dot terminator on separate line
```clarion
TestProc4 PROCEDURE()
a LONG
b LONG
c LONG
d LONG
  CODE
  a = 10
  b = 10
  IF a=b THEN
    c=d
  .
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ All variables at column 0
- ✅ IF statement with statement on next line
- ✅ Dot on separate line terminates the IF structure
- ✅ No END for procedure (correct)

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

### ✅ TestProc5: IF-ELSIF-ELSE with single dot terminator
```clarion
TestProc5 PROCEDURE()
x LONG
result LONG
  CODE
  x = 5
  IF x < 0 THEN
    result = -1
  ELSIF x = 0 THEN
    result = 0
  ELSE
    result = 1
  .
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ All variables at column 0
- ✅ IF/ELSIF/ELSE structure
- ✅ Only ONE dot terminator for entire structure (correct per KB: "Only IF requires END/. - ELSIF and ELSE do NOT")
- ✅ No END for procedure (correct)

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

### ✅ TestProc6: LOOP with dot terminator
```clarion
TestProc6 PROCEDURE()
i LONG
  CODE
  i = 0
  LOOP
    i += 1
    IF i > 5 THEN BREAK.
  .
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ Variable at column 0
- ✅ LOOP structure
- ✅ IF statement with dot terminator inside loop
- ✅ Dot terminates the LOOP structure
- ✅ No END for procedure (correct)

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

### ✅ TestProc7: LOOP with END keyword
```clarion
TestProc7 PROCEDURE()
i LONG
  CODE
  i = 0
  LOOP
    i += 1
    IF i > 5 THEN BREAK
  END
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ Variable at column 0
- ✅ LOOP structure
- ✅ END terminates the LOOP structure (indented - correct)
- ✅ No END for procedure (correct)

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

### ✅ TestProc8: Nested IF with mixed dot and END
```clarion
TestProc8 PROCEDURE()
x LONG
y LONG
result LONG
  CODE
  x = 10
  y = 20
  IF x > 0 THEN
    IF y > 0 THEN result = 1.
  .
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ All variables at column 0
- ✅ Outer IF with dot terminator
- ✅ Inner IF with dot terminator
- ✅ Demonstrates mixing terminators

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

### ✅ TestProc9: CASE with dot terminator
```clarion
TestProc9 PROCEDURE()
choice LONG
result LONG
  CODE
  choice = 2
  CASE choice
  OF 1
    result = 10
  OF 2
    result = 20
  OF 3
    result = 30
  ELSE
    result = 0
  .
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ All variables at column 0
- ✅ CASE structure with multiple OF clauses
- ✅ Dot terminates entire CASE structure
- ✅ No END for procedure (correct)

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

### ✅ TestProc10: CASE with END keyword
```clarion
TestProc10 PROCEDURE()
choice LONG
result LONG
  CODE
  choice = 1
  CASE choice
  OF 1
    result = 10
  OF 2
    result = 20
  ELSE
    result = 0
  END
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ All variables at column 0
- ✅ CASE structure with END keyword
- ✅ END is indented (correct)
- ✅ No END for procedure (correct)

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

### ✅ TestProc11: GROUP with dot terminator on same line
```clarion
TestProc11 PROCEDURE()
MyGroup GROUP.
  CODE
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ GROUP label at column 0
- ✅ Dot immediately after GROUP declaration
- ✅ No END for procedure (correct)

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

### ✅ TestProc12: GROUP with fields and dot terminator
```clarion
TestProc12 PROCEDURE()
MyGroup GROUP
Field1 LONG
Field2 STRING(20)
.
  CODE
  MyGroup.Field1 = 100
  MyGroup.Field2 = 'Test'
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ GROUP label at column 0
- ✅ Field declarations at column 0
- ✅ Dot on separate line terminates GROUP
- ✅ No END for procedure (correct)

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

### ✅ TestProc13: GROUP with END keyword
```clarion
TestProc13 PROCEDURE()
MyGroup GROUP
Field1 LONG
Field2 STRING(20)
END
  CODE
  MyGroup.Field1 = 100
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ GROUP label at column 0
- ✅ Field declarations at column 0
- ✅ END terminates GROUP (should be indented per KB)
- ❌ **END is at column 0** - KB says END must NOT be at column 0

**Expected Result:** ❌ FAIL - END should be indented, not at column 0

---

### ✅ TestProc14: IF with END on same line (space separator)
```clarion
TestProc14 PROCEDURE()
a LONG
b LONG
  CODE
  a = 5
  b = 5
  IF a = b THEN MESSAGE('Equal') END
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ All variables at column 0
- ✅ IF with THEN and statement on same line
- ✅ END follows with space (no semicolon) - KB says this is allowed
- ✅ No END for procedure (correct)

**Expected Result:** ✅ PASS - Valid Clarion syntax (per KB: "END can follow statement with just a space separator")

---

### ✅ TestProc15: Multiple IFs with dots
```clarion
TestProc15 PROCEDURE()
x LONG
y LONG
  CODE
  x = 10
  y = 20
  IF x > 0 THEN y += 1.
  IF y > 0 THEN x += 1.
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ All variables at column 0
- ✅ Two separate IF statements
- ✅ Each IF terminated with dot
- ✅ No END for procedure (correct)

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

### ✅ TestProc16: Two statements on one line with semicolon
```clarion
TestProc16 PROCEDURE()
x LONG
y LONG
  CODE
  x = 1; y = 2
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ All variables at column 0
- ✅ Two statements on one line separated by semicolon (required per KB)
- ✅ No END for procedure (correct)

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

### ✅ TestProc17: Three statements on one line with semicolons
```clarion
TestProc17 PROCEDURE()
a LONG
b LONG
c LONG
  CODE
  a = 1; b = 2; c = 3
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ All variables at column 0
- ✅ Three statements on one line with semicolons (required per KB)
- ✅ No END for procedure (correct)

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

### ✅ TestProc18: Statements without semicolon on separate lines
```clarion
TestProc18 PROCEDURE()
x LONG
y LONG
z LONG
  CODE
  x = 1
  y = 2
  z = 3
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ All variables at column 0
- ✅ Statements on separate lines (no semicolon needed per KB)
- ✅ No END for procedure (correct)

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

### ✅ TestProc19: IF-THEN with multiple statements and semicolon
```clarion
TestProc19 PROCEDURE()
a LONG
b LONG
x LONG
y LONG
  CODE
  a = 1
  b = 1
  IF a = b THEN x = 1; y = 2.
  RETURN
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ All variables at column 0
- ✅ IF with THEN
- ✅ Two statements after THEN separated by semicolon (required per KB)
- ✅ Dot terminates the entire IF structure
- ✅ No END for procedure (correct)

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

### ✅ TestProc20: ROUTINE with and without DATA section
```clarion
TestProc20 PROCEDURE()
ProcVar LONG
  CODE
  ProcVar = 10
  DO MyRoutine
  DO SimpleRoutine
  RETURN
  
MyRoutine ROUTINE
DATA
RoutineVar LONG
CODE
  RoutineVar = 5
  ProcVar += RoutineVar
  
SimpleRoutine ROUTINE
  MESSAGE('Simple routine executed')
  ProcVar += 1
```

**Validation:**
- ✅ Procedure name at column 0
- ✅ Variable at column 0
- ✅ MyRoutine ROUTINE at column 0
- ✅ MyRoutine has DATA section (DATA at column 0 - correct)
- ✅ RoutineVar at column 0
- ✅ MyRoutine has CODE section (CODE at column 0 - correct)
- ✅ SimpleRoutine ROUTINE at column 0
- ✅ SimpleRoutine has no DATA section (correct - no CODE needed per KB)
- ✅ Both routines have implicit EXIT (no explicit EXIT needed per KB)
- ✅ No END for procedure (correct)

**Expected Result:** ✅ PASS - Valid Clarion syntax

---

## Summary

| Test | Description | Expected Result | Issues |
|------|-------------|----------------|--------|
| TestProc1 | Single-line IF with dot | ✅ PASS | None |
| TestProc2 | IF-THEN on same line with dot | ✅ PASS | None |
| TestProc3 | IF with statement on next line | ⚠️ NEEDS CLARIFICATION | Is dot sufficient? |
| TestProc4 | IF with dot on separate line | ✅ PASS | None |
| TestProc5 | IF-ELSIF-ELSE with single dot | ✅ PASS | None |
| TestProc6 | LOOP with dot | ✅ PASS | None |
| TestProc7 | LOOP with END | ✅ PASS | None |
| TestProc8 | Nested IF with mixed | ✅ PASS | None |
| TestProc9 | CASE with dot | ✅ PASS | None |
| TestProc10 | CASE with END | ✅ PASS | None |
| TestProc11 | GROUP with inline dot | ✅ PASS | None |
| TestProc12 | GROUP with fields and dot | ✅ PASS | None |
| TestProc13 | GROUP with END | ❌ FAIL | END at column 0 |
| TestProc14 | IF with END same line | ✅ PASS | None |
| TestProc15 | Multiple IFs with dots | ✅ PASS | None |
| TestProc16 | Two statements with semicolon | ✅ PASS | None |
| TestProc17 | Three statements with semicolons | ✅ PASS | None |
| TestProc18 | Statements on separate lines | ✅ PASS | None |
| TestProc19 | IF-THEN multiple statements | ✅ PASS | None |
| TestProc20 | ROUTINE with/without DATA | ✅ PASS | None |

## Issues Found

### 1. TestProc13: END at column 0
**Problem:** `END` keyword is at column 0, but KB states "Keywords that MUST NOT be at column 0: MAP, END"

**Fix Required:**
```clarion
TestProc13 PROCEDURE()
MyGroup GROUP
Field1 LONG
Field2 STRING(20)
  END  ! Should be indented
  CODE
  MyGroup.Field1 = 100
  RETURN
```

### 2. TestProc3: Ambiguous dot placement
**Question:** When `IF a=b THEN c=d.` is on separate lines, does the dot after the statement terminate just the statement or the entire IF structure?

Need clarification from Clarion documentation or testing.
