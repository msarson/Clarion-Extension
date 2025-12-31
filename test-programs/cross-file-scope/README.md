# Cross-File Scope Testing

This directory contains test files for validating cross-file scope functionality.

## Test Files

- **main.clw** - PROGRAM file with global declarations
- **utils.clw** - MEMBER file with module-local and procedure implementations

## Manual Testing Steps

### 1. Open VS Code with Extension Debugging (F5)
1. Open this folder in VS Code
2. Press F5 to start extension debugging
3. A new VS Code window will open with the extension loaded

### 2. Test F12 (Go to Definition) - Cross-File Global Access

**From utils.clw → main.clw:**
- Open `utils.clw`
- Line 6: Put cursor on `GlobalCounter`
- Press F12 or Ctrl+Click
- **Expected:** Should jump to `main.clw` line 10 (global declaration)
- **Validates:** Cross-file access to global symbols works

**From main.clw → utils.clw:**
- Open `main.clw`
- Line 7: Put cursor on `IncrementCounter`
- Press F12
- **Expected:** Should jump to `utils.clw` line 5 (implementation)
- **Validates:** Cross-file navigation to implementations works

### 3. Test Module-Local Boundaries

**Module-local should NOT be accessible:**
- Try to reference `ModuleData` from main.clw (add a test line)
- F12 should NOT navigate (or navigate incorrectly)
- **Validates:** Module-local scope boundaries are respected

### 4. Test Hover (Future - Phase 4)
Once HoverProvider is integrated with ScopeAnalyzer:
- Hover over `GlobalCounter` in utils.clw
- Should show "Global variable from main.clw"

## Expected Behavior

### ✅ Should Work (Global Access)
- `GlobalCounter` accessible from utils.clw
- Defined in main.clw (PROGRAM file)
- Visible across all MEMBER files

### ❌ Should NOT Work (Module-Local)
- `ModuleData` NOT accessible from main.clw
- Defined in utils.clw (MEMBER file)
- Only visible within utils.clw

### ✅ Should Work (Procedure Access)
- `IncrementCounter()` callable from main.clw
- Declared in MAP in main.clw
- Implemented in utils.clw

## Current Implementation Status

**Phase 3 Complete:**
- ✅ Cross-file access validation in canAccess()
- ✅ SolutionManager integration in getVisibleFiles()
- ✅ Unit tests passing (34/34)
- 🧪 Manual testing in progress

**Next Phase:**
- HoverProvider integration (show scope info in tooltips)
- CompletionProvider integration (filter suggestions by scope)

## Notes

- Requires a Clarion solution to be loaded for full functionality
- Without solution: Falls back to single-file behavior
- RedirectionParser used for file resolution
