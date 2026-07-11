# Getting Started with the Clarion Extension for VS Code

This guide will help you get up and running with the Clarion Extension for VS Code, showing you how to use all of its powerful features to enhance your Clarion development experience.

## Table of Contents

- [Installation](#installation)
- [Welcome Screen and Opening a Clarion Solution](#welcome-screen-and-opening-a-clarion-solution)
- [Solution Explorer View](#solution-explorer-view)
- [Document Symbols and Navigation](#document-symbols-and-navigation)
- [Editor Features](#editor-features)
  - [Snippets](#snippets)
  - [Code Folding](#code-folding)
- [Document Links and Redirection System](#document-links-and-redirection-system)
- [Building Clarion Applications](#building-clarion-applications)
- [Color Support](#color-support)
- [Troubleshooting](#troubleshooting)
- [Additional Resources](#additional-resources)

## Installation

Before you begin, ensure you have the following prerequisites:

1. **Visual Studio Code** (latest version recommended)

To install the Clarion Extension:

1. Open **Visual Studio Code**
2. Go to the **Extensions Marketplace** (`Ctrl+Shift+X`)
3. Search for **Clarion Extension**
4. Click **Install**
5. Restart VS Code if needed

> **Note:** The Fushnisoft Clarion Extension, which provides base language support, will be automatically installed as a dependency.

## Welcome Screen and Opening a Clarion Solution

The new **Welcome Screen** provides a friendly landing page when no Clarion solution is open. From here you can:

- **Open a New Solution** – Browse for a `ClarionProperties.xml` file and select the Clarion version you're using.
- **Open Solution from List** – Quickly reopen a solution that’s already associated with your saved workspace.
- Access helpful links like the **Getting Started** guide.

### How to Use the Welcome Screen

1. **Open the Welcome Screen**
   - It appears automatically if no solution is open.
   - If it doesn’t, you can refresh the Clarion sidebar or reload the window.

2. **Open a New Solution**
   - Click **"Open a New Solution"**.
   - Browse to your `ClarionProperties.xml` file (usually in `%appdata%\SoftVelocity\ClarionVersion\`).
   - Select your Clarion version.
   - Done! The solution and its projects will now appear in the Solution Explorer.

3. **Open Solution from List**
   - Click **"Open Solution from List"**.
   - Select a previously opened solution from the current VS Code workspace.
   - This is the quickest way to resume work.

4. **Workspace Requirement**
   - The extension requires a saved VS Code workspace (`.code-workspace` file) to function properly.
   - Use **File > Save Workspace As...** to save one if you haven’t already.

### Welcome Panel Image

![Welcome Panel](./WelcomePanel.png)

If you do not see the Welcome screen, make sure no solution is currently open and try refreshing the Clarion sidebar view.


---

## Solution Explorer View

The Solution Explorer View provides a hierarchical view of your Clarion solution, projects, and source files:

1. **Accessing the Solution Explorer**
   - Click on the **Clarion Tools** icon in the Activity Bar (left side of VS Code)
   - Or use the Command Palette (`Ctrl+Shift+P`) and search for "Clarion: Show Solution Explorer"

2. **Navigating the Solution Structure**
   - Solutions are displayed at the top level
   - Projects are nested under solutions
   - Source files are nested under projects

3. **Context Menu Actions**
   - Right-click on a solution to build the entire solution
   - Right-click on a project to build just that project
   - Right-click on a file to open it
   - Solutions can also be **closed** from the tree view

## Document Symbols and Navigation

The Clarion Extension provides powerful navigation features to help you move around your codebase efficiently:

1. **Structure View**
   - Access the Outline view by clicking the "Outline" button in the Explorer sidebar
   - The Outline view shows the structure of your Clarion file, including:
     - Procedures
     - Classes and methods
     - Variables
     - Structures (WINDOW, SHEET, TAB, GROUP, QUEUE, etc.)

2. **Breadcrumbs Navigation**
   - Breadcrumbs appear at the top of the editor, showing your current location in the file's structure
   - Click on any part of the breadcrumb to navigate to that section or see a dropdown of siblings

3. **Go To Definition**
   - Press `F12` or `Ctrl+Click` on any symbol to navigate to its definition
   - This works for:
     - `INCLUDE` statements
     - `MODULE` statements

4. **Quick Open with Redirection Support**
   - Press `Ctrl+P` to open the Quick Open dialog
   - Type the name of a file to find it
   - The search respects local and global redirection files, so you'll find the correct version of the file

## Editor Features

### Snippets

The Clarion Extension provides a rich set of snippets to speed up your coding:

1. **Variable Declaration Snippets**
   - `VS` - Declare a string variable: `Bar String(10)`
   - `RVS` - Declare a reference to a string: `Bar &String`
   - `PVS` - Declare a string parameter: `(STRING Foo)`
   - `PVRS` - Declare a reference to a string parameter: `(*STRING Foo)`
   - Many more variable types are available with similar patterns

2. **Language Structure Snippets**
   - `IF` - Create an IF-THEN-END block
   - `IFE` - Create an IF-THEN-ELSE-END block
   - `MAP` - Create a MAP-END block
   - `MODULE` - Create a MODULE-END block
   - `LOOP` - Create a LOOP-END block
   - `LOOPFT` - Create a LOOP FROM-TO-END block
   - `LOOPFILE` - Create a LOOP for file access

3. **Class and Procedure Snippets**
   - `DCLASS` - Define a class
   - `DCLASSCD` - Define a class with constructor and destructor
   - `IClass` - Implement a class
   - `IClassCD` - Implement a class with constructor and destructor
   - `Method` - Implement a class method
   - `DProc` - Define a procedure
   - `IProc` - Implement a procedure

4. **Using Snippets**
   - Type the snippet shortcut and press `Tab` to expand it
   - Use `Tab` to navigate between placeholders in the expanded snippet
   - Fill in the placeholders with your code

### Code Folding

Code folding allows you to collapse sections of code to focus on what's important:

1. **Automatic Folding Regions**
   - The extension automatically detects foldable regions in your code:
     - Procedures
     - Classes
     - MAP blocks
     - MODULE blocks
     - IF-THEN-END blocks
     - LOOP blocks
     - And more

2. **Folding Controls**
   - Click the small arrow next to the line number to fold/unfold a region
   - Use `Ctrl+Shift+[` to fold the current region
   - Use `Ctrl+Shift+]` to unfold the current region
   - Use `Ctrl+K Ctrl+0` to fold all regions
   - Use `Ctrl+K Ctrl+J` to unfold all regions

## Document Links and Redirection System

The Clarion Extension provides intelligent document linking that respects Clarion's redirection system:

1. **Clickable Links**
   - `INCLUDE` statements become clickable links to the included file
   - `MODULE` statements become clickable links to the module file
   - `MEMBER` statements become clickable links to the member file
   - `LINK` statements become clickable links to the linked file

2. **Hover Information**
   - Hover over an `INCLUDE`, `MODULE`, or other link to see a preview of the file's contents
   - The preview shows the first 10 lines of the file

3. **Redirection-Aware File Resolution**
   - The extension respects both local and global redirection files
   - When you click on a link, it will open the correct version of the file based on redirection rules
   - This ensures you're always working with the right file, even in complex project structures

4. **How Redirection Works**
   - The extension parses your solution's redirection files to build a map of file locations
   - When you reference a file (via `INCLUDE`, `MODULE`, etc.), the extension:
     1. Checks local redirection rules first
     2. Falls back to global redirection rules if needed
     3. Uses the original path as a last resort

## Building Clarion Applications

The Clarion Extension integrates with Clarion's build system to compile your applications directly from VS Code:

1. **Build Configuration**
   - Switch between build configurations using the "Clarion: Set Configuration" command
   - The current configuration is displayed in the status bar
   - Build configurations are defined in the solution file (typically DEBUG and RELEASE, but custom configurations are supported)
   - These configurations correspond to sections in redirection files (e.g., [DEBUG], [RELEASE]) for conditional file inclusion

2. **Building a Solution or Project**
   - Press `Ctrl+Shift+B` to build the current solution
   - If multiple projects exist, you'll be prompted to choose which one to build
   - Alternatively, right-click on a solution or project in the Solution Explorer and select "Build"

3. **Build Output**
   - Build progress and results are displayed in the Problems panel
   - Errors and warnings are highlighted with line numbers for easy navigation
   - Click on an error to jump to the relevant location in your code

4. **Build Task Configuration**
   - The extension automatically configures the necessary build tasks
   - You can customize build tasks in the `.vscode/tasks.json` file if needed

## Color Support

The Clarion Extension provides enhanced support for Clarion's COLOR keyword:

1. **Color Visualization**
   - COLOR values in your code are highlighted with their actual color
   - This works for both hex values (like `0FF0000H`) and named colors (like `COLOR:BLUE`)

2. **Color Picker**
   - Click on a COLOR value to open the color picker
   - Select a new color visually
   - The extension will automatically convert the color to the appropriate Clarion format

3. **Supported Color Formats**
   - Hex values (e.g., `0FF0000H`)
   - Named colors (e.g., `COLOR:BLUE`, `COLOR:RED`, etc.)
   - System colors (e.g., `COLOR:BTNFACE`, `COLOR:WINDOW`, etc.)

## Troubleshooting

### Snippet Descriptions Not Showing

If snippets are not appearing correctly, update your VS Code settings:

```json
"editor.snippetSuggestions": "top",
"editor.suggest.showSnippets": true,
"editor.suggest.snippetsPreventQuickSuggestions": false
```

### Solution Explorer Not Showing Projects

If the Solution Explorer is not showing your projects:

1. Ensure you've opened the solution using "Clarion: Open Solution"
2. Check that your solution file (.sln) is valid
3. Try refreshing the Solution Explorer
4. Restart VS Code if the issue persists

### Build Errors

If you encounter build errors:

1. Check that the Clarion version selected matches the one used by your project
2. Ensure all required Clarion components are installed
3. Verify that the project paths are correct
4. Check the Problems panel for specific error messages

## Additional Resources

- [Cheat Sheet](https://github.com/msarson/Clarion-Extension/blob/master/docs/CheatSheet.md) - Quick reference for snippets and features
- [GitHub Repository](https://github.com/msarson/Clarion-Extension) - Report issues or contribute to the extension
- [Marketplace Page](https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extensions) - Latest updates and version information