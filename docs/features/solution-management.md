# Solution Management

[← Back to Documentation Home](../../README.md)

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

### Method 4: Create New Solution (Wizard)

**Make a new solution:** click the **`+`** button in the Solution View toolbar, or run `Clarion: New Solution` from the Command Palette (`Ctrl+Shift+P`). One page asks everything:

- **Folder:** the open folder to start with; **Choose folder…** picks another, or creates one. Made in another folder, the window then opens that folder with the solution.
- **Build with:** the Clarion installation, compiler version and configuration. **Browse…** finds an installation outside the standard locations.
- **Start from:** the programs already in the folder, or a new empty program.
  - **From the programs:** the page shows one project per program, as an EXE or a DLL, with its sources, the projects it references and its export file. It also lists the modules it could not place and possible leftovers, so you can settle them before anything is written.
  - **A new empty program:** name its main source file. The solution gets one project, `SolutionName.cwproj`, and a starter `.clw` with `PROGRAM` and `CODE`.
- **Solution name**, then **Create**.

The solution opens as soon as it is created.

---

## Solution Explorer

### Solution View Structure

```
Clarion Tools
├── Solution View
│   ├── MySolution.sln
│   │   ├── MyApplication.cwproj
│   │   │   ├── File Drivers
│   │   │   │   └── TOPSPEED
│   │   │   ├── Libraries, Objects and Resource Files
│   │   │   ├── Projects to include
│   │   │   ├── Referenced Projects
│   │   │   │   └── MyLibrary
│   │   │   └── MyApp.clw
│   │   └── MyLibrary.cwproj
│   │       ├── File Drivers
│   │       ├── …
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

**A project's folders, as in the Clarion IDE:** each project shows **File Drivers**, **Libraries, Objects and Resource Files**, **Projects to include** (legacy TopSpeed `.prj`/`.pr` projects pulled into the build) and **Referenced Projects**, always, then its source files. Right-click a folder for **Add…** (also its `+` button) and an entry for **Remove**; the change is saved to the `.cwproj` at once, as the IDE does. A click on a folder opens Project Properties on its Sources tab, on a referenced project its own Project Properties, on an included project its file.

**Projects sorted by build order:** Projects in the Solution View are ordered dependency-first (libraries before the applications that depend on them), matching the actual build order.

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

#### 1. Clarion Version

**What:** which installed Clarion the solution is edited and built with.

The extension reads `ClarionProperties.xml` — the file the Clarion IDE itself writes, normally under `%APPDATA%\SoftVelocity\Clarion\<major>\` — and lists every version registered there, by the name you gave it in the IDE ("Clarion 11.1", "Clarion 10 Dev", …). Everything else follows from that pick: the `bin` folder used to build, the redirection (`.red`) file used to resolve includes, and the libsrc search paths.

**Set or change it:**
- `Ctrl+Shift+P` → **Clarion: Set Version**
- Or click the version in the status bar

If only one version is registered you are still asked which properties file to use, because a machine can have more than one.

**Changing the version while the solution is open** is supported and takes effect at once: the editor and the build both follow the new install, without reloading the window. A version that `ClarionProperties.xml` no longer registers — renamed or uninstalled since you last opened the solution — is reported rather than silently used, with an offer to pick a current one.

**Remembered per solution:** the version you pick is stored against that solution, so opening a solution that builds with 11.1 and another that builds with 10 does not mean re-picking each time.

---

#### 2. Build Configuration
**What:** Debug or Release build  
**Default:** Release|Win32

The active build configuration is now **auto-detected from the `.sln.cache` file** when the solution is opened — it no longer defaults to the first config in the list.

**Change anytime:**
- Click configuration in status bar (bottom)
- Or: `Ctrl+Shift+P` → "Clarion: Set Configuration"

---

### Settings Storage

**Written automatically when you open a solution and pick a Clarion version:**

```json
{
  "clarion.solutionFile": "C:\\MyProject\\MySolution.sln",
  "clarion.propertiesFile": "C:\\Users\\you\\AppData\\Roaming\\SoftVelocity\\Clarion\\11.0\\ClarionProperties.xml",
  "clarion.version": "Clarion 11.1",
  "clarion.configuration": "Release"
}
```

**Benefits:**
- Persists when reopening the solution
- Can be committed to version control
- Team members share the same configuration

#### Where they are written

- **A plain folder** — `.vscode/settings.json` inside the folder.
- **A `.code-workspace` file** — the workspace file, not the folder. Reads and writes both go to the same place, so a version or configuration you pick sticks instead of appearing to revert on the next reload.

#### Settings an older version left in a folder

Before v1.0.4 these settings could be written into a folder's `.vscode/settings.json` even when the workspace was opened from a `.code-workspace` file. VS Code gives the folder copy priority, so the workspace file's values are silently ignored and the solution keeps opening with the old version or configuration.

When that is detected, the extension says which settings are shadowed and offers to remove the folder copies for you — take the offer, and the `.code-workspace` values take over immediately. It asks once per session, and it never touches settings that agree with the workspace file.

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

**Live output in the Clarion Build output channel**, which opens without taking focus:
- A header saying what is being built, in which configuration, and the exact MSBuild command line — so a Release build started by mistake is visible at a glance
- Compilation progress
- Error messages (in red)
- Warnings (in yellow)
- A result message that names the configuration too

**Click errors to jump to source:**
- Error messages show file and line number
- Click to open the file at the error location

`clarion.build.showInOutputPanel`, `clarion.build.revealOutput`, `clarion.build.preserveLogFile` and `clarion.build.logFilePath` control where the output goes and whether the log is kept.

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
1. `Ctrl+Shift+P` → **"Clarion: Set Version"** and pick the version this solution builds with
2. If it is missing from the list, it is no longer registered in `ClarionProperties.xml` — re-register it in the Clarion IDE, or browse to another properties file
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

A redirection file (`.red`) tells Clarion where to look for each kind of file — sources, includes, libraries, generated output — as a list of search folders per extension. The extension parses the same file the compiler uses, so what resolves in the editor is what compiles.

**Example:**
```
[Debug]
-- Directories only used when building with Debug configuration
*.obj = obj\debug
*.lib = obj\debug

[Common]
*.clw = .; %ROOT%\libsrc\win
*.inc = .; %ROOT%\libsrc\win; %ROOT%\Accessory\libsrc\win
*.*   = .; %ROOT%\libsrc\win; %ROOT%\images; %ROOT%\template\win
```

Supported as the compiler supports them: `[Common]` plus name-matched sections, `{include}` of another `.red`, per-configuration sections, and the `%ROOT%` / `%BIN%` / `%THISDIR%` family of macros. A `.red` lists **directories** to search, never file names.

---

### Which Redirection File Is Used

**One per Clarion version:** the version's `ClarionProperties.xml` names its redirection file (for example `Clarion110.red`), and a solution or project may point at its own.

**In a multi-project solution**, a name is resolved through the redirection of *the project that compiles the file you are editing* — so two projects that each keep their own copy of a shared class header each resolve to their own copy, as the compiler does.

---

### Configuring Redirection

Redirection comes from the selected **Clarion version** — its `ClarionProperties.xml` names the redirection file (e.g. `Clarion110.red`), and the extension parses it (including per-configuration sections and included `.red` files) exactly as the Clarion IDE does.

**Set the version:**
1. `Ctrl+Shift+P` → **"Clarion: Set Version"**
2. Pick the installed version — the extension reads its `ClarionProperties.xml`

**A configuration kept outside `%APPDATA%`:** installation discovery scans `%APPDATA%\SoftVelocity\Clarion`, which is where the IDE writes its settings — but a `ClarionProperties.xml` can live anywhere, for example in a checked-out tree that carries its own IDE settings and is opened with `/ConfigDir=`. For that case:

- The installation list ends with **Browse for ClarionProperties.xml…**, so any file can be chosen even when a normal install was also found.
- Opening a solution offers **Select Different Configuration…** before adopting the current one (Enter or Esc keeps it).
- While a non-default file is active, Solution Properties names its folder, and builds pass the same directory to MSBuild as `ConfigDir`, so what you see is what compiles.

**Manual configuration:**
```json
{
  "clarion.propertiesFile": "C:\\Clarion11\\bin\\ClarionProperties.xml",
  "clarion.version": "Clarion 11.1"
}
```

---

## Multi-Solution Support

### Working with Multiple Solutions

**One solution is active at a time**, whatever the window contains.

**Workflow:**
1. Open the first solution folder
2. Work on it
3. **File → Open Folder** to open the second solution
4. The first solution closes automatically

**Tip:** use the **Recent Solutions** list to switch quickly.

**Multi-root workspaces** (a `.code-workspace` file with several folders) are supported: the solution settings live in the workspace file, so a version or configuration you pick applies to the window rather than to whichever folder happened to be first. See [Settings an older version left in a folder](#settings-an-older-version-left-in-a-folder) if picks seem to revert.

---

## Solution Management Commands

### Available Commands

**Access via `Ctrl+Shift+P`:**

- **Clarion: Open Solution...** - the main entry point: detected solutions, browse, or recents
- **Clarion: Set Version** - pick the installed Clarion this solution uses
- **Clarion: Set Configuration** - change Debug/Release
- **Clarion: Generate Application** - generate an app's source
- **Clarion: Show Extension Status** - health check
- **Clarion: Refresh Solution** - re-read the `.sln` and projects
- **Clarion: Set Log Level** - raise logging while reproducing a problem

The full list is in the **[Commands Reference](../reference/commands.md)**.

---

## The Solution View's Title Bar

With a solution open, the Solution View's title bar has **Build**, **Run** (Ctrl+F5), **Debug** (F5) and **Solution Properties** (the gear). Its `…` menu has Build and Run, Build and Debug, Open in Clarion IDE, Refresh Solution, Open Solution List, Close Solution, and the tree's Filter, Clear Filter and sort order.

With no solution open, the view offers Open Solution, a recent solution, and, with a folder open, New Solution.

## Solution Properties

**Solution Properties** (the gear, the solution node's menu, or **Clarion: Solution Properties**) opens a page for the open solution. Changes apply at once.

| Section | Shows |
|---|---|
| Build with | The Clarion installation (with the folder of a ClarionProperties.xml outside the standard location), the compiler version, the configuration and the startup project. **Browse…** finds an installation outside the standard locations |
| Projects | Each project's type (EXE, DLL or LIB), the projects it references, and for a DLL whether its export file is found through redirection. **Properties** opens the project's own page. **New project…** adds a project to the solution (its name, EXE or DLL, main source file, and optionally a folder below the solution's folder, such as `Libs\Orders`, made when it is missing; a DLL also gets its export file), and **Add an existing project…** adds a .cwproj from disk. A project in a sub-folder reads the redirection file in its own folder, else the one in Clarion's `bin`, not one beside the .sln; the add warns when that applies |
| Build and run | Whether the build log is kept (and the last one), what Run starts (`clarion.run.command`), and the Clarion build settings |
| File graph | Files, edges and build time, with a ⚠️ count when project sources cannot be found; **Unresolved file references…** opens that report |

The file graph line follows the graph: it updates when the graph is rebuilt after a project (`.cwproj`) or build configuration change. A source file added to or removed from a project while the solution is open is picked up then, without a reload.

**Open Solution** shows the same page when something has to be chosen: a solution with no remembered installation, compiler or configuration that works, when there is more than one to choose from. A solution whose remembered choice still works opens straight away.

---

## Status Bar

### Clarion Status Items

**The status bar shows:**

1. **Clarion Version** - e.g., "Clarion 11.1"
   - Click to pick a different registered version; the change applies at once, to the editor and the build

2. **Build Configuration** - e.g., "Release|Win32"
   - Click to change configuration

3. **Startup project**, when one is set - the target of `F5` / `Ctrl+F5`

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
│   └── settings.json    ← Solution-specific settings (folder workspaces)
├── MySolution.red       ← Project redirection, if the solution has its own
├── MySolution.sln
├── MyApp.app
└── MyApp.clw
```

### Team Collaboration
- Commit `.vscode/settings.json` — or the `.code-workspace` file — to version control
- Use relative paths where possible
- Document redirection setup in README
- Note that `clarion.version` names a version as *this machine* registered it, so a teammate whose install is registered under another name will be asked to pick once

### Terminal Management
- Build output uses dedicated terminal
- Terminal reused for subsequent builds
- Multiple terminals don't stack up

---

## Related Features

- **[Installation Guide](../guides/installation.md)** - Initial setup
- **[Common Tasks](../guides/common-tasks.md)** - Building recipes
- **[Settings Reference](../reference/settings.md)** - All configuration options

