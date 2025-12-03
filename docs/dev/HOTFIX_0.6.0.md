# Hotfix Release 0.6.0

**Date:** January 19, 2025  
**Type:** Critical Bug Fix

## Problem

Folding ranges and document symbols (outline view) were not working in the released/packaged extension (VSIX), even though they worked perfectly in development mode (F5 debugging).

## Root Cause

The `server/src/server.ts` file contained **duplicate event handlers**:
- Two `connection.onInitialize()` handlers (lines 89 and 1033)
- Two `connection.onInitialized()` handlers (lines 147 and 1107)

When duplicate handlers are registered, the **last one overwrites the first**. In the packaged extension, this caused:
1. The simpler second handler (without proper error handling) to take precedence
2. Potential race conditions in initialization
3. Missing functionality that was only in the first handler

## Solution

**Removed duplicate handlers** (lines 1033-1119) and consolidated all functionality into the primary handlers (lines 89-184):

### Changes Made:

1. **Kept the robust primary handlers** with comprehensive logging and error handling
2. **Added missing functionality** from the duplicate handlers:
   - `globalClarionSettings` initialization (line 97)
   - SolutionManager registration (lines 158-165)
3. **Moved definition and hover handlers** to their proper location after document handlers (lines 1041-1097)
4. **Updated CHANGELOG.md** with detailed explanation

### Files Modified:

- `server/src/server.ts` - Removed duplicate handlers, consolidated functionality
- `CHANGELOG.md` - Added release notes

## Verification

✅ Compilation successful (`npm run compile`)  
✅ No duplicate handlers remaining (verified with grep)  
✅ All event handlers properly registered once  
✅ Both development and release builds now work correctly
✅ Testing completed successfully

## Impact

This fix ensures that:
- **Folding ranges** work correctly (ability to collapse code sections)
- **Document symbols** work correctly (outline view in sidebar)
- **Definition navigation** continues to work (F12)
- **Hover information** continues to work
- All features work **without requiring a Clarion solution to be selected**

## Notes

- This was a **critical bug** that only manifested in production
- The issue was difficult to diagnose because development mode worked fine
- Root cause was duplicate event handler registration
- No behavioral changes - only bug fix to restore intended functionality
