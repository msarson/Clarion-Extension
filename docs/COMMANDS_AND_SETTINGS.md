# Clarion Extension - Commands and Settings Reference

Complete reference for all commands and settings in the Clarion Extension for Visual Studio Code.

## Table of Contents

- [Commands](#commands)
  - [Solution Management](#solution-management-commands)
  - [Build Commands](#build-commands)
  - [Code Editing](#code-editing-commands)
  - [Navigation](#navigation-commands)
  - [View Commands](#view-commands)
  - [Utility Commands](#utility-commands)
- [Settings](#settings)
  - [Core Settings](#core-settings)
  - [Build Settings](#build-settings)
  - [Editor Settings](#editor-settings)
  - [Feature Settings](#feature-settings)

---

## Commands

### Solution Management Commands

#### `Clarion: Open Solution...`
**Command ID**: `clarion.openSolutionMenu`  
**Usage**: Opens solution selection dialog  
**Access**: Command Palette (`Ctrl+Shift+P`)

#### `Open Solution`
**Command ID**: `clarion.openSolution`  
**Usage**: Browse for and open a Clarion solution file (.sln)  
**Access**: Solution View toolbar, Command Palette

#### `Open Solution List`
**Command ID**: `clarion.openSolutionFromList`  
**Usage**: Shows recent solutions for quick access  
**Access**: Solution View toolbar

#### `Close Solution`
**Command ID**: `clarion.closeSolution`  
**Usage**: Closes the currently open solution  
**Access**: Solution View context menu (on solution node)

#### `Refresh Solution`
**Command ID**: `clarion.forceRefreshSolutionCache`  
**Usage**: Forces re-parsing of solution and project files  
**Access**: Solution View toolbar

#### `Clarion: Reinitialize Solution`
**Command ID**: `clarion.reinitializeSolution`  
**Usage**: Completely reinitializes solution (clears all caches)  
**Access**: Command Palette

#### `Clarion: Set Configuration`
**Command ID**: `clarion.setConfiguration`  
**Keybinding**: None  
**Usage**: Switch between Release/Debug build configurations  
**Access**: Command Palette

---

### Build Commands

#### `Build Clarion Solution`
**Command ID**: `clarion.buildSolution`  
**Keybinding**: `Ctrl+Shift+B`  
**Usage**: Builds all projects in the current solution  
**Access**: Command Palette, Solution View context menu, Keybinding

#### `Build Current Project`
**Command ID**: `clarion.buildCurrentProject`  
**Usage**: Builds the project containing the active file  
**Access**: Command Palette

#### `Build Project`
**Command ID**: `clarion.buildProject`  
**Usage**: Builds a specific project  
**Access**: Solution View context menu (on project node)

#### `Generate All Applications`
**Command ID**: `clarion.generateAllApps`  
**Usage**: Generates all applications using ClarionCl.exe  
**Access**: Solution View context menu (on Applications node)

#### `Generate Application`
**Command ID**: `clarion.generateApp`  
**Usage**: Generates a specific application  
**Access**: Solution View context menu (on individual app node)

---

### Code Editing Commands

#### `Clarion: Paste as String`
**Command ID**: `clarion.pasteAsString`  
**Keybinding**: `Ctrl+Shift+Alt+V`  
**Usage**: Pastes clipboard content as properly formatted Clarion string with continuation  
**Access**: Keybinding, Command Palette  
**Requires**: Clarion file active in editor  
**Features**:
- Escapes single quotes automatically
- Adds `& |` continuation syntax
- Aligns opening quotes at cursor column
- Configurable line terminators (space/crlf/none)
- Optional leading whitespace trimming

#### `Clarion: Create New Class`
**Command ID**: `clarion.createClass`  
**Keybinding**: None  
**Usage**: Interactive wizard to create new CLASS with .inc and .clw files  
**Access**: Command Palette  
**Features**:
- Prompts for class name, file names, methods
- Optional Construct/Destruct methods
- Folder selection (current or browse)
- File conflict detection
- Respects tab/space settings

#### `Clarion: Add Method Implementation`
**Command ID**: `clarion.addImplementation`  
**Keybinding**: `Ctrl+Shift+I`  
**Usage**: Generates implementation for method at cursor  
**Access**: Keybinding, Command Palette  
**Requires**: Cursor on method declaration in .inc file within CLASS  
**Features**:
- Finds MODULE file automatically
- Checks for existing implementation (with parameter matching)
- Jumps to existing or generates new at EOF
- Includes return type as comment

---

### Navigation Commands

#### `Clarion: Quick Open (Includes Redirection Paths)`
**Command ID**: `clarion.quickOpen`  
**Keybinding**: `Ctrl+P`  
**Usage**: Quick file open with redirection file awareness  
**Access**: Keybinding, Command Palette  
**Features**: Searches files in redirected directories

#### `Navigate to Project`
**Command ID**: `clarion.navigateToProject`  
**Usage**: Jumps to project in Solution View  
**Access**: Internal command (context-dependent)

#### Go to Implementation
**Keybinding**: `Ctrl+F12` (default VS Code command)  
**Usage**: Navigate from CLASS method declaration to implementation  
**Features**:
- Finds MODULE file
- Matches method overloads by parameters
- Works in same file or separate .clw files

#### Go to Definition
**Keybinding**: `F12` (default VS Code command)  
**Usage**: Navigate to INCLUDE files, MODULE files, class members  
**Features**:
- INCLUDE with SECTION support
- Redirection-aware file resolution
- Prefix resolution for GROUP fields

---

### View Commands

#### Solution View Commands

##### `Filter Solution Tree`
**Command ID**: `clarion.solutionView.filter`  
**Usage**: Filters solution tree to show matching items  
**Access**: Solution View toolbar (filter icon)

##### `Clear Filter`
**Command ID**: `clarion.solutionView.clearFilter`  
**Usage**: Removes active filter from solution tree  
**Access**: Solution View toolbar

##### `Add Source File`
**Command ID**: `clarion.addSourceFile`  
**Usage**: Adds .clw file to project  
**Access**: Solution View context menu (on project node)

##### `Remove Source File`
**Command ID**: `clarion.removeSourceFile`  
**Usage**: Removes source file from project  
**Access**: Solution View context menu (on file node)

#### Structure View Commands

##### `Expand All`
**Command ID**: `clarion.structureView.expandAll`  
**Usage**: Expands all nodes in Structure View  
**Access**: Structure View toolbar

##### `Filter Structure View`
**Command ID**: `clarion.structureView.filter`  
**Usage**: Filters structure view to show matching symbols  
**Access**: Structure View toolbar (filter icon)

##### `Clear Structure Filter`
**Command ID**: `clarion.structureView.clearFilter`  
**Usage**: Removes active filter from structure view  
**Access**: Structure View toolbar

##### `Enable Follow Cursor`
**Command ID**: `clarion.structureView.enableFollowCursor`  
**Usage**: Auto-selects symbol at cursor in Structure View  
**Access**: Structure View context menu

##### `Disable Follow Cursor`
**Command ID**: `clarion.structureView.disableFollowCursor`  
**Usage**: Disables auto-selection of symbols  
**Access**: Structure View context menu

---

### Utility Commands

#### `Clarion: Show Extension Status`
**Command ID**: `clarion.showExtensionStatus`  
**Usage**: Displays extension health check and configuration status  
**Access**: Command Palette  
**Shows**:
- Language server status
- Workspace configuration
- Solution status
- Navigation capabilities
- Build task availability
- Contextual tips

#### `Clarion: Debug Solution History`
**Command ID**: `clarion.debugSolutionHistory`  
**Usage**: Shows internal solution history data (debugging)  
**Access**: Command Palette

---

## Settings

### Core Settings

#### `clarion.version`
**Type**: String  
**Default**: `"11"`  
**Description**: Clarion version number (used for BIN path detection)  
**Example**: `"11"`, `"10"`, `"9.1"`

#### `clarion.binPath`
**Type**: String  
**Default**: Auto-detected  
**Description**: Path to Clarion BIN directory  
**Example**: `"C:\\Clarion11\\Bin"`

#### `clarion.solutionPath`
**Type**: String  
**Default**: `""`  
**Description**: Path to current Clarion solution file  
**Auto-managed**: Set by extension when opening solutions

#### `clarion.clarionPropertiesPath`
**Type**: String  
**Default**: `""`  
**Description**: Path to .clarion.properties file for redirection  
**Example**: `"C:\\Clarion\\MyApp\\.clarion.properties"`

#### `clarion.buildConfiguration`
**Type**: String  
**Enum**: `"Release"`, `"Debug"`  
**Default**: `"Release"`  
**Description**: Current build configuration

#### `clarion.defaultLookupExtensions`
**Type**: Array of strings  
**Default**: `[".clw", ".inc", ".equ"]`  
**Description**: File extensions to include in searches and navigation

---

### Build Settings

#### `clarion.build.target`
**Type**: String  
**Default**: `"build"`  
**Description**: MSBuild target to execute  
**Options**: `"build"`, `"rebuild"`, `"clean"`

#### `clarion.build.verbosity`
**Type**: String  
**Enum**: `"quiet"`, `"minimal"`, `"normal"`, `"detailed"`, `"diagnostic"`  
**Default**: `"minimal"`  
**Description**: MSBuild output verbosity level

#### `clarion.build.showTaskList`
**Type**: Boolean  
**Default**: `true`  
**Description**: Show build tasks in task list

---

### Editor Settings

#### `clarion.editor.tabSize`
**Type**: Number  
**Default**: `4`  
**Description**: Number of spaces per tab (respects `editor.tabSize` override)

#### `clarion.editor.insertSpaces`
**Type**: Boolean  
**Default**: `false`  
**Description**: Use spaces instead of tabs (respects `editor.insertSpaces` override)

---

### Feature Settings

#### Paste as String Settings

##### `clarion.pasteAsString.lineTerminator`
**Type**: String  
**Enum**: `"space"`, `"crlf"`, `"none"`  
**Default**: `"space"`  
**Description**: How to terminate each line when pasting as string  
**Options**:
- `"space"` - Adds trailing space (ideal for SQL queries)
- `"crlf"` - Adds `<13,10>` line break
- `"none"` - No line terminator

##### `clarion.pasteAsString.trimLeadingWhitespace`
**Type**: Boolean  
**Default**: `true`  
**Description**: Remove leading whitespace from each line when pasting  
**Recommended**: `true` when pasting indented code

#### Language Server Settings

##### `clarion.languageServer.enabled`
**Type**: Boolean  
**Default**: `true`  
**Description**: Enable/disable language server features

##### `clarion.languageServer.trace.server`
**Type**: String  
**Enum**: `"off"`, `"messages"`, `"verbose"`  
**Default**: `"off"`  
**Description**: Language server logging level for debugging

#### Diagnostics Settings

##### `clarion.diagnostics.enabled`
**Type**: Boolean  
**Default**: `true`  
**Description**: Enable/disable diagnostic error detection

##### `clarion.diagnostics.onType`
**Type**: Boolean  
**Default**: `true`  
**Description**: Run diagnostics as you type (vs. on save only)

#### Structure View Settings

##### `clarion.structureView.followCursor`
**Type**: Boolean  
**Default**: `false`  
**Description**: Auto-select symbol at cursor in Structure View

##### `clarion.structureView.autoExpand`
**Type**: Boolean  
**Default**: `true`  
**Description**: Auto-expand parent nodes when following cursor

---

## Configuration Examples

### Typical Development Setup

```json
{
  "clarion.version": "11",
  "clarion.binPath": "C:\\Clarion11\\Bin",
  "clarion.buildConfiguration": "Debug",
  "clarion.build.verbosity": "minimal",
  "clarion.pasteAsString.lineTerminator": "space",
  "clarion.pasteAsString.trimLeadingWhitespace": true,
  "clarion.structureView.followCursor": true,
  "editor.tabSize": 4,
  "editor.insertSpaces": false
}
```

### Team Settings (Commit with Solution)

Store in `.vscode/settings.json` at solution root:

```json
{
  "clarion.version": "11",
  "clarion.buildConfiguration": "Release",
  "clarion.defaultLookupExtensions": [".clw", ".inc", ".equ"],
  "editor.tabSize": 2,
  "editor.insertSpaces": true
}
```

---

## Keyboard Shortcuts Reference

| Command | Windows/Linux | Mac |
|---------|---------------|-----|
| Build Solution | `Ctrl+Shift+B` | `Cmd+Shift+B` |
| Go to Implementation | `Ctrl+F12` | `Cmd+F12` |
| Go to Definition | `F12` | `F12` |
| Quick Open (Redirection-aware) | `Ctrl+P` | `Cmd+P` |
| Paste as Clarion String | `Ctrl+Shift+Alt+V` | `Cmd+Shift+Alt+V` |
| Add Method Implementation | `Ctrl+Shift+I` | `Cmd+Shift+I` |

---

## See Also

- [Features Documentation](FEATURES.md) - Complete feature list
- [Getting Started](GETTING_STARTED.md) - Setup guide
- [Build Settings](BuildSettings.md) - Detailed build configuration

---

*Last updated: December 24, 2025 - Version 0.7.6*
