# Quick Start Guide

Get up and running with the Clarion Extension in 5 minutes.

## Step 1: Install the Extension

1. Open **Visual Studio Code**
2. Press `Ctrl+Shift+X` to open Extensions
3. Search for **"Clarion Extensions"**
4. Click **Install**
5. Restart VS Code (if prompted)

✅ **Done!** The extension is now installed.

---

## Step 2: Open Your First Solution

**It's as simple as opening a folder:**

1. Click **File → Open Folder** (or press `Ctrl+K Ctrl+O`)
2. Browse to the folder containing your `.sln` file
3. Click **Select Folder**

The extension automatically detects your solution!

### Alternative: Use the Solution View

1. Click the **Clarion Tools** icon in the Activity Bar (left sidebar)
2. Click **"Browse for Solution"**
3. Navigate to and select your `.sln` file

---

## Step 3: Configure Clarion Path (First Time Only)

When you open a solution for the first time, you'll be prompted:

1. **Select Clarion Version**
   - Choose your Clarion installation (e.g., "Clarion 11")
   - This sets the path to `ClarionCl.exe` for building

2. **Select Build Configuration**
   - Choose **Release** or **Debug**
   - You can change this later

These settings are saved in `.vscode/settings.json` in your solution folder.

---

## Step 4: Start Using the Extension

### Navigate Your Code

**Go to Definition** (See where something is declared)
1. Click on any procedure, variable, or include
2. Press **F12**
3. You jump to its definition!

**Go to Implementation** (See the actual code)
1. Click on a MAP declaration
2. Press **Ctrl+F12**
3. Jump to the PROCEDURE implementation!

**Hover for Info**
- Hover your mouse over any symbol
- See documentation, file contents, or method signatures

### Use IntelliSense

1. Start typing a function name (e.g., `SUB`)
2. IntelliSense shows available functions
3. Arrow keys to select, **Tab** or **Enter** to insert
4. See parameter hints as you type

### Use Code Snippets

1. Type a snippet trigger (e.g., `IF`)
2. Press **Tab**
3. The full structure is inserted with placeholders

**Common snippets:**
- `IF` → IF/THEN/END
- `LOOP` → LOOP/END
- `MAP` → MAP/END
- `VS` → String variable
- `VL` → Long variable

**[See all snippets →](../reference/snippets.md)**

---

## Step 5: Build Your Application

### From Solution View:
1. In the **Clarion Tools** sidebar, find your application
2. Right-click on the app file
3. Click **"Generate Application"**
4. Watch the build progress in the terminal

### Using Keyboard:
- Press `Ctrl+Shift+B` to build

---

## Common Tasks

Now that you're set up, learn how to do everyday tasks:

**[Common Tasks Guide →](common-tasks.md)**

---

## What's Next?

### Learn More Features:
- **[Navigation Features](../features/navigation.md)** - Master F12, Ctrl+F12, and hover
- **[IntelliSense](../features/intellisense.md)** - Code completion and signatures
- **[Solution Management](../features/solution-management.md)** - Advanced solution features
- **[Code Editing Tools](../features/code-editing.md)** - Snippets, wizards, and more

### Need Help?
- **[Common Tasks](common-tasks.md)** - Cookbook-style recipes
- **[Full Documentation](../GETTING_STARTED.md)** - Detailed setup guide
- **[GitHub Issues](https://github.com/msarson/Clarion-Extension/issues)** - Report problems

---

**Tip:** Most features work without any configuration. Just open your solution folder and start coding!

