# Commands Reference

[← Back to Documentation Home](../../README.md)

Complete reference for all commands in the Clarion Extension, generated from the extension manifest for **v1.0.0**.

Run commands from the Command Palette (`Ctrl+Shift+P`), context menus in the editor and Solution View, or the keyboard shortcuts listed below. Settings are documented separately in **[Settings Reference](settings.md)**.

---

## Keyboard Shortcuts

| Key | Command | When |
|---|---|---|
| `F12` | Go to Definition | editor |
| `Ctrl+F12` | Go to Implementation | editor |
| `Shift+F12` | Find All References | editor |
| `F2` | Rename Symbol | editor |
| `Ctrl+T` | Workspace Symbol Search | anywhere |
| `Ctrl+.` | Quick fixes & refactors (Surround With, Negate Condition, Flip IF/ELSE, Introduce EQUATE, Create Routine, missing INCLUDE/constants) | editor |
| `Ctrl+P` | `Clarion: Quick Open` — redirection-aware file search | solution open |
| `Ctrl+Shift+B` | Build Clarion Solution | solution open |
| `F5` | Start Debugging (Clarion Debugger) | solution open |
| `Ctrl+F5` | Run Without Debugging | solution open |
| `Ctrl+Shift+Alt+V` | Paste as Clarion String | Clarion editor |
| `Ctrl+Shift+I` | Add Method Implementation | Clarion editor |
| `Shift+Alt+→` / `Shift+Alt+←` | Expand / Shrink Selection | editor |

---

## Solution Commands

| Command | Description |
|---|---|
| `clarion.openSolutionMenu` | **Open Solution…** — the main entry point: pick a detected `.sln`, browse, or choose from recents |
| `clarion.openSolution` | Open Solution (browse) |
| `clarion.openDetectedSolution` | Open a `.sln` auto-detected in the workspace folder |
| `clarion.openSolutionFromList` | Open from the recent-solutions list |
| `clarion.newSolution` | Create a new solution |
| `clarion.closeSolution` | Close the current solution |
| `clarion.forceRefreshSolutionCache` | Refresh Solution — re-parse `.sln`/projects |
| `clarion.reinitializeSolution` | Full reinitialize of the solution environment |
| `clarion.setConfiguration` | Set the active build configuration (Debug/Release/custom) |
| `clarion.setActiveVersion` | Pick the active Clarion version (drives redirection/libsrc paths) |
| `clarion.quickOpen` | Quick Open including redirection paths (`Ctrl+P` when a solution is open; falls back to VS Code's native Quick Open without one) |
| `clarion.showExtensionStatus` | Show extension status (diagnostics for support) |

## Build & Run Commands

| Command | Description |
|---|---|
| `clarion.buildSolution` | Build the solution (`Ctrl+Shift+B`) |
| `clarion.buildCurrentProject` | Build the project containing the active file |
| `clarion.buildProject` | Build a specific project (Solution View context menu) |
| `clarion.buildAllProjects` | Build every project |
| `clarion.startDebugging` | `F5` — launch the startup project under the Clarion debugger |
| `clarion.runWithoutDebugging` | `Ctrl+F5` — run the startup project |
| `clarion.setStartupProject` / `clarion.clearStartupProject` | Choose which project `F5`/`Ctrl+F5` targets |

## Application (APP) Commands

Available in the Solution View for solutions with `.app` files under version control:

| Command | Description |
|---|---|
| `clarion.generateApp` | Generate one application's source |
| `clarion.generateAllApps` | Generate all applications |
| `clarion.generateAndBuildApp` | Generate + build one project |
| `clarion.generateAllAppsThenBuildSolution` | Generate all, then build the solution |
| `clarion.exportAppToVersionControl` / `clarion.exportAllAppsToVersionControl` | Export APP(s) to TXA-based version control |
| `clarion.importAppFromTextForSolution` / `clarion.importAllAppsFromTextForSolution` | Import APP(s) back from version control |
| `clarion.toggleApplicationSortOrder` | Toggle APP sort order in the view |
| `clarion.openInClarionIDE` | Open the file/app in the Clarion IDE |

## Editing Commands

| Command | Description |
|---|---|
| `clarion.surroundWith` | **Surround With…** — wrap selection in IF / LOOP / CASE (also on `Ctrl+.`) |
| `clarion.negateCondition` | **Negate Condition** (also on `Ctrl+.`) |
| `clarion.flipIfElse` | **Flip IF/ELSE** (also on `Ctrl+.`) |
| `clarion.pasteAsString` | Paste clipboard content as concatenated Clarion string literals (`Ctrl+Shift+Alt+V`) |
| `clarion.addImplementation` | Add Method Implementation from a CLASS declaration (`Ctrl+Shift+I`) |
| `clarion.createClass` | Create New Class wizard (generates `.inc` + `.clw`) |

## Project Structure Commands (Solution View)

| Command | Description |
|---|---|
| `clarion.addSourceFile` / `clarion.removeSourceFile` | Add/remove a source file in a project |
| `clarion.addMapModule` | Add a MODULE with a PROCEDURE to the MAP |
| `clarion.addProcedureToModule` | Add a PROCEDURE to an existing MODULE |
| `clarion.addProcedureFromMap` | Add a PROCEDURE from the MAP |
| `clarion.navigateToProject` | Jump to a project in the view |
| `clarion.copyFilePath` / `clarion.copyRelativePath` | Copy the file's full/relative path |
| `clarion.openContainingFolder` | Reveal the file in Explorer |

## View Commands

| Command | Description |
|---|---|
| `clarion.structureView.filter` / `clearFilter` | Filter the Structure View |
| `clarion.structureView.expandAll` | Expand all Structure View nodes |
| `clarion.structureView.enableFollowCursor` / `disableFollowCursor` | Toggle cursor-following in the Structure View |
| `clarion.solutionView.filter` / `clearFilter` | Filter the Solution View |

## Diagnostics / Debug Commands

| Command | Description |
|---|---|
| `clarion.debugSolutionHistory` | Inspect the recent-solutions memory |
| `clarion.debug.showFileRelationshipGraph` | Dump the MODULE/INCLUDE/MEMBER file graph (support/debug) |

---

## Related Documentation

- **[Settings Reference](settings.md)** — all configuration options
- **[Code Editing Tools](../features/code-editing.md)** — refactors, snippets, wizards
- **[Solution Management](../features/solution-management.md)** — solutions and builds
