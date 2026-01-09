# Common Tasks

Everyday workflows made easy. Find your task and follow the steps.

## Table of Contents

- [Navigation](#navigation)
- [Code Editing](#code-editing)
- [Solution Management](#solution-management)
- [Building & Compiling](#building--compiling)
- [Troubleshooting](#troubleshooting)

---

## Navigation

### How do I find where a procedure is declared?

1. Click on the procedure name (anywhere it's used)
2. Press **F12**
3. You jump to the MAP declaration or PROCEDURE line

**What it does:** Takes you to where the procedure is defined.

---

### How do I see the actual implementation of a procedure?

1. Click on a MAP declaration or procedure call
2. Press **Ctrl+F12**
3. Jump to the PROCEDURE implementation

**What it does:** Shows you the actual code, not just the declaration.

---

### How do I see what a function does without leaving my code?

1. Hover your mouse over any function name
2. Read the documentation popup
3. Press `Escape` to close

**What it does:** Shows you function documentation, parameters, and usage.

---

### How do I find where a variable is declared?

1. Click on the variable name
2. Press **F12**
3. Jump to its declaration (DATA section or parameter list)

**Works for:**
- Local variables
- Global variables
- Parameters
- Group fields

---

### How do I navigate to an included file?

1. Click on the filename in an `INCLUDE('filename.inc')` statement
2. Press **F12**
3. The file opens

**Bonus:** If you include a specific SECTION, it jumps directly to that section!

Example: `INCLUDE('file.inc', 'MySection')` → Jumps to `MySection CODE`

---

### How do I find where a MODULE is implemented?

1. Click on the MODULE name in a CLASS declaration:
   ```clarion
   MyClass CLASS,MODULE('MyClass.clw')
   ```
2. Press **F12**
3. The `.clw` file opens

---

## Code Editing

### How do I quickly insert code structures?

**Use snippets!**

1. Type the snippet trigger (e.g., `IF`)
2. Press **Tab**
3. The structure is inserted with placeholders
4. **Tab** again to jump to the next placeholder

**Common snippets:**
- `IF` → IF/THEN/END
- `IFE` → IF/THEN/ELSE/END
- `LOOP` → LOOP/END
- `MAP` → MAP/END
- `CASE` → CASE/OF/END

**[See all snippets →](../reference/snippets.md)**

---

### How do I declare a variable quickly?

**Use variable snippets:**

1. Type `V` + variable type (e.g., `VS` for String)
2. Press **Tab**
3. Fill in the variable name

**Variable types:**
- `VS` → String
- `VL` → Long
- `VR` → Real
- `VD` → Decimal
- `VDT` → Date
- `RVS` → &String (reference)

**[See all variable shortcuts →](../reference/snippets.md)**

---

### How do I add a method implementation?

**For an existing method declaration in a CLASS:**

1. Place your cursor on the method name in the CLASS
2. Press `Ctrl+Shift+I` (or Command Palette → "Add Method Implementation")
3. The implementation is generated in the MODULE file
4. You're taken to the new method implementation

**What it generates:**
```clarion
MyClass.MyMethod PROCEDURE
CODE
  ! Your code here
```

---

### How do I paste text as a Clarion string?

**Convert multi-line text to Clarion string format:**

1. Copy some text to your clipboard
2. In VS Code, press `Ctrl+Shift+Alt+V` (or Command Palette → "Paste as Clarion String")
3. The text is pasted with proper escaping and line continuation

**Example:**
```
Input (clipboard):
This is line 1
This is line 2
```

```clarion
Output (pasted):
'This is line 1' & |
'This is line 2'
```

Perfect for SQL queries, error messages, and multi-line strings!

---

### How do I create a new class?

1. Press `Ctrl+Shift+P` to open Command Palette
2. Type "Create New Class"
3. Enter the class name
4. Choose a folder
5. Both `.inc` and `.clw` files are created with proper structure

---

## Solution Management

### How do I open a solution?

**Method 1: Open Folder**
1. **File → Open Folder** (`Ctrl+K Ctrl+O`)
2. Select folder containing your `.sln` file
3. Done!

**Method 2: Browse from Solution View**
1. Open **Clarion Tools** sidebar
2. Click **"Browse for Solution"**
3. Select your `.sln` file

**Method 3: Recent Solutions**
1. Open **Clarion Tools** sidebar
2. Click any solution in **Recent Solutions** list

---

### How do I switch between solutions?

1. **File → Open Folder**
2. Select a different solution folder

OR

1. Click a recent solution in the **Clarion Tools** sidebar

**Note:** VS Code can only have one folder open at a time.

---

### How do I change the build configuration?

**Change between Debug and Release:**

1. Click the status bar at the bottom (shows current config like "Debug|Win32")
2. Select new configuration from the dropdown

OR

1. `Ctrl+Shift+P` → "Clarion: Set Configuration"
2. Select configuration

---

## Building & Compiling

### How do I build/generate an application?

**Method 1: From Solution View**
1. In **Clarion Tools** sidebar, find your application
2. Right-click on the `.app` file
3. Click **"Generate Application"**

**Method 2: Keyboard Shortcut**
1. Make sure an `.app` file is open or selected
2. Press `Ctrl+Shift+B`

**Method 3: Command Palette**
1. `Ctrl+Shift+P` → "Clarion: Generate Application"

Build output appears in the integrated terminal.

---

### How do I see build errors?

1. After a build, check the **terminal** at the bottom
2. Errors show in red with line numbers
3. Click on an error to jump to that line

---

## Troubleshooting

### F12 isn't working

**Possible causes:**

1. **Solution not opened correctly**
   - Make sure you opened the folder containing the `.sln` file
   - Check **Clarion Tools** sidebar shows your solution

2. **File is outside the solution**
   - F12 only works within the solution and its includes

3. **Symbol not found**
   - Check spelling and scope (local vs global variables)

---

### IntelliSense isn't showing up

**Possible causes:**

1. **Extension not activated**
   - Check the bottom status bar for Clarion version
   - If not showing, try opening a `.clw` file

2. **File type not recognized**
   - Make sure file has `.clw`, `.inc`, or `.equ` extension

3. **Try restarting**
   - `Ctrl+Shift+P` → "Developer: Reload Window"

---

### Build fails with "ClarionCl.exe not found"

**Fix:**

1. `Ctrl+Shift+P` → "Clarion: Set Clarion Path"
2. Browse to your Clarion `BIN` folder
3. Try building again

---

### Need More Help?

- **[Installation Guide](installation.md)** - Detailed setup
- **[Full Documentation](../GETTING_STARTED.md)** - Complete guide
- **[GitHub Issues](https://github.com/msarson/Clarion-Extension/issues)** - Report bugs

