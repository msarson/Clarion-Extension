# Session: MAP Procedure Navigation Issue
**Date:** December 5, 2025  
**Issue:** Go to Implementation and Hover not working correctly for MAP procedure declarations

## Problem Description

When using "Go to Implementation" or "Hover" on a MAP procedure declaration, the feature is jumping to line 39 (the MAP declaration itself) instead of finding the actual PROCEDURE implementation code block later in the file.

## Code Structure

The file `AtSort.clw` has the following structure:

**Lines 35-40: MAP Section (Forward Declarations)**
```clarion
MAP
  AtSortReport         PROCEDURE(string startconfiggrp, string startrerungrp)
  DB                   PROCEDURE(string info)
  PopupUnder           PROCEDURE(LONG CtrlFEQ, string popmenu)
  TextLineCount        PROCEDURE(LONG TextFEQ),LONG  !TEXT Prop:LineCount without trailing blanks
END
```

**Later in file: Actual PROCEDURE Implementations**
```clarion
TextLineCount       PROCEDURE(LONG TextFEQ),LONG  !TEXT Prop:LineCount without trailing blanks
! ... implementation code here ...
  RETURN (result)
```

## Current Behavior

1. User clicks on `TextLineCount` at line 39 (in the MAP)
2. Goes to Implementation or Hover is triggered
3. The extension finds line 39 itself and returns that location
4. User stays on the MAP declaration instead of jumping to the implementation

## Expected Behavior

1. User clicks on `TextLineCount` at line 39 (in the MAP)
2. Goes to Implementation should find the PROCEDURE implementation (somewhere after line 40)
3. User should jump to the actual implementation code block
4. Hover should show the implementation code, not the MAP declaration

## Key Technical Points

### MAP Declarations are Forward Declarations
- Lines in MAP...END blocks are **forward declarations**, not implementations
- They tell the compiler that these procedures exist and their signatures
- Similar to C/C++ header files or forward declarations

### PROCEDURE Implementations Come Later
- After the MAP section, the actual PROCEDURE code blocks are defined
- These start with the procedure name (without class prefix if it's a method)
- Implementation has the full procedure body with CODE...RETURN

## Current Implementation Issue

Looking at the logs:
```
[2025-12-05T15:53:11.725Z] [ImplementationProvider] ℹ️ INFO: Found PROCEDURE at line 39: TextLineCount (simple: TextLineCount)
[2025-12-05T15:53:11.725Z] [ImplementationProvider] ℹ️ INFO: ✅ Match found for TextLineCount at line 39
```

The search is finding line 39, which is the MAP declaration, not the implementation.

## Root Cause

The regex pattern used to find PROCEDURE implementations is matching:
1. The MAP declaration line: `TextLineCount PROCEDURE(LONG TextFEQ),LONG`
2. Instead of skipping MAP section and finding the actual implementation

## Solution Required

The implementation provider needs to:
1. **Identify MAP section**: When searching for implementations, skip any matches that fall within MAP...END blocks
2. **Find actual PROCEDURE**: Look for the PROCEDURE keyword at the start of a line (with optional whitespace) that is NOT inside a MAP block
3. **Return correct location**: Return the line where the actual PROCEDURE implementation starts

## Files Involved

- `client/src/providers/ClarionImplementationProvider.ts` - Main implementation provider
- `client/src/managers/DocumentManager.ts` - Document parsing and statement tracking

## Next Steps

1. Modify the implementation search to skip MAP sections
2. Ensure we find the actual PROCEDURE implementation block
3. Test with various scenarios:
   - MAP procedures (standalone)
   - Class methods with MAP declarations
   - Nested classes
