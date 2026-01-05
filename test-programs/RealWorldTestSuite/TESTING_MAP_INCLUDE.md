# Manual Testing Guide for MAP INCLUDE

## Test Setup

The `test-programs/scope-test-suite` folder contains real Clarion files for testing MAP INCLUDE functionality.

### Files:
- `main.clw` - PROGRAM file with global MAP
- `utils.clw` - MEMBER file with local MAP containing `INCLUDE('StartProc.inc')`
- `StartProc.inc` - MAP INCLUDE file with StartProc procedure declaration
- `StartProc.clw` - Implementation of StartProc

### Test Procedure:

1. **Open the solution in VS Code**:
   ```
   code F:\github\Clarion-Extension\Clarion-Extension\test-programs\scope-test-suite
   ```

2. **Open utils.clw**

3. **Verify MAP is detected**:
   - The file should have a MAP block around line 3
   - The MAP contains: `INCLUDE('startproc.inc'),ONCE`

4. **Test Hover on StartProc**:
   - Find the line with `StartProc(1)` call (around line 44 in GetCounter procedure)
   - Hover over `StartProc`
   - **Expected**: Hover should show procedure signature from StartProc.inc
   - **Current Issue**: Hover returns null because MAP INCLUDE files aren't being loaded

5. **Check the logs**:
   - Open Output panel → "Clarion Language Server"
   - Look for:
     ```
     [MapProcedureResolver] Looking for MAP declaration for procedure: StartProc
     [MapProcedureResolver] 📋 Found 1 MAP structure(s) in document "utils.clw"
     [ScopeAnalyzer] 📁 Found 1 INCLUDE statement(s) in MAP
     [ScopeAnalyzer] 🔍 Processing INCLUDE: "startproc.inc"
     [ScopeAnalyzer] ❌ File not found at fallback path either
     ```

## Current Status

### ✅ What Works:
1. MAP is detected in MEMBER files
2. INCLUDE statements are detected within MAP blocks
3. ScopeAnalyzer attempts to resolve INCLUDE files
4. MapProcedureResolver uses ScopeAnalyzer to get MAP tokens with INCLUDEs

### ❌ What Doesn't Work:
1. **No Solution Manager**: The solution isn't being loaded, so redirection parser can't resolve paths
   - Log shows: `⚠️ No solution manager/projects available`
   
2. **Fallback path fails**: Tries `c:\Development\IBSWorking\genfiles\src\startproc.inc` but file is actually at:
   - `F:\github\Clarion-Extension\Clarion-Extension\test-programs\scope-test-suite\StartProc.inc`

## Root Cause

The ScopeAnalyzer needs access to:
1. **SolutionManager** with loaded solution
2. **RedirectionFileParser** with parsed .RED file  
3. **Correct relative paths** from source file

Currently, in your live environment (c:\Development\IBSWorking\genfiles), the solution manager is null, so file resolution fails.

## Next Steps

1. **Check if solution is loaded**: 
   - Look for logs like `[SolutionManager] Loading solution...`
   - If not present, solution didn't load

2. **Check .RED file**:
   - Does `c:\Development\IBSWorking\genfiles\genfiles.red` exist?
   - Is it being parsed?

3. **Add better fallback**:
   - Try relative to source file directory
   - Try common Clarion include paths
   - Check if file is already in TokenCache

## Testing in Your Environment

Your file: `c:\Development\IBSWorking\genfiles\src\Main_py1.clw`

MAP block should have:
```clarion
   MAP
     INCLUDE('MAIN_PY1.INC'),ONCE
     INCLUDE('STARTPROC_PY1.INC'),ONCE
     ...
   END
```

Expected file locations:
- `c:\Development\IBSWorking\genfiles\src\STARTPROC_PY1.INC`
- Or resolved via .RED file

Check logs when hovering over `StartProc` call to see where it's looking for files.
