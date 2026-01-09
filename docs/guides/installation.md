# Installation Guide

Complete setup instructions for the Clarion Extension.

## Requirements

### Software Requirements
- **Visual Studio Code** v1.60.0 or later (latest version recommended)
- **Clarion** installed on your system (for compilation features)
  - Clarion 6.3 or later supported
  - Clarion 11 recommended

### Operating System
- Windows 7 or later
- Windows 10/11 recommended

---

## Quick Installation

### Step 1: Install from VS Code Marketplace

1. Open **Visual Studio Code**
2. Press `Ctrl+Shift+X` to open the Extensions view
3. Search for **"Clarion Extensions"** by msarson
4. Click the **Install** button
5. Restart VS Code if prompted

**That's it!** The extension is now installed.

---

### Step 2: Verify Installation

1. Open any `.clw` file (or create a new one)
2. Check the bottom-right status bar - you should see **"Clarion"** indicating the language mode
3. Syntax highlighting should be active

If you don't see this, try:
- Restarting VS Code
- Manually setting language mode: Click the language indicator → Select "Clarion"

---

## Configuration

### First-Time Setup

When you open a Clarion solution for the first time, the extension will prompt you to configure:

#### 1. Clarion Version/Path
- **What it's for:** Locates `ClarionCl.exe` for compilation
- **When prompted:** Select your Clarion installation folder
- **Example:** `C:\Clarion11\Bin`

**Manual configuration:**
1. Press `Ctrl+Shift+P`
2. Type "Clarion: Set Clarion Path"
3. Browse to your Clarion BIN directory

#### 2. Clarion Properties File
- **What it's for:** Redirection configuration (where to find included files)
- **When prompted:** Select your `.clarion.properties` file
- **Can be:** Project-specific or global

**Manual configuration:**
1. Press `Ctrl+Shift+P`
2. Type "Clarion: Set Clarion Properties"
3. Browse to your properties file

#### 3. Build Configuration
- **What it's for:** Debug vs Release builds
- **When prompted:** Select **Release** or **Debug**
- **Default:** Release

**Manual configuration:**
- Click the configuration in the status bar (bottom-right)
- Or press `Ctrl+Shift+P` → "Clarion: Set Configuration"

---

### Settings Storage

All settings are saved in `.vscode/settings.json` within your solution folder:

```json
{
  "clarion.clarionPath": "C:\\Clarion11\\Bin",
  "clarion.propertiesPath": "C:\\MyProject\\.clarion.properties",
  "clarion.configuration": "Release|Win32"
}
```

**Benefits:**
- Settings persist when reopening the solution
- Settings can be committed to version control
- Team members share the same configuration

---

## Upgrading

### From v0.7.2 or Earlier (Workspace File Changes)

**What changed in v0.7.3:**
- Extension now uses **folder-based workflow** instead of workspace files
- Settings stored in `.vscode/settings.json` instead of `.code-workspace` files
- Simpler: Just **File → Open Folder** (no workspace files needed)

**Migration:**
- Your old `.code-workspace` files still work
- But you can now simply open the folder containing your solution
- Settings automatically migrate to `.vscode/settings.json`
- **Recommendation:** Switch to folder-based workflow

### From v0.6.x or Earlier (fushnisoft.clarion)

**Important:** If you have the **fushnisoft.clarion** extension installed:

1. **Uninstall BOTH** extensions:
   - fushnisoft.clarion
   - msarson.clarion-extensions
2. **Reinstall** only msarson.clarion-extensions v0.7.0 or later

**Why:** Older versions had a dependency on fushnisoft.clarion that prevents individual uninstallation. All syntax highlighting is now included - you no longer need fushnisoft.clarion.

---

## Advanced Configuration

### Customize IntelliSense Behavior

```json
{
  "editor.quickSuggestions": {
    "comments": false,
    "strings": true,
    "other": true
  },
  "editor.acceptSuggestionOnCommitCharacter": true,
  "editor.acceptSuggestionOnEnter": "on"
}
```

### Disable Unreachable Code Dimming

```json
{
  "clarion.unreachableCode.enabled": false
}
```

### Configure Paste as Clarion String

```json
{
  "clarion.pasteAsClarionString.lineTerminator": "crlf",  // "space", "crlf", or "none"
  "clarion.pasteAsClarionString.trimLeading": true
}
```

### Customize Diagnostics

```json
{
  "clarion.diagnostics.enabled": true,
  "clarion.diagnostics.validateStructures": true,
  "clarion.diagnostics.validateFiles": true
}
```

**[See all settings →](../reference/settings.md)**

---

## Workspace Setup

### Recommended Folder Structure

```
MyProject/
├── .vscode/
│   └── settings.json          # Extension settings
├── MySolution.sln              # Solution file
├── MyApp.app                   # Application
├── MyApp.clw                   # Source files
├── includes/                   # Include files
└── .clarion.properties         # Redirection (optional)
```

### Opening Solutions

**Method 1: Open Folder** (Recommended)
1. **File → Open Folder** (`Ctrl+K Ctrl+O`)
2. Select folder containing `.sln` file
3. Extension auto-detects solution

**Method 2: Browse for Solution**
1. Open **Clarion Tools** sidebar
2. Click **"Browse for Solution"**
3. Navigate to `.sln` file

**Method 3: Recent Solutions**
1. Open **Clarion Tools** sidebar
2. Click any solution from **Recent Solutions** list

---

## Troubleshooting Installation

### Extension Not Activating

**Symptoms:**
- No syntax highlighting
- No status bar items
- No IntelliSense

**Solutions:**
1. Check extension is installed and enabled:
   - `Ctrl+Shift+X` → Search "Clarion Extensions"
   - Should show "Enabled"
2. Restart VS Code
3. Open a `.clw` file to trigger activation
4. Check Output panel: `View → Output` → Select "Clarion Extension"

---

### Clarion Path Not Found

**Symptoms:**
- Build fails with "ClarionCl.exe not found"

**Solutions:**
1. Manually set Clarion path:
   - `Ctrl+Shift+P` → "Clarion: Set Clarion Path"
   - Browse to Clarion BIN folder (e.g., `C:\Clarion11\Bin`)
2. Check `settings.json`:
   ```json
   {
     "clarion.clarionPath": "C:\\Clarion11\\Bin"
   }
   ```
3. Ensure path uses double backslashes (`\\`)

---

### IntelliSense Not Working

**Symptoms:**
- No code completion
- No function hints

**Solutions:**
1. Check file extension is `.clw`, `.inc`, or `.equ`
2. Ensure solution is opened correctly (folder with `.sln`)
3. Try reloading window:
   - `Ctrl+Shift+P` → "Developer: Reload Window"
4. Check Output panel for errors

---

### Multiple Clarion Versions

If you have multiple Clarion versions installed:

1. Set the path explicitly in settings:
   ```json
   {
     "clarion.clarionPath": "C:\\Clarion11\\Bin"
   }
   ```
2. Or use the picker:
   - `Ctrl+Shift+P` → "Clarion: Set Clarion Path"
   - Select the version you want to use

---

## Next Steps

**Now that you're installed:**

- **[Quick Start Guide](quick-start.md)** - Get coding in 5 minutes
- **[Common Tasks](common-tasks.md)** - Learn everyday workflows
- **[Navigation Features](../features/navigation.md)** - Master F12 and Ctrl+F12

---

## Need Help?

- **[Common Tasks](common-tasks.md)** - How-to recipes
- **[GitHub Issues](https://github.com/msarson/Clarion-Extension/issues)** - Report bugs
- **[Discussions](https://github.com/msarson/Clarion-Extension/discussions)** - Ask questions

