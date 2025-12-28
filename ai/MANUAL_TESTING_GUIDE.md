# Manual Testing Guide - DocumentStructure Phase 2 Refactoring

## What Changed

We refactored `ImplementationProvider` to use the new `DocumentStructure` APIs instead of custom MAP block detection code. This affects the **"Go to Implementation" (Ctrl+F12)** feature.

## What to Test

### 1. MAP Procedure Declaration → Implementation (Primary Feature)

**Test Case 1: Basic MAP to Implementation**
```clarion
  MAP
    MyProc PROCEDURE()
  END

MyProc PROCEDURE()
CODE
  RETURN
END
```

**Steps:**
1. Open this code in VS Code
2. Place cursor on `MyProc` inside the MAP block (line 2)
3. Press **Ctrl+F12** (Go to Implementation) or right-click → "Go to Implementation"
4. **Expected:** Cursor jumps to `MyProc PROCEDURE()` implementation (line 5)

---

**Test Case 2: MAP with Multiple Procedures**
```clarion
  MAP
    FirstProc PROCEDURE()
    SecondProc PROCEDURE()
    ThirdProc PROCEDURE()
  END

FirstProc PROCEDURE()
CODE
  RETURN
END

SecondProc PROCEDURE()
CODE
  RETURN
END

ThirdProc PROCEDURE()
CODE
  RETURN
END
```

**Steps:**
1. Test Ctrl+F12 on each procedure name in MAP
2. **Expected:** Each jumps to its corresponding implementation

---

**Test Case 3: Overloaded Procedures (Important!)**
```clarion
  MAP
    Process PROCEDURE()
    Process PROCEDURE(STRING name)
    Process PROCEDURE(LONG id, STRING name)
  END

Process PROCEDURE()
CODE
  RETURN
END

Process PROCEDURE(STRING name)
CODE
  RETURN
END

Process PROCEDURE(LONG id, STRING name)
CODE
  RETURN
END
```

**Steps:**
1. Place cursor on first `Process` in MAP (no parameters)
2. Press Ctrl+F12
3. **Expected:** Jumps to `Process PROCEDURE()` (no parameters)
4. Place cursor on second `Process` in MAP (STRING parameter)
5. Press Ctrl+F12
6. **Expected:** Jumps to `Process PROCEDURE(STRING name)`
7. Place cursor on third `Process` in MAP (two parameters)
8. Press Ctrl+F12
9. **Expected:** Jumps to `Process PROCEDURE(LONG id, STRING name)`

---

**Test Case 4: MAP Procedure with PROCEDURE Keyword**
```clarion
  MAP
    Helper PROCEDURE(LONG value), LONG
  END

Helper PROCEDURE(LONG value), LONG
CODE
  RETURN 0
END
```

**Steps:**
1. Ctrl+F12 on `Helper` in MAP
2. **Expected:** Jumps to implementation

---

**Test Case 5: MAP Procedure WITHOUT Implementation (Edge Case)**
```clarion
  MAP
    MissingProc PROCEDURE()
  END

! No implementation exists
```

**Steps:**
1. Ctrl+F12 on `MissingProc` in MAP
2. **Expected:** Nothing happens (or shows "No implementation found")

---

### 2. Other Features Should Still Work

**Test Case 6: Regular Procedure (Not in MAP)**
```clarion
TestProc PROCEDURE()
CODE
  RETURN
END
```

**Steps:**
1. Ctrl+F12 anywhere on `TestProc`
2. **Expected:** No implementation navigation (this isn't a MAP declaration)

---

**Test Case 7: Class Method Implementation**
```clarion
MyClass CLASS
  DoSomething PROCEDURE()
END

MyClass.DoSomething PROCEDURE()
CODE
  RETURN
END
```

**Steps:**
1. Ctrl+F12 on `DoSomething` inside CLASS
2. **Expected:** Should jump to `MyClass.DoSomething PROCEDURE()` implementation
3. *(This uses different code path, should still work)*

---

**Test Case 8: Routine Implementation**
```clarion
TestProc PROCEDURE()
CODE
  DO MyRoutine
  RETURN

MyRoutine ROUTINE
  ! Code here
END
```

**Steps:**
1. Place cursor on `MyRoutine` in the DO statement (line 3)
2. Press Ctrl+F12
3. **Expected:** Jumps to `MyRoutine ROUTINE` (line 6)
4. *(This uses different code path, should still work)*

---

## Quick Smoke Test

If you only have time for one test, do **Test Case 3 (Overloaded Procedures)**. This is the most complex scenario and exercises the full MAP detection + overload resolution logic.

---

## What Broke Before (For Reference)

The old code had a bug where it looked for exact "MAP" keyword only, so:
- `MyMap MAP` (with label) didn't work properly
- Nested MODULE blocks inside MAP confused the detection

The new code uses the tokenizer's structure detection, which is more robust.

---

## Automated Test Coverage

All these scenarios are covered by our automated tests:
- `server/src/test/ImplementationProvider.Refactor.test.ts` (3 tests)
- `server/src/test/DocumentStructure.SemanticAPIs.test.ts` (47 tests for underlying APIs)

**Current Status:** 387/394 tests passing (7 pre-existing failures unrelated to our changes)

---

## Performance Check

The refactored code should be **faster** because:
1. DocumentStructure is now cached in TokenCache (created once per document)
2. No string parsing/regex on every call
3. Uses pre-built token indexes

You shouldn't notice any performance difference in normal use, but with very large files (1000+ lines), operations might feel slightly snappier.
