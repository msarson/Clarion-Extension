# Getting Started with Clarion Extension

Complete setup guide for the Clarion Extension for Visual Studio Code.

## Table of Contents

- [Installation](#installation)
- [First Time Setup](#first-time-setup)
- [Opening Your First Solution](#opening-your-first-solution)
- [Configuration](#configuration)
- [Basic Workflow](#basic-workflow)
- [Tips and Tricks](#tips-and-tricks)
- [Troubleshooting](#troubleshooting)

---

## Installation

### Requirements
- **Visual Studio Code** (latest version recommended)
- **Clarion** installed on your system (for compilation features)

### Installation Steps

1. Open **Visual Studio Code**
2. Go to the **Extensions Marketplace** (`Ctrl+Shift+X`)
3. Search for **Clarion Extensions**
4. Click **Install**
5. Restart VS Code if needed

### Upgrading from v0.6.x or Earlier

**Important**: If you are upgrading from v0.6.x or earlier and have the **fushnisoft.clarion** extension installed:

1. **First**: Uninstall **BOTH** extensions (fushnisoft.clarion AND clarion-extensions)
2. **Then**: Reinstall **only** clarion-extensions v0.7.0 or later
3. All syntax highlighting and language features are now included - you no longer need fushnisoft.clarion

This is necessary because older versions had a dependency on fushnisoft.clarion that prevents individual uninstallation.

### Upgrading from v0.7.2 or Earlier (Workspace File Changes)

**Important**: If you are upgrading from v0.7.2 or earlier:

**What Changed in v0.7.3:**
- Extension now uses **folder-based workflow** instead of workspace files
- Settings stored in `.vscode/settings.json` (within solution folder) instead of `.code-workspace` files
- Opening solutions is simpler: File → Open Folder (no workspace files needed)

**Migration:**
- Your old `.code-workspace` files still work
- But you can now simply open the folder containing your solution (much simpler!)
- Settings automatically migrate to `.vscode/settings.json` when you open a folder
- **Recommendation**: Switch to folder-based workflow for cleaner, more maintainable setup

---

## First Time Setup

### Opening a Clarion Solution

The extension uses a **folder-based workflow** - no workspace files needed!

**Method 1: Open Folder Containing Solution**
1. Click **File → Open Folder** (or `Ctrl+K Ctrl+O`)
2. Select the folder containing your `.sln` file
3. The extension automatically detects and opens the solution
4. Settings are saved in `.vscode/settings.json` within the folder

**Method 2: Browse for Solution File**
1. Open VS Code (no folder open)
2. Open **Clarion Tools** sidebar
3. Click **Browse for Solution** in the Solution View
4. Navigate to and select your `.sln` file
5. The containing folder opens automatically

**Method 3: Use Recent Solutions**
1. Open VS Code (no folder open)
2. Open **Clarion Tools** sidebar
3. Click any solution from the **Recent Solutions** list
4. The solution folder opens and loads automatically

### Initial Configuration Prompts

When opening a solution for the first time, you'll be prompted for:

1. **Clarion Version** - Select the version of Clarion you're using
   - Sets the path to Clarion BIN directory
   - Used for ClarionCl.exe integration

2. **Clarion Properties** - Select your `.clarion.properties` file
   - Used for redirection configuration
   - Can be global or project-specific

3. **Build Configuration** - Select Release or Debug
   - Can be changed later with `Clarion: Set Configuration`

These settings are saved in `.vscode/settings.json` and reused when reopening the solution.

---

## Configuration

### Basic Settings

All settings are stored in `.vscode/settings.json` within your solution folder:

```json
{
  "clarion.solutionFile": "path/to/your/solution.sln",
  "clarion.clarionBinPath": "C:/Clarion11/Bin",
  "clarion.propertiesFile": "path/to/.clarion.properties",
  "clarion.buildConfiguration": "Release"
}
```

### Team-Friendly Configuration

Because settings are stored in the solution folder:
- **Commit to version control** - Share configuration with your team
- **Per-solution settings** - Different settings for different projects
- **No workspace files** - Cleaner repository structure

### Advanced Settings

See [Build Settings Documentation](BuildSettings.md) for detailed configuration options.

---

## Basic Workflow

### Navigating Your Solution

**Solution View** (in Clarion Tools sidebar):
- Expand solution to see projects
- Expand projects to see files
- Click file to open in editor
- Right-click for context menu actions

**Structure View** (in Clarion Tools sidebar):
- Shows structure of current file
- PROCEDUREs, ROUTINEs, FILEs, CLASSes
- Click symbol to navigate
- Enable **Follow Cursor** to auto-select current symbol

### Working with Code

**Go to Definition** (`F12`):
- Navigate to INCLUDE files
- Jump to MODULE declarations
- Find method declarations
- Works with GROUP PREFIX variables

**Go to Implementation** (`Ctrl+F12`):
- Navigate to method implementations
- Find procedure implementations

**Hover**:
- Hover over INCLUDE/MODULE to preview file
- Hover over method call to see signature

### Building and Generating

**Generate Applications**:
1. Right-click on **Applications** node in Solution View
2. Select **Generate All Applications**
3. Watch output in **Clarion Generator** channel

**Generate Single Application**:
1. Right-click on specific APP in Solution View
2. Select **Generate Application**

---

## Tips and Tricks

### Keyboard Shortcuts

- `F12` - Go to Definition
- `Ctrl+F12` - Go to Implementation
- `Shift+F12` - Find All References
- `Ctrl+P` - Quick file search (redirection-aware)
- `Ctrl+Shift+O` - Go to symbol in file
- `Shift+Alt+F` - Format document

### Structure View Features

**Follow Cursor**:
- Right-click in Structure View
- Toggle "Enable/Disable Follow Cursor"
- Auto-selects symbol at cursor position

**Filtering**:
- Type to filter visible symbols
- Find specific procedures quickly

### Solution View Features

**File Management**:
- Right-click to add/remove files from projects
- Drag and drop support (where applicable)

**Recent Solutions**:
- Quick access to last 20 solutions
- Shows last opened timestamp
- One-click reopening

---

## Troubleshooting

### Solution Not Detected

**Problem**: Solution View shows "No Solutions Detected"

**Solutions**:
1. Ensure `.sln` file exists in folder
2. Use **Browse for Solution** to manually select
3. Check file permissions

### Build Errors Not Showing

**Problem**: Build errors don't appear in Problems pane

**Solutions**:
1. Verify `clarion.clarionBinPath` is correct
2. Check that MSBuild is accessible
3. Review output in **Clarion Generator** channel

### ClarionCl.exe Not Found

**Problem**: "ClarionCl.exe not found" error when generating

**Solutions**:
1. Verify Clarion installation path
2. Update `clarion.clarionBinPath` in settings
3. Ensure ClarionCl.exe exists in BIN directory

### Redirection Files Not Working

**Problem**: Files not found despite redirection

**Solutions**:
1. Verify `.clarion.properties` path is correct
2. Check redirection syntax in properties file
3. Ensure redirected paths exist on disk

### Extension Not Activating

**Problem**: Clarion Tools sidebar not appearing

**Solutions**:
1. Open a folder containing `.clw` files
2. Manually activate with `Ctrl+Shift+P` → "Clarion: Open Solution"
3. Check VS Code Developer Tools (Help → Toggle Developer Tools) for errors

### Performance Issues

**Problem**: Extension slow with large files

**Solutions**:
1. Ensure you're on latest version (caching improvements in v0.7.1+)
2. Disable Follow Cursor if causing issues
3. Close unused editors
4. Report issue on GitHub with file size details

---

## Getting Help

### Resources

- [Features Documentation](FEATURES.md) - Complete feature list
- [Cheat Sheet](CheatSheet.md) - Quick reference
- [Clarion Knowledge Base](clarion-knowledge-base.md) - Language reference
- [GitHub Issues](https://github.com/msarson/Clarion-Extension/issues) - Report bugs or request features

### Community

This is an **active project** looking for contributors! Whether you are a Clarion developer, VS Code enthusiast, or interested in open-source projects, your contributions, bug reports, and feedback are welcome.

- **Issues**: [GitHub Issues](https://github.com/msarson/Clarion-Extension/issues)
- **Discussions**: Use GitHub Discussions for questions
- **Contributing**: See repository for contribution guidelines

---

## Next Steps

Now that you're set up:
1. Explore the [Features Documentation](FEATURES.md)
2. Try the [Cheat Sheet](CheatSheet.md) for quick reference
3. Configure settings for your workflow
4. Report any issues or suggest improvements!

Happy coding! 🎉
