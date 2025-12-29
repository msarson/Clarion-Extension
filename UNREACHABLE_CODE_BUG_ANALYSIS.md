# Unreachable Code Detection Issue - Root Cause Found

**Date**: 2025-12-29 21:28 UTC
**Status**: Root cause identified, fix needed

## Problem
User reports: Code after `IF...RETURN...ELSE...END` is incorrectly dimmed as unreachable

## Expected Behavior
```clarion
IF StateCalc:Kill_Called
   RETURN                 ! Conditional - only in IF branch
ELSE
   StateCalc:Kill_Called = True
END
IBSCOMMON:Kill()          ! Should NOT be dimmed - ELSE branch continues
```

## Root Cause
Test output reveals the tokenizer is **NOT creating IF structure tokens**:

```
PROCEDURE tokens:
  Line 4: 'Unreachable' (finishesAt: undefined)  <-- Wrong! Word from MESSAGE

IF structure tokens:
  (none)  <-- MISSING! No IF token found

RETURN tokens:
  Line 3: RETURN (type: 2)
```

**The IF structure is not being tokenized**, so:
1. No IF token is created
2. No `finishesAt` is set for the IF...END block
3. UnreachableCodeProvider can't find containing structure
4. RETURN is treated as top-level (not inside IF)
5. Code after RETURN is marked unreachable

## The Algorithm Works Correctly
The UnreachableCodeProvider logic is sound:
- Check if RETURN is inside a structure using `finishesAt`
- If `structure.line < returnLine && structure.finishesAt > returnLine` → inside
- Problem: No IF structure token exists to check!

## Real Issue Location
The bug is in the **tokenizer or DocumentStructure**:
- IF/LOOP/CASE structures should create tokens
- These tokens should have `finishesAt` set to the END line
- Currently not happening for IF structures

## Fix Required
Need to investigate why IF structures aren't being tokenized:
1. Check `server/src/ClarionTokenizer.ts` - is IF pattern matching?
2. Check `server/src/DocumentStructure.ts` - are IF tokens being processed?
3. Verify IF tokens get `finishesAt` set correctly

## Test Case
File: `server/src/test/UnreachableCodeProvider.test.ts`
Test: "DEBUG: Check tokenizer output for IF...ELSE...END structure"

Run: `npm test -- --grep "DEBUG: Check tokenizer"`

## Time
It's 21:28 UTC (late evening). This needs proper investigation of the tokenizer.
Recommend continuing tomorrow with fresh eyes.

## Next Steps
1. Debug why IF structures aren't creating tokens
2. Ensure IF/LOOP/CASE all create Structure tokens with finishesAt
3. Re-run unreachable code tests
4. All tests should pass once tokenizer is fixed
