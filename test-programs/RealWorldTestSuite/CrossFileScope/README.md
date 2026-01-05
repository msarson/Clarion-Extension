# CrossFileScope Test Project

## Purpose

Tests cross-file scope resolution in the Clarion extension:
- MEMBER → PROGRAM relationships
- Global variable access across files
- Module-local variable scoping
- MAP declarations and procedure navigation
- F12 (Go to Definition) vs Ctrl+F12 (Go to Implementation)

## Test Files

### Used by Automated Tests
- `server/src/test/SolutionBased.CrossFileScope.test.ts` (main test suite)
- `server/src/test/CrossFileScope.test.ts` (TEST 7: MAP INCLUDE)

### Source Files in This Project
- **main.clw** - PROGRAM file with global declarations and MAP
- **utils.clw** - MEMBER file with procedure implementations
- **StartProc.clw** - Helper MEMBER with standard procedure
- **StartProc.inc** - INCLUDE file for testing MAP INCLUDE

## ⚠️ IMPORTANT - DO NOT MODIFY

These files are used by automated tests that expect specific line numbers:

```
Line 76 (main.clw):  GlobalCounter LONG (global variable)
Line 65 (main.clw):  IncrementCounter() in MAP
Line 73 (main.clw):  GlobalHelper PROCEDURE() in MAP
Line 40 (utils.clw): GlobalCounter += 1 (cross-file access)
Line 34 (utils.clw): ModuleData LONG (module-local)
```

**If you change line numbers, you MUST update test expectations!**

## Test Scenarios

### TEST 1: Global Variable Cross-File Access
- F12 on `GlobalCounter` in utils.clw should jump to main.clw line 76
- Validates: Cross-file access to global symbols

### TEST 2: Procedure Navigation
- F12 on `IncrementCounter()` call → MAP declaration in main.clw
- Ctrl+F12 → Implementation in utils.clw
- Validates: Definition vs Implementation navigation

### TEST 4: Module-Local Blocking
- `ModuleData` in utils.clw should NOT be accessible from main.clw
- Validates: Module scope boundaries

### TEST 6: Global Procedure Access
- F12 on `GlobalHelper()` in utils.clw → MAP in main.clw
- Validates: Cross-file procedure access

### TEST 7: MAP INCLUDE
- StartProc declared in `startproc.inc` via MAP INCLUDE
- Validates: INCLUDE in MAP for procedure declarations

## Manual Testing

1. Open `RealWorldTestSuite.sln` in VS Code
2. Press F5 to start extension debugging
3. In debug window, open main.clw and utils.clw
4. Test F12 navigation on the symbols listed above
5. Verify hover tooltips show correct scope information

## Running Automated Tests

```bash
# All cross-file tests
npm test -- --grep "Cross-File"

# Solution-based tests only
npm test -- --grep "Solution-Based"
```
