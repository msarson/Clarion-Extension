# Solution Management

Working with Clarion solutions, projects, and build configurations in VS Code.

## Overview

The Clarion Extension provides native solution management:

- **Automatic solution detection** - Just open a folder
- **Solution Explorer** - Navigate projects and files
- **Recent solutions** - Quick access to your last 20 solutions
- **Build integration** - Generate applications from VS Code
- **No workspace files needed** - Settings stored with solution

---

## Opening Solutions

### Method 1: Open Folder (Recommended)

**Simple two-step process:**

1. **File → Open Folder** (or press `Ctrl+K Ctrl+O`)
2. Browse to folder containing your `.sln` file
3. Click **Select Folder**

**Then in Clarion Tools sidebar:**

4. Extension scans and shows "X Solution(s) Found"
5. Click the **▶** solution name to open it
6. First-time: Configure Clarion path and settings (see Configuration section)

**Why this works:**
- Extension automatically scans folder for `.sln` files
- Shows all detected solutions in **Clarion Tools** sidebar
- Click to open and configure

---

### Method 2: Browse for Solution

**If `.sln` file is elsewhere:**

1. Open **Clarion Tools** icon in Activity Bar (left sidebar)
2. In **Solution View**, click **"📂 Browse for Solution..."**
3. Navigate to your `.sln` file
4. Click **Open**

The containing folder opens automatically, and the solution is loaded.

---

### Method 3: Recent Solutions

**Quick access to previously opened solutions:**

1. Open **Clarion Tools** sidebar
2. In **Solution View**, expand **"Recent Solutions"**
3. Click any solution name

**Features:**
- Remembers last 20 solutions
- Shows last opened timestamp
- Automatically validates (removes invalid paths)
- Global list (works across all folders)

---

## Solution Explorer

### Solution View Structure

```
Clarion Tools
├── Solution View
│   ├── MySolution.sln
│   │   ├── MyApplication.cwproj
│   │   │   ├── MyApp.app
│   │   │   ├── MyApp.clw
│   │   │   └── includes/
│   │   │       └── MyFile.inc
│   │   └── MyLibrary.cwproj
│   │       └── MyLib.clw
│   └── Recent Solutions
│       ├── ProjectA (Last opened: 2026-01-08)
│       └── ProjectB (Last opened: 2026-01-05)
```

---

### Navigation Features

**Click to open files:**
- Single-click: Selects file
- Double-click: Opens file in editor

**Context menu (right-click):**
- **Generate Application** - Build selected app
- **Open in Explorer** - Show file in Windows Explorer
- **Copy Path** - Copy full file path

**Expand/collapse:**
- Click arrows to expand/collapse projects
- Shows hierarchical structure

---

## Configuration

### First-Time Setup

When opening a solution for the first time, you'll configure:

#### 1. Clarion Path
**What:** Path to Clarion BIN directory  
**Used for:** Building with `ClarionCl.exe`

**Example:** `C:\Clarion11\Bin`

**Set manually:**
- `Ctrl+Shift+P` → "Clarion: Set Clarion Path"

---

#### 2. Clarion Properties File
**What:** `.clarion.properties` file for redirection  
**Used for:** Finding included files

**Can be:**
- Project-specific: `C:\MyProject\.clarion.properties`
- Global: `C:\Clarion11\.clarion.properties`

**Set manually:**
- `Ctrl+Shift+P` → "Clarion: Set Clarion Properties"

---

#### 3. Build Configuration
**What:** Debug or Release build  
**Default:** Release|Win32

**Change anytime:**
- Click configuration in status bar (bottom)
- Or: `Ctrl+Shift+P` → "Clarion: Set Configuration"

---

### Settings Storage

**All settings saved in `.vscode/settings.json` within solution folder:**

```json
{
  "clarion.clarionPath": "C:\\Clarion11\\Bin",
  "clarion.propertiesPath": "C:\\MyProject\\.clarion.properties",
  "clarion.configuration": "Release|Win32"
}
```

**Benefits:**
- Persists when reopening solution
- Can be committed to version control
- Team members share same configuration

---

## Build Integration

### Building Applications

#### From Solution View (Recommended)
1. In **Clarion Tools** sidebar, find your application
2. Right-click on the `.app` file
3. Click **"Generate Application"**
4. Build output appears in terminal

---

#### Using Keyboard Shortcut
1. Make sure a `.app` file is open or selected
2. Press **Ctrl+Shift+B**
3. Build starts automatically

---

#### From Command Palette
1. Press `Ctrl+Shift+P`
2. Type "Clarion: Generate Application"
3. Select your application (if multiple)

---

### Build Output

**Live output in integrated terminal:**
- Compilation progress
- Error messages (in red)
- Warnings (in yellow)
- Success message

**Click errors to jump to source:**
- Error messages show file and line number
- Click to open file at error location

---

### Build Configurations

**Available configurations:**
- **Debug|Win32** - Debug build, 32-bit
- **Release|Win32** - Release build, 32-bit
- **Debug|x64** - Debug build, 64-bit
- **Release|x64** - Release build, 64-bit

**Switch configuration:**
1. Click current config in status bar (e.g., "Release|Win32")
2. Select new configuration from dropdown

**Or:**
1. `Ctrl+Shift+P` → "Clarion: Set Configuration"
2. Select configuration

---

### Build Troubleshooting

#### "ClarionCl.exe not found"

**Fix:**
1. `Ctrl+Shift+P` → "Clarion: Set Clarion Path"
2. Browse to Clarion BIN folder
3. Try building again

---

#### "Solution not found"

**Fix:**
1. Make sure folder contains `.sln` file
2. Reopen folder: **File → Open Folder**
3. Check **Clarion Tools** sidebar shows solution

---

#### Build errors

**Check:**
1. Terminal output for specific error messages
2. File paths are correct
3. Redirection files configured properly
4. All include files are accessible

---

## Redirection Files

### What Are Redirection Files?

Clarion uses `.clarion.properties` files to map logical paths to physical paths.

**Example:**
```properties
# Redirections
%CW% = C:\Clarion11
%INCLUDE% = %CW%\Accessory\Libsrc
```

---

### Types of Redirection

#### Global Redirection
**Location:** Clarion installation folder  
**Example:** `C:\Clarion11\.clarion.properties`  
**Used for:** System-wide paths like `%CW%`

#### Local Redirection
**Location:** Project folder  
**Example:** `C:\MyProject\.clarion.properties`  
**Used for:** Project-specific paths

---

### Configuring Redirection

**Set properties file path:**
1. `Ctrl+Shift+P` → "Clarion: Set Clarion Properties"
2. Browse to `.clarion.properties` file
3. Saved in `.vscode/settings.json`

**Manual configuration:**
```json
{
  "clarion.propertiesPath": "C:\\MyProject\\.clarion.properties"
}
```

---

## Multi-Solution Support

### Working with Multiple Solutions

**VS Code limitation:** Only one folder open at a time

**Workflow:**
1. Open first solution folder
2. Work on it
3. **File → Open Folder** to open second solution
4. First solution closes automatically

**Tip:** Use **Recent Solutions** list to quickly switch between solutions.

---

## Solution Management Commands

### Available Commands

**Access via `Ctrl+Shift+P`:**

- **Clarion: Set Clarion Path** - Configure Clarion installation
- **Clarion: Set Clarion Properties** - Configure properties file
- **Clarion: Set Configuration** - Change Debug/Release
- **Clarion: Generate Application** - Build application
- **Clarion: Show Extension Status** - Health check
- **Clarion: Refresh Solution** - Reload solution tree

---

## Status Bar

### Clarion Status Items

**Bottom-right status bar shows:**

1. **Clarion Version** - e.g., "Clarion 11"
   - Click to change Clarion path

2. **Build Configuration** - e.g., "Release|Win32"
   - Click to change configuration

3. **Current Document** - File name and language mode

---

## Tips & Tricks

### Quick Solution Switching
- Keep **Clarion Tools** sidebar visible
- Use **Recent Solutions** list for one-click access
- Pin frequently-used solutions to File menu

### Workspace Organization
```
MySolution/
├── .vscode/
│   └── settings.json    ← Solution-specific settings
├── .clarion.properties  ← Local redirections
├── MySolution.sln
├── MyApp.app
└── MyApp.clw
```

### Team Collaboration
- Commit `.vscode/settings.json` to version control
- Use relative paths where possible
- Document redirection setup in README

### Terminal Management
- Build output uses dedicated terminal
- Terminal reused for subsequent builds
- Multiple terminals don't stack up

---

## Related Features

- **[Installation Guide](../guides/installation.md)** - Initial setup
- **[Common Tasks](../guides/common-tasks.md)** - Building recipes
- **[Settings Reference](../reference/settings.md)** - All configuration options

