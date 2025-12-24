# Method Nesting Bug - Session Continuation Prompt

**Date Created**: 2025-11-25  
**Session Date**: 2024-11-24 (ended ~20:53 UTC)  
**Duration**: ~4 hours  
**Status**: Partial completion - improvements made, main bug still present

---

## Session Summary

We worked on fixing issues with the Clarion Language Server Extension's symbol provider, specifically around method/procedure implementation handling. Made significant progress on several fronts but the main nesting bug remains.

## What Was Fixed ✅

### 1. Method Implementation Detection
**Problem**: Code was using dot-notation checks instead of tokenizer's `subType`  
**Solution**: Changed to use `token.subType === TokenType.MethodImplementation` consistently

**Files Changed**: `server/src/providers/ClarionDocumentSymbolProvider.ts` (lines ~900, 1024, 1040)

### 2. CODE Statement Handling
**Problem**: Variables were being processed after CODE statements (which is invalid in Clarion)  
**Solution**: Added `pastCodeStatement` flag that gets set when CODE token is encountered

**Key Logic**:
```typescript
// Line ~244
if (type === TokenType.ExecutionMarker && value.toUpperCase() === "CODE") {
    pastCodeStatement = true;
    if (currentProcedure && currentProcedure._isMethodImplementation) {
        currentProcedure = null;
    }
}

// Line ~493
if (!pastCodeStatement && (type === TokenType.Type || ...)) {
    // Process variable
}
```

**Files Changed**: `server/src/providers/ClarionDocumentSymbolProvider.ts`

### 3. DATA Statement Handling for Routines
**Problem**: Routines with DATA sections need variables processed between DATA and CODE  
**Solution**: Reset `pastCodeStatement = false` when DATA token encountered

### 4. Documentation
**Created**: `prompt/clarion-language-rules.md` - Comprehensive Clarion language structure rules

## Main Bug Still Present ❌

### The Problem: Method Overloads Nesting Instead of Being Siblings

**Current (Wrong) Behavior**:
```
Methods
  └─ SetValue (StringTheory newValue, long pOptions)  <- line 274
      ├─ x long,auto  <- correct child
      └─ SetValue (StringTheory newValue)  <- WRONG! Should be sibling
          └─ SetValue (string newValue)  <- WRONG! Nested even deeper
```

**Expected Behavior**:
```
Methods
  ├─ SetValue (StringTheory newValue, long pOptions)
  │   └─ x long,auto
  ├─ SetValue (StringTheory newValue)  <- Should be sibling
  └─ SetValue (string newValue)  <- Should be sibling
```

### Root Cause Analysis

1. Method implementations are added to `parentStack` so variables/structures inside them can be children
2. When next method is encountered:
   - Previous method is STILL on stack (hasn't reached its `finishesAt` line yet)
   - `currentStructure` points to previous method
   - New method gets added with previous method as parent → WRONG!

3. **Key Insight**: Methods WITH local variables make this obvious:
   - Method declared at line 274, has variable `x`
   - Method pushed to stack
   - Variable `x` added as child (correct)
   - Next method at line 286 is encountered
   - Previous method still on stack (finishesAt might be line 285)
   - Next method becomes child instead of sibling

### What We Tried (All Failed)

1. **Pop at CODE statement** - Failed: timing issues, skip optimization interference
2. **Force pop before processing new method** - Failed: stack already empty or wrong timing
3. **Set currentStructure = null** - Failed: handleProcedureOrClassToken still finds wrong parent
4. **Deferred method approach** - Failed: broke everything (variables had no parent)

### Log Evidence

From `h.log` (line 274 area):
```
Stack before pop: SetValue ( String pValue )
Stack after pop: (empty)
```

Key finding: **The parent stack is EMPTY**. This means `checkAndPopCompletedStructures` already popped the previous method, but `currentStructure` is still stale.

## Key Code Locations

### Main Processing Loop
**File**: `server/src/providers/ClarionDocumentSymbolProvider.ts`
- **Lines 202-540**: Main token processing loop
- **Lines 328-395**: Procedure/method implementation handling
- **Lines 347-377**: Method implementation specific logic (THE PROBLEM AREA)

### Method Creation
**File**: `server/src/providers/ClarionDocumentSymbolProvider.ts`
- **Lines 882-1120**: `handleProcedureOrClassToken()` method
- **Lines 1107-1109**: Where methods get added to container

### Hierarchy Management
**File**: `server/src/providers/utils/HierarchyManager.ts`
- **Lines 55-137**: `checkAndPopCompletedStructures()` - pops based on finishesAt

## Test Case

**File**: `ExampleCode/StringTheory.clw` (or any large class file)
**Lines**: 274-437 (SetValue method overloads in StringTheory class)

Pattern:
- Line 274: `SetValue (StringTheory newValue, long pOptions) PROCEDURE`
- Line 275: `x    LONG,AUTO` (local variable)
- Line 276: `CODE`
- Line 286: `SetValue (StringTheory newValue) PROCEDURE` (should be sibling, appears as child)

## Clarion Language Rules (For Context)

### Procedure/Method Structure
```clarion
MethodName PROCEDURE([params])
  localVar  LONG          ! Variables only here, before CODE
  CODE                    ! After this, NO MORE VARIABLES
  ! executable code
```

### Routine Structure
```clarion
RoutineName ROUTINE
  DATA                    ! Optional
    routineVar LONG       ! Variables between DATA and CODE
  CODE
  ! executable code
```

**Key Rules**:
- Variables ONLY between declaration and CODE
- Routines can have DATA section (variables between DATA and CODE)
- Routines are children of their containing procedure
- Method implementations are identified by dot notation (e.g., `ClassName.MethodName`)

## Next Steps / Ideas to Try

### Idea 1: Don't Use Parent Stack for Methods
Instead of pushing methods to parent stack:
- Keep `currentProcedure` reference for variables
- Don't push to `parentStack`
- Variables/structures check `currentProcedure` first, not `currentStructure`

**Challenge**: Structures/routines inside methods need method as parent

### Idea 2: Immediate Pop After Variable Processing
- When method is added to stack, track that it has variables
- After last variable is added, immediately pop from stack
- Don't wait for `finishesAt`

**Challenge**: How to detect "last variable"?

### Idea 3: Separate Stack for Methods
- Use a separate `methodStack` just for tracking current method for variable attachment
- Don't use `parentStack` for methods at all
- Methods never become parents in hierarchy

**Challenge**: Complexity, routines inside methods

### Idea 4: Fix handleProcedureOrClassToken Parent Logic
- In `handleProcedureOrClassToken`, check if `currentStructure` is a method
- If yes, don't use it as parent - find the Methods container instead
- Skip back through `parentStack` to find non-method container

**Challenge**: We tried this, had issues

## Important Notes

1. **Tokenizer is correct**: `token.subType` properly identifies `MethodImplementation` vs `GlobalProcedure`
2. **Methods container exists**: Methods are supposed to go into a "Methods" container child of the class
3. **Variables attach correctly**: Variables ARE being attached to the right method as children
4. **The issue is ONLY**: Subsequent methods become children instead of siblings

## Logging Added (Currently Active)

Lines ~331-337 in ClarionDocumentSymbolProvider.ts:
```typescript
logger.error(`📍 Processing method implementation at line ${line}`);
// Shows when methods are processed and stack state
```

**To see logs**: Check OUTPUT panel in VS Code, select "Clarion Language Server"

## Files Modified (Not Committed)

- `server/src/providers/ClarionDocumentSymbolProvider.ts` (main changes)
- `prompt/clarion-language-rules.md` (created)
- `prompt/README.md` (updated)
- `Logs/METHOD_NESTING_ISSUE.md` (created earlier in session)

## How to Continue

1. **Read this file** to get context
2. **Read** `prompt/clarion-language-rules.md` for Clarion structure rules
3. **Test with**: `ExampleCode/StringTheory.clw` line 274 area
4. **Check logs**: Look for 📍 emoji in Clarion Language Server output
5. **Key insight**: When a new method is encountered, `currentStructure` points to the previous method (or its child), and `parentStack` might be empty if `checkAndPopCompletedStructures` already popped it

## Potential Breakthrough Approach

The real issue might be in `handleProcedureOrClassToken` where it determines the parent container. When processing method implementations:

```typescript
// Around line 900+
if (token.subType === TokenType.MethodImplementation) {
    // BEFORE calling findOrCreateClassImplementation
    // We should ensure we're not using a stale currentStructure
    // Maybe pass null as currentStructure for methods?
    // Or find the Methods container from symbols directly?
}
```

The method is getting added to `container!.children` (line 1128), and `container` is determined earlier in the function. The question is: **Is `container` pointing to the previous method instead of the Methods container?**

## Questions to Investigate

1. When `handleProcedureOrClassToken` is called for the second `SetValue` method, what is `currentStructure`?
2. What does `findOrCreateClassImplementation` return as the container?
3. Is the Methods container being reused, or are we creating multiple?
4. Can we add a check: if processing a method and `container` is itself a method, reject it and find the real Methods container?

---

**Status**: Code compiles, most features work, method nesting bug remains  
**Next Session**: Try the "container validation" approach - check if container is a method and fix it before adding

