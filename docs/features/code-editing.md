# Code Editing Tools

[← Back to Documentation Home](../../README.md)

Productivity features to write Clarion code faster.

## Overview

The Clarion Extension provides powerful code editing tools:

- **50+ code snippets** - Quick insertion of common structures
- **Paste as Clarion String** - Convert text to Clarion string format
- **Add Method Implementation** - Generate method stubs automatically
- **Create New Class** - Interactive class creation wizard
- **Code folding** - Collapse/expand code blocks

---

## Code Snippets

### What Are Snippets?

**Shortcuts that expand into full code structures:**

1. Type the trigger word (e.g., `IF`)
2. Press **Tab**
3. Full structure inserted with placeholders
4. **Tab** again to jump to next placeholder

---

### Structure Snippets

#### IF Statement
**Trigger:** `IF`

```clarion
IF THEN
  
END
```

**Trigger:** `IFE` (IF with ELSE)

```clarion
IF THEN
  
ELSE
  
END
```

---

#### LOOP Statement
**Trigger:** `LOOP`

```clarion
LOOP
  
END
```

**Trigger:** `LOOPFT` (LOOP with FROM/TO)

```clarion
LOOP var = from TO to
  
END
```

**Trigger:** `LOOPFILE` (File LOOP)

```clarion
LOOP UNTIL ACCESS:FileName.Next()
  
END
```

---

#### CASE Statement
**Trigger:** `CASE`

```clarion
CASE variable
OF value
  
END
```

---

#### Other Structures
- `MAP` → MAP/END
- `MODULE` → MODULE/END
- `CLASS` → CLASS/END
- `GROUP` → GROUP/END
- `QUEUE` → QUEUE/END
- `FILE` → FILE/END

**[See all snippets →](../reference/snippets.md)**

---

### Variable Declaration Snippets

#### Basic Variables
**Pattern:** `V{type}` (V = Variable)

- `VS` → `Bar STRING(10)`
- `VL` → `Bar LONG`
- `VR` → `Bar REAL`
- `VD` → `Bar DECIMAL(10,2)`
- `VDT` → `Bar DATE`
- `VTI` → `Bar TIME`

---

#### Reference Variables
**Pattern:** `RV{type}` (RV = Reference Variable)

- `RVS` → `Bar &STRING`
- `RVL` → `Bar &LONG`
- `RVR` → `Bar &REAL`

---

#### Procedure Parameters
**Pattern:** `PV{type}` (PV = Procedure Variable)

- `PVS` → `(STRING Foo)`
- `PVL` → `(LONG Foo)`

**Pattern:** `PVR{type}` (PVR = Procedure Reference)

- `PVRS` → `(*STRING Foo)`
- `PVRL` → `(*LONG Foo)`

---

### Quick Variable Types

| Shortcut | Type       |
|----------|------------|
| `s`      | STRING     |
| `l`      | LONG       |
| `r`      | REAL       |
| `d`      | DECIMAL    |
| `dt`     | DATE       |
| `ti`     | TIME       |
| `b`      | BYTE       |
| `sh`     | SHORT      |
| `ul`     | ULONG      |
| `us`     | USHORT     |
| `cs`     | CSTRING    |
| `ps`     | PSTRING    |

**[Complete list →](../reference/snippets.md)**

---

## Paste as Clarion String

### What It Does

**Converts clipboard text to Clarion string format:**

- Automatically escapes quotes
- Converts unicode quotes to ASCII (for Clarion compatibility)
- Adds line continuation (`& |`)
- Handles multi-line text
- Perfect for SQL, error messages, multi-line strings

> **Note:** Unicode "smart quotes" (', ', ", ") from Word, web browsers, etc. are automatically converted to ASCII quotes (' and ") to ensure Clarion compiler compatibility.

---

### How to Use

1. Copy text to clipboard (any source)
2. In VS Code, position cursor where you want string
3. Press `Ctrl+Shift+Alt+V`
4. Text pasted as Clarion string

**Or:**
1. `Ctrl+Shift+P` → "Clarion: Paste as Clarion String"

---

### Examples

#### Single Line

**Clipboard:**
```
Hello World
```

**Pasted:**
```clarion
'Hello World'
```

---

#### Multiple Lines

**Clipboard:**
```
This is line 1
This is line 2
This is line 3
```

**Pasted (default):**
```clarion
'This is line 1' & |
'This is line 2' & |
'This is line 3'
```

---

#### With Quotes

**Clipboard:**
```
He said "Hello"
```

**Pasted:**
```clarion
'He said "Hello"'
```

---

#### Unicode Quotes (from Word/Web)

**Clipboard (with "smart quotes"):**
```
SELECT * FROM Customers WHERE Name = 'John's Store'
```

**Pasted (automatically converted to ASCII):**
```clarion
'SELECT * FROM Customers WHERE Name = ''John''s Store'''
```

> **Note:** Unicode quotes (', ', ", ") are converted to ASCII (' and ") before escaping. This ensures Clarion compiler compatibility.

---

#### SQL Query

**Clipboard:**
```sql
SELECT *
FROM Customers
WHERE Country = 'USA'
ORDER BY CustomerName
```

**Pasted:**
```clarion
'SELECT *' & |
'FROM Customers' & |
'WHERE Country = ''USA''' & |
'ORDER BY CustomerName'
```

**Note:** Single quotes automatically doubled for SQL escaping!

---

### Configuration

#### Line Terminator

**Choose how lines are joined:**

```json
{
  "clarion.pasteAsClarionString.lineTerminator": "space"  // Default
}
```

**Options:**

**"space"** - Join with space (default)
```clarion
'Line 1' & |
'Line 2'
```

**"crlf"** - Include CRLF characters
```clarion
'Line 1' & |
'<13,10>' & |
'Line 2'
```

**"none"** - No line breaks
```clarion
'Line 1Line 2'
```

---

#### Trim Leading Whitespace

**Remove indentation from pasted text:**

```json
{
  "clarion.pasteAsClarionString.trimLeading": true  // Default
}
```

**Example with trim enabled:**

**Clipboard:**
```
    Indented line 1
    Indented line 2
```

**Pasted:**
```clarion
'Indented line 1' & |
'Indented line 2'
```

---

## Add Method Implementation

### What It Does

**Automatically generates method implementations from CLASS declarations:**

1. Finds the method declaration in CLASS
2. Locates the MODULE file
3. Checks for existing implementation
4. Generates new implementation or jumps to existing

---

### How to Use

1. Place cursor on method name in CLASS declaration
2. Press `Ctrl+Shift+I`
3. Implementation generated in MODULE file
4. Cursor moves to new implementation

**Or:**
1. `Ctrl+Shift+P` → "Clarion: Add Method Implementation"

---

### Example

**In MyClass.inc:**
```clarion
MyClass CLASS,MODULE('MyClass.clw')
Init      PROCEDURE()  ← Cursor here, press Ctrl+Shift+I
        END
```

**Generates in MyClass.clw:**
```clarion
MyClass.Init PROCEDURE
CODE
  ! Your code here
```

---

### Method Overloads

**Handles overloaded methods:**

```clarion
MyClass CLASS,MODULE('MyClass.clw')
Process   PROCEDURE(STRING value)
Process   PROCEDURE(*STRING reference)  ← Generates correct signature
        END
```

**Generates:**
```clarion
MyClass.Process PROCEDURE(*STRING reference)
CODE
  
```

**Uses parameter types to match correct overload!**

---

### Existing Implementation

**If implementation already exists:**
- Jumps to existing implementation
- Does NOT create duplicate
- Cursor positioned at implementation

---

## Create New Class

### What It Does

**Interactive wizard creates both `.inc` and `.clw` files:**

1. Prompts for class name
2. Asks for folder location
3. Creates `.inc` file with CLASS declaration
4. Creates `.clw` file with MODULE stub
5. Opens both files

---

### How to Use

1. Press `Ctrl+Shift+P`
2. Type "Clarion: Create New Class"
3. Enter class name (e.g., `MyClass`)
4. Select destination folder
5. Files created and opened

---

### Generated Files

**MyClass.inc:**
```clarion
MyClass CLASS,MODULE('MyClass.clw'),TYPE,THREAD
Init      PROCEDURE()
Kill      PROCEDURE()
        END
```

**MyClass.clw:**
```clarion
  MEMBER('MyClass')

  MAP
  END

  INCLUDE('MyClass.inc'),ONCE

MyClass.Init PROCEDURE
CODE
  

MyClass.Kill PROCEDURE
CODE
  
```

---

## Refactorings (Ctrl+.)

A batch of CodeRush-inspired refactors, available on **Ctrl+.** (or the Refactor… context menu) and as palette commands. None of them bind new keyboard shortcuts.

### Surround With…

Select one or more statement lines, then **Ctrl+.** → **Surround With…** (or `Clarion: Surround With…` from the palette). Wraps the selection in:
- `IF … END`
- `LOOP … END`, `LOOP WHILE … END`, `LOOP UNTIL … END`
- `CASE … OF … END`

The content is indented one level (relative indentation preserved, `OF` aligned with `CASE`), and the condition placeholder is selected so you can type straight over it.

### Negate Condition

With the cursor on an `IF` / `ELSIF` / `LOOP WHILE` / `LOOP UNTIL` line, flips the condition's logical sense: comparison operators invert (`=` ↔ `<>`, `<` ↔ `>=`, …), a bare expression gains/loses `~`, and a compound boolean is wrapped in `~(…)`. Only the condition span is rewritten — trailing `THEN`, comments, and string contents are untouched.

### Flip IF/ELSE

On a block-form `IF … ELSE … END`, negates the condition and swaps the branches — handy when the `ELSE` holds the common/early path. Not offered when the shape isn't a clean two-branch flip (no `ELSE`, an `ELSIF` chain, or single-line `IF … THEN`), where Negate Condition still covers the IF line.

### Introduce EQUATE

With the cursor on (or a selection of) a numeric or string literal, extracts the magic literal to a named `EQUATE`. A quick pick asks **which data section** it should live in — the routine's `DATA`, the procedure's local data, module data (in a `MEMBER`), global data (in a `PROGRAM`), or even cross-file into the resolved PROGRAM file's global section — then prompts for the name. The literal is replaced with the new name.

### Create Routine from an Unresolved DO

With the cursor on a `DO SomeRoutine` whose target doesn't exist, a quick fix scaffolds the `SomeRoutine ROUTINE` skeleton at the end of the enclosing procedure and drops the cursor into the body. Resolution is procedure-scoped (routine labels legally repeat across procedures), and from inside a local derived method (ABC's `ThisWindow` shape) it offers both placements — local to the method, or procedure-level shared by all methods.

---

## Code Folding

### What It Does

**Collapse/expand code blocks:**
- Hides implementation details
- Focus on structure
- Navigate large files easier

---

### Foldable Structures

**All major Clarion structures:**
- PROCEDURE/END
- CLASS/END
- IF/END
- LOOP/END
- CASE/END
- MAP/END
- GROUP/END
- ROUTINE/END

---

### How to Use

**Fold/unfold block:**
- Click **▼** icon in left gutter
- Or press `Ctrl+Shift+[` (fold)
- Or press `Ctrl+Shift+]` (unfold)

**Fold all:**
- `Ctrl+K Ctrl+0` - Fold all
- `Ctrl+K Ctrl+J` - Unfold all

**Fold level:**
- `Ctrl+K Ctrl+1` - Fold level 1
- `Ctrl+K Ctrl+2` - Fold level 2
- etc.

---

## Expand / Shrink Selection

**Keyboard shortcut:** `Shift+Alt+→` to expand, `Shift+Alt+←` to shrink

Progressively widens the text selection through Clarion's scope hierarchy:

1. Current token
2. Current line
3. Innermost structure (`IF`, `LOOP`, `CLASS`, etc.)
4. Parent structure
5. Whole document

**Shrink** walks back through the same chain.

**Example:**
```clarion
IF x > 0 THEN
  DoSomething()   ! ← Cursor here
  DoOther()
END
```
- First `Shift+Alt+→`: selects `DoSomething()`
- Second: selects the line
- Third: selects the entire IF block

---

## Flatten Continuation Lines

**Keyboard shortcut:** `Ctrl+.` on a continuation block  
**Command:** "Clarion: Flatten Continuation Lines"

Joins `|`-continued lines into a single line:
- Trims whitespace from continuation segments
- Collapses adjacent string literals: `'abc' & 'def'` → `'abcdef'`
- Pipe characters inside string literals are never misread as continuation markers

**Example:**

Before:
```clarion
MyString = 'Hello ' & |
           'World' & |
           ' today'
```

After:
```clarion
MyString = 'Hello World today'
```

---

## Bracket Matching

### Auto-Closing Pairs

**Automatically closes:**
- `(` → `()`
- `[` → `[]`
- `'` → `''`
- `"` → `""`

**Cursor positioned inside:**
```clarion
MyProc(|)  ← Cursor here after typing (
```

---

### Bracket Highlighting

**Matching brackets highlighted:**
- Place cursor next to bracket
- Matching bracket highlighted
- Makes nested structures easier to read

---

## Tips & Tricks

### Snippet Workflow
1. Type trigger
2. **Tab** to expand
3. Type placeholder value
4. **Tab** to next placeholder
5. Repeat until done

### Quick String Paste
- Keep Paste as String shortcut handy
- Use for any multi-line text
- SQL queries, error messages, help text

### Class Creation
- Use wizard for consistent structure
- Generates Init/Kill methods automatically
- Proper MODULE reference

### Folding Strategy
- Fold completed procedures
- Focus on current work
- Unfold when needed

---

## Related Features

- **[Signature Help](signature-help.md)** - Parameter hints for functions
- **[Snippets Reference](../reference/snippets.md)** - All available snippets
- **[Common Tasks](../guides/common-tasks.md)** - Usage examples

