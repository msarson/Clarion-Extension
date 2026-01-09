# Quick Start Guide

Get up and running with the Clarion Extension in 5 minutes.

---

## What Works Without a Solution?

**You can use these features immediately (no solution needed):**

✅ **Syntax Highlighting** - All Clarion code colored  
✅ **Code Snippets** - IF, LOOP, variable shortcuts, etc.  
✅ **Signature Help** - Parameter hints for 148 built-in functions  
✅ **Hover Documentation** - Info for built-in functions, keywords, and symbols in current file  
✅ **Code Folding** - Collapse/expand structures  
✅ **Bracket Matching** - Auto-close parentheses, quotes  
✅ **Basic Navigation (F12)** - Go to definition within the same file  
✅ **Hover on Variables** - See type and scope (same file only)  

**These work better with a solution:**

🔓 **Cross-File Navigation** - F12 on INCLUDE, MODULE, MEMBER  
🔓 **Solution-Wide Search** - Find symbols across all projects  

**These require a solution:**

🔒 **Build Integration** - Needs solution configuration  
🔒 **Solution Explorer** - Shows your project structure  

**TL;DR:** Basic editing and same-file navigation work immediately. Cross-file features and building need a solution.

---

## Step 1: Install the Extension

1. Open **Visual Studio Code**
2. Press `Ctrl+Shift+X` to open Extensions
3. Search for **"Clarion Extensions"**
4. Click **Install**
5. Restart VS Code (if prompted)

✅ **Done!** The extension is now installed.

---

## Step 2: Open Your First Solution

**Open the folder containing your solution:**

1. Click **File → Open Folder** (or press `Ctrl+K Ctrl+O`)
2. Browse to the folder containing your `.sln` file
3. Click **Select Folder**

**The extension scans for solutions:**

4. Open the **Clarion Tools** sidebar (Activity Bar, left side)
5. You'll see "X Solution(s) Found"  
6. Click the **▶** solution name to open it

This triggers first-time configuration (see Step 3).

### Alternative: Browse for Solution Anywhere

**If your `.sln` is not in the opened folder:**

1. Open the **Clarion Tools** sidebar
2. Click **"📂 Browse for Solution..."**
3. Navigate to and select your `.sln` file
4. The containing folder opens automatically

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

### Try Features Without a Solution First

**Open any `.clw` file (or create a test file):**

```clarion
TestProc PROCEDURE
MyVar     LONG
CODE
  SUB(  ← Type this and parameter hints appear!
  MyVar = 10  ← Hover over MyVar to see type
  ! Press F12 on MyVar to jump to declaration
```

**What works immediately (same file):**
- **Signature Help** - Type `SUB(` and see parameter hints
- **Hover** - Hover over `SUB`, `MyVar`, or `TestProc` for info
- **F12 Navigation** - Press F12 on `MyVar` to jump to its declaration
- **Snippets** - Type `IF` then Tab for full structure
- **Syntax Highlighting** - Code is colored

**What needs a solution (cross-file):**
- F12 on INCLUDE statements
- F12 on MODULE references
- Cross-file procedure navigation

---

### Navigate Your Code (Works in Same File)

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

### Use Signature Help (Parameter Hints)

1. Type a function name (e.g., `SUB`)
2. Type opening parenthesis `(`
3. **Parameter hints appear automatically**
4. See parameter names, types, and descriptions
5. Type `,` to move to next parameter

**Note:** This extension shows parameter hints for functions you're calling. It does not have auto-complete dropdowns as you type.

### Use Code Snippets

1. Type a snippet trigger (e.g., `IF`)
2. Press **Tab**
3. The full structure is inserted with placeholders
4. **Tab** again to jump to next placeholder

**Common snippets:**
- `IF` → IF/THEN/END
- `LOOP` → LOOP/END
- `MAP` → MAP/END
- `VS` → String variable declaration
- `VL` → Long variable declaration

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

