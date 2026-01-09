# Navigation Features

[← Back to Documentation Home](../../README.md)

Master code navigation with F12, Ctrl+F12, and hover tooltips.

## Overview

The Clarion Extension provides three powerful ways to navigate your code:

- **Go to Definition (F12)** - Find where something is declared
- **Go to Implementation (Ctrl+F12)** - See the actual code
- **Hover Tooltips** - Preview without leaving your current file

All navigation features are **scope-aware** and work across files in your solution.

---

## Go to Definition (F12)

**What it does:** Jumps to where a symbol is declared or defined.

### Supported Symbols

#### Procedures
- Click on any procedure call
- Press **F12**
- Jump to:
  - MAP declaration (if it's a mapped procedure)
  - PROCEDURE line (if it's a local procedure)

**Example:**
```clarion
  MyProcedure()  ! ← F12 here jumps to MAP or PROCEDURE declaration
```

---

#### Variables
- Click on any variable
- Press **F12**
- Jump to its declaration in the DATA section or parameter list

**Scope-aware:** Correctly prioritizes local variables over globals with the same name.

**Example:**
```clarion
MyProc PROCEDURE
MyVar    LONG  ! ← F12 on MyVar usage jumps here
CODE
  MyVar = 10   ! ← F12 here
```

---

#### Include Files
- Click on the filename in an INCLUDE statement
- Press **F12**
- The included file opens

**Example:**
```clarion
  INCLUDE('MyFile.inc')  ! ← F12 opens MyFile.inc
```

**Bonus - SECTION support:**
```clarion
  INCLUDE('MyFile.inc', 'MySection')  ! ← F12 jumps to MySection CODE
```

---

#### Modules & Members
- Click on MODULE attribute in CLASS declaration
- Press **F12**
- Opens the `.clw` implementation file

**Example:**
```clarion
MyClass CLASS,MODULE('MyClass.clw')  ! ← F12 opens MyClass.clw
```

**Reverse lookup:** From MEMBER file back to parent MODULE:
- Press **F12** on `MEMBER('MyClass')` to jump back to CLASS declaration

---

#### Methods
- Click on method name (in call or declaration)
- Press **F12**
- Jump to method declaration in CLASS

**Method overload support:** Resolves to the correct overload based on parameters.

**Example:**
```clarion
  MyObj.MyMethod('test')  ! ← F12 jumps to correct MyMethod(STRING) declaration
```

---

#### Class Members
- Click on a class member access (e.g., `MyObj.Property`)
- Press **F12**
- Jump to the member declaration in the CLASS

---

#### Group Prefix Variables
- Works with prefixed variable access
- Handles both `.` and `:` syntax

**Example:**
```clarion
MyGroup GROUP,PRE(Grp)
Field     LONG
        END

CODE
  Grp:Field = 10    ! ← F12 jumps to Field declaration
  MyGroup.Field = 5 ! ← F12 also works here
```

---

## Go to Implementation (Ctrl+F12)

**What it does:** Jumps to the actual implementation/code (not just the declaration).

### Supported Symbols

#### MAP Declarations → Procedure Implementation
- Click on a procedure in a MAP
- Press **Ctrl+F12**
- Jump to the PROCEDURE implementation

**Example:**
```clarion
MAP
  MyProc()  ! ← Ctrl+F12 here
END

! ... later in file or another file ...

MyProc PROCEDURE  ! ← Jumps here
CODE
  ! Implementation
```

---

#### Procedure Calls → Implementation
- Click on any procedure call
- Press **Ctrl+F12**
- Jump to the PROCEDURE implementation (not MAP)

**Example:**
```clarion
  MyProc()  ! ← Ctrl+F12 jumps to PROCEDURE implementation
```

---

#### Method Declarations → Implementation
- Click on method name in CLASS declaration
- Press **Ctrl+F12**
- Jump to method implementation in MODULE file

**Example:**
```clarion
! In MyClass.inc:
MyClass CLASS,MODULE('MyClass.clw')
MyMethod  PROCEDURE()  ! ← Ctrl+F12 here
        END

! Jumps to MyClass.clw:
MyClass.MyMethod PROCEDURE
CODE
  ! Implementation
```

---

#### MODULE → Source File
- Click on MODULE statement
- Press **Ctrl+F12**
- Opens the source file

**Example:**
```clarion
MAP
  MODULE('MyLib.dll')
    MyFunc(), NAME('_MyFunc')  ! ← Ctrl+F12 finds MyLib source
  END
END
```

**Cross-project support:** Automatically finds source files for DLLs/LIBs across your solution.

---

## Hover Tooltips

**What it does:** Shows documentation, signatures, and previews without leaving your current file.

### Hover Over Procedures

**Shows:**
- MAP declaration
- Implementation preview (first 10 lines)
- File location

**Example:**
Hover over a procedure call to see both its declaration and implementation context.

---

### Hover Over Variables

**Shows:**
- Variable type and declaration
- Scope (global, procedure-local, routine-local)
- File location

**Example:**
```clarion
MyVar  STRING(100)  ! Hover here

Shows:
---
Local procedure variable: MyVar
Type: STRING(100)
File: MyApp.clw (Line 45)
---
```

---

### Hover Over Built-in Functions

**Shows:**
- Function signature
- Parameter descriptions
- Return type
- Usage examples

**Example:**
Hover over `SUB` to see:
```
SUB(string, start, <length>)

Returns a substring from a string.

Parameters:
  string - Source string
  start  - Starting position (1-based)
  length - Number of characters (optional)

Returns: STRING
```

---

### Hover Over Includes

**Shows:**
- File preview (first 20 lines)
- Full file path

**SECTION support:** If INCLUDE specifies a SECTION, shows only that section content.

**Example:**
```clarion
INCLUDE('MyFile.inc', 'MySection')  ! Hover shows MySection content
```

---

### Hover Over Methods

**Shows:**
- Method signature
- Parameter types
- Implementation preview
- File location

**Overload support:** Shows all overloaded versions if multiple exist.

---

## Navigation Tips

### Breadcrumb Navigation
- Use the breadcrumb trail at the top of the editor
- Click to jump to different parts of your code structure

### Go Back / Go Forward
- After using F12, press `Alt+←` to go back
- Press `Alt+→` to go forward
- Navigate your jump history easily

### Peek Definition (Alt+F12)
- Shows definition in a popup without leaving your current location
- Great for quick lookups

### Symbol Search (Ctrl+T)
- Search for any symbol across your solution
- Type the name and jump to it

---

## Scope-Aware Navigation

**The extension understands Clarion scope rules:**

### Variable Scope Priority
1. **Procedure-local variables** (current procedure DATA section)
2. **Routine-local variables** (routine DATA section)
3. **Module-local variables** (MODULE's DATA section)
4. **Global variables** (file-level DATA section)

**Example:**
```clarion
MyVar  LONG  ! Global

MyProc PROCEDURE
MyVar    STRING(10)  ! Local (shadows global)
CODE
  MyVar = 'test'  ! ← F12 goes to local STRING, not global LONG
```

### Routine Variable Access
Variables in routines are accessible from the parent procedure.

**Example:**
```clarion
MyProc PROCEDURE
CODE
  DO MyRoutine
  RETURN

MyRoutine ROUTINE
MyVar     LONG
  MyVar = 10  ! ← F12 finds MyVar in this routine
```

---

## Performance

**Blazing Fast:** All navigation features use optimized caching and indexing.

- **MAP resolution**: Direct lookup, no scanning hundreds of files
- **Parent scope lookups**: O(1) operations with parent index
- **Cross-file resolution**: Efficient file-based caching

Even in large codebases (1000+ files), navigation is instant.

---

## Troubleshooting

### F12 Not Working

**Check:**
1. Solution opened correctly (folder containing `.sln`)
2. Symbol is within solution scope
3. File is not excluded/ignored

### Navigation Goes to Wrong Place

**Possible causes:**
1. Multiple declarations with same name (check scope)
2. Redirection files not configured correctly
3. Include paths not resolving

**Solution:**
- Use hover tooltip to verify you're on the correct symbol
- Check `.clarion.properties` redirection settings

### Cross-File Navigation Not Working

**Check:**
1. All files are part of the solution
2. Include paths are correct
3. Redirection files are configured

---

## Related Features

- **[Signature Help](signature-help.md)** - Parameter hints use same symbol resolution
- **[Common Tasks](../guides/common-tasks.md)** - Quick navigation recipes

