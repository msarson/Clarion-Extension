# Session 2024-12-05: Outstanding Issues - INVESTIGATION UPDATE

## Issues to Fix

### 1. Solution History Only Shows One Entry ⚠️ UNDER INVESTIGATION

**Problem:** When closing a solution, the recent solutions list should show multiple previously opened solutions, but it only ever shows one.

**Investigation Progress:**
- `GlobalSolutionHistory.ts` stores up to 20 solutions in global state ✅
- Code logic verified correct for storing/retrieving multiple entries ✅
- Created test script (`test-solution-history.js`) - logic works in isolation ✅
- **Added extensive logging** to trace what's happening:
  - `GlobalSolutionHistory.addSolution()` - logs total count
  - `GlobalSolutionHistory.getReferences()` - logs retrieved count
  - `GlobalSolutionHistory.getValidReferences()` - logs validation process
  - `SolutionTreeDataProvider._loadDetectedSolutionsNodes()` - logs display count
- **Added debug command**: `clarion.debugSolutionHistory` 
  - Can be run from command palette
  - Shows total vs valid solution count in logs

**Possible Causes:**
1. Solutions being filtered out by `getValidReferences()` (files/folders don't exist)
2. VS Code's global state not persisting correctly
3. Only one solution ever being added (but code looks correct)
4. Solutions in same folder might cause confusion

**Next Steps:**
- Run extension in debug mode
- Open/close multiple solutions in different folders
- Check output logs for solution history counts
- Run `clarion.debugSolutionHistory` command to inspect state
- Verify files/folders exist for all history entries

**Files Modified:**
- `client/src/utils/GlobalSolutionHistory.ts` - Added debug logging
- `client/src/SolutionTreeDataProvider.ts` - Added display logging
- `client/src/extension.ts` - Added debug command
- `package.json` - Registered debug command

### 2. Browse for Solution Doesn't Update settings.json ✅ PARTIALLY FIXED

**Problem:** Clicking "Browse for Solution..." button should:
1. Let user pick a .sln file
2. Update the folder's `.vscode/settings.json` with solution settings
3. Open the solution

But it's not updating the local settings.json file correctly.

**Investigation Progress:**

**Scenario A: NO FOLDER OPEN** - ✅ FIXED
- When no folder is open, `openClarionSolution()` (line 2012-2036):
  - Shows file picker
  - Gets solution path
  - Opens folder containing solution
  - VS Code reloads
- **Problem:** Settings couldn't be saved because no folder existed yet
- **Fix Applied:** Added solution to global history BEFORE opening folder (line 2029)
- Now after reload, solution appears in recent solutions list

**Scenario B: FOLDER IS OPEN** - ✅ VERIFIED CORRECT
- Code flow (lines 2037-2205):
  - Shows quick pick of existing solutions OR "New Solution..."
  - If new solution selected, shows file picker
  - Calls `setGlobalClarionSelection()` → `SettingsStorageManager.saveSolutionSettings()`
  - Uses `ConfigurationTarget.WorkspaceFolder` (saves to `.vscode/settings.json`)
- **Added extensive logging** to verify saves:
  - Logs target configuration level
  - Logs each setting as it's saved
  - Logs final success message

**Next Steps:**
- Test Scenario A (no folder open) with real extension
- Test Scenario B (folder open) and verify settings.json is actually written
- Check output logs to see if saves are happening
- If settings still not saving, check VS Code workspace trust settings

**Files Modified:**
- `client/src/extension.ts` - Fixed no-folder scenario (line 2029)
- `client/src/utils/SettingsStorageManager.ts` - Added detailed save logging

## What Works ✅

- Go to Implementation for CLASS methods (Ctrl+F12)
- Go to Implementation for MAP procedures (Ctrl+F12)
- Hover previews showing implementation snippets
- Parameter matching (handles spaces correctly)
- Case-insensitive identifier handling
- Return type extraction from procedure attributes

## Recent Commits

1. `bd4df7a` - debug: add detailed logging to SettingsStorageManager
2. `82b610b` - feat: add debug command for solution history inspection
3. `15c7dc9` - debug: add logging to GlobalSolutionHistory and fix Browse for Solution
4. `f372975` - fix: skip MAP declarations when finding procedure implementations
5. `3414727` - fix: limit hover preview to current procedure only
6. `e575958` - fix: preserve original case for MAP procedure names
7. `bc47868` - fix: CLASS detection regex for Go to Implementation
8. `e3ec01a` - feat: add Go to Implementation for MAP procedures
9. `06bf220` - fix: support Go to Implementation for classes without MODULE
10. `e8db896` - fix: properly extract return types from procedure attributes

## Next Session Tasks

1. **Test Solution History Fix**
   - Launch extension in debug mode (F5)
   - Open multiple different solutions in different folders
   - Close each solution
   - Verify multiple entries appear in "Recent Solutions" list
   - Run `Clarion: Debug Solution History` command
   - Check output logs for counts and validation messages
   
2. **Test Browse for Solution Fix**
   - **Test A: No folder open**
     - Close all folders in VS Code
     - Click "Browse for Solution..." in Solution Explorer
     - Select a .sln file
     - Verify folder opens and solution appears in tree
     - Verify solution was added to global history
   - **Test B: Folder already open**
     - Open a folder containing .sln files
     - Click "Browse for Solution..."
     - Select "New Solution..." and pick a .sln file
     - Verify `.vscode/settings.json` is created/updated
     - Check output logs for save confirmations
     
3. **Verify Logs**
   - Open "Clarion Extension" output channel
   - Look for messages like:
     - `📊 Total solutions in history: X`
     - `✅ Returning X valid references`
     - `📜 Found X recent solutions to display`
     - `💾 Saving settings to .vscode/settings.json`
     - `✅ Saved solutionFile`, `✅ Saved propertiesFile`, etc.

4. **If Issues Persist**
   - For solution history: Check if VS Code's globalState is persisting
   - For settings save: Check workspace trust settings
   - Add breakpoints in `GlobalSolutionHistory.addSolution` and `SettingsStorageManager.saveSolutionSettings`
   - Verify file system permissions for `.vscode/` directory

## Additional Investigation Notes
