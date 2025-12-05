# Session 2024-12-05: Outstanding Issues

## Issues to Fix

### 1. Solution History Only Shows One Entry

**Problem:** When closing a solution, the recent solutions list should show multiple previously opened solutions, but it only ever shows one.

**Investigation Started:**
- `GlobalSolutionHistory.ts` stores up to 20 solutions in global state
- Code logic looks correct for storing/retrieving multiple entries
- Need to check: Is data being saved correctly? Is display logic filtering?

**Files to Check:**
- `client/src/utils/GlobalSolutionHistory.ts` - Storage logic
- `client/src/SolutionTreeDataProvider.ts` - Display logic (line 232: `getValidReferences()`)
- Check if `context.globalState.update()` is actually persisting multiple entries

### 2. Browse for Solution Doesn't Update settings.json

**Problem:** Clicking "Browse for Solution..." button should:
1. Let user pick a .sln file
2. Update the folder's `.vscode/settings.json` with solution settings
3. Open the solution

But it's not updating the local settings.json file correctly.

**Investigation Started:**
- Browse button executes `clarion.openSolution` command (line 721 of SolutionTreeDataProvider.ts)
- Need to find the `clarion.openSolution` command implementation
- Likely in `client/src/extension.ts` or a command handler file

**Files to Check:**
- `client/src/extension.ts` - Find `commands.registerCommand('clarion.openSolution'...)`
- Check if it calls `setGlobalClarionSelection()` with correct configuration target
- Verify it writes to folder's settings.json, not user/workspace settings

## What Works ✅

- Go to Implementation for CLASS methods (Ctrl+F12)
- Go to Implementation for MAP procedures (Ctrl+F12)
- Hover previews showing implementation snippets
- Parameter matching (handles spaces correctly)
- Case-insensitive identifier handling
- Return type extraction from procedure attributes

## Recent Commits

1. `f372975` - fix: skip MAP declarations when finding procedure implementations
2. `3414727` - fix: limit hover preview to current procedure only
3. `e575958` - fix: preserve original case for MAP procedure names
4. `bc47868` - fix: CLASS detection regex for Go to Implementation
5. `e3ec01a` - feat: add Go to Implementation for MAP procedures
6. `06bf220` - fix: support Go to Implementation for classes without MODULE
7. `e8db896` - fix: properly extract return types from procedure attributes

## Next Session Tasks

1. **Debug solution history** - Why only one entry showing?
   - Add logging to see what's being stored/retrieved
   - Check global state persistence
   - Verify display filtering logic

2. **Fix Browse for Solution** - Settings not being updated
   - Find command implementation
   - Trace through the file selection and settings update flow
   - Ensure proper configuration target (Folder vs User vs Workspace)

3. **Test scenarios:**
   - Open solution A, close it
   - Open solution B, close it
   - Check if both A and B appear in recent solutions
   - Try "Browse for Solution" and verify settings.json updates
