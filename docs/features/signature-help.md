# Signature Help & Hover Documentation

Get instant documentation and parameter hints for Clarion functions and methods.

## Overview

The Clarion Extension provides two main documentation features:

- **Signature Help** - Parameter hints when calling functions/methods
- **Hover Documentation** - Information when hovering over symbols

**Note:** This extension does NOT provide auto-complete dropdowns as you type. It provides documentation for functions/methods you're already calling.

---

## Signature Help (Parameter Hints)

### What It Does

**Shows parameter information when you type an opening parenthesis:**

```clarion
SUB(  ← Type opening parenthesis
```

**Pop-up shows:**
```
SUB(string, start, <length>)

Returns a substring from a string.

Parameters:
  string - Source string
  start  - Starting position (1-based)
  length - Number of characters (optional)
```

---

### When It Appears

**Signature help triggers when you:**
1. Type `(` after a function/method name
2. Type `,` to move to next parameter
3. Press `Ctrl+Shift+Space` manually

**It appears for:**
- Built-in Clarion functions (148 functions)
- Custom procedure calls
- Class method calls (with overload support)

---

### Built-in Functions Supported

**148 Clarion built-in functions documented:**

#### String Functions
- `SUB(string, start, <length>)` - Extract substring
- `CLIP(string)` - Remove trailing spaces
- `UPPER(string)` - Convert to uppercase
- `LOWER(string)` - Convert to lowercase
- `LEN(string)` - Get string length
- `INSTRING(pattern, source, <case>, <start>)` - Find substring
- `LEFT(string)` - Left trim spaces
- `RIGHT(string)` - Right justify
- `CENTER(string)` - Center string
- `ALL(string, length)` - Repeat string
- `DEFORMAT(string, picture)` - Remove formatting
- `FORMAT(value, picture)` - Apply formatting

#### Numeric Functions
- `ABS(number)` - Absolute value
- `INT(number)` - Integer portion
- `ROUND(number, decimals)` - Round to decimals
- `SQRT(number)` - Square root
- `NUMERIC(string)` - Convert string to number
- `VAL(string)` - String to number
- `SIN(angle)`, `COS(angle)`, `TAN(angle)` - Trigonometry
- `LOG(number)`, `EXP(number)` - Logarithms

#### Date/Time Functions
- `TODAY()` - Current date
- `CLOCK()` - Current time
- `DATE(month, day, year)` - Create date
- `DAY(date)` - Extract day
- `MONTH(date)` - Extract month
- `YEAR(date)` - Extract year
- `AGE(date, <basedate>)` - Calculate age

#### File I/O Functions
- `RECORDS(file)` - Get record count
- `POINTER(file)` - Get current position
- `EOF(file)` - Check end of file
- `ERROR()` - Get last error
- `ERRORCODE()` - Detailed error code
- `CONTENTS(variable)` - Variable address

**[See complete function list →](../CLARION_LANGUAGE_REFERENCE.md)**

---

### Method Overload Support

**For methods with multiple signatures:**

```clarion
MyObj.Process(  ← Multiple overloads available
```

**Shows:**
```
1 of 3  ↑↓ use arrows

Process(STRING value)
Process(*STRING reference)  
Process(<STRING optional>)
```

**Features:**
- Cycle through overloads with arrow keys
- Shows parameter count: `1 of 3`
- Highlights current parameter
- Automatically resolves to correct overload based on parameters

---

### Keyboard Shortcuts

**Show/Hide Signature Help:**
- `Ctrl+Shift+Space` - Manually trigger signature help
- `Escape` - Close signature help

**Navigate Parameters:**
- Type `,` - Move to next parameter
- Signature help updates automatically

**Navigate Overloads:**
- `↑` `↓` Arrow keys - Cycle through method overloads

---

## Hover Documentation

### What It Does

**Shows information when you hover mouse over a symbol:**

- Hover over **procedure name** → See declaration and implementation preview
- Hover over **variable** → See type, scope, and location
- Hover over **built-in function** → See full documentation
- Hover over **INCLUDE** → Preview file contents
- Hover over **method** → See signature and implementation

---

### Hover Over Functions

**Example: Hover over `SUB`**

Shows:
```
SUB(string, start, <length>): STRING

Returns a substring from a string.

Parameters:
  string - Source string
  start  - Starting position (1-based)
  length - Number of characters (optional, defaults to end)

Returns:
  STRING - The extracted substring

Example:
  Result = SUB('Hello World', 7, 5)  ! Returns 'World'
```

---

### Hover Over Variables

**Shows variable information:**

```clarion
MyVar  STRING(100)  ! ← Hover here

Shows:
---
Local procedure variable: MyVar
Type: STRING(100)
Declared: Line 45
Scope: Procedure-local
---
```

**Scope-aware:**
- Distinguishes local vs global variables
- Shows correct scope (procedure, routine, module, global)

---

### Hover Over Procedures

**Shows both declaration and implementation:**

```clarion
MyProc()  ! ← Hover here

Shows:
---
MAP Declaration:
  MyProc PROCEDURE(STRING param)

Implementation: (first 10 lines)
MyProc PROCEDURE(STRING param)
CODE
  x = 10
  ! ... more lines ...
  
File: MyApp.clw (Line 234)
---
```

---

### Hover Over Includes

**Shows file preview:**

```clarion
INCLUDE('MyFile.inc')  ! ← Hover shows first 20 lines

INCLUDE('MyFile.inc', 'MySection')  ! ← Hover shows only MySection
```

---

## What This Extension Does NOT Have

### ❌ No Auto-Complete Dropdown

**This extension does NOT show:**
- Dropdown list as you type
- Function/variable suggestions while typing
- Auto-complete for half-typed words

**Why:** The extension doesn't have a CompletionProvider. It only provides documentation for functions you're already calling.

---

### ✅ What You DO Get Instead

**Snippets for code structures:**
- Type `IF` then `Tab` → Full IF/THEN/END structure
- Type `VS` then `Tab` → String variable declaration
- 50+ code snippets available

**[See Snippets →](code-editing.md#code-snippets)**

---

## Tips & Tricks

### Getting Parameter Hints

1. Start typing function name: `SUB`
2. Type opening parenthesis: `(`
3. Signature help appears automatically
4. Type parameters, use `,` to move to next

### Quick Function Lookup

1. Type function name (from memory or docs)
2. Type `(`
3. Read parameter hints
4. Fill in parameters

### Exploring Function Documentation

1. Hover over any function call
2. Read full documentation
3. See examples and return types
4. Press `Escape` to close

### Remember Function Names

**The extension assumes you know function names.** Use:
- Clarion Language Reference
- Online documentation
- Code examples

Then use signature help to remember parameters.

---

## Troubleshooting

### Signature Help Not Appearing

**Check:**
1. You typed `(` after function/method name
2. Function is a recognized built-in or procedure
3. Cursor is inside the parentheses

**Try:**
- Press `Ctrl+Shift+Space` manually
- Check you're in a CODE section
- Reload window: `Ctrl+Shift+P` → "Developer: Reload Window"

---

### Wrong Signature Shown

**Possible causes:**
1. Function name spelled incorrectly
2. Multiple overloads (use arrow keys to cycle)
3. Custom procedure not properly declared

---

### Hover Not Working

**Check:**
1. You're hovering over a valid symbol
2. Symbol is declared in scope
3. File is part of solution

**Try:**
- Hover longer (slight delay)
- Check symbol is spelled correctly
- Verify F12 works (same resolution system)

---

## Related Features

- **[Navigation](navigation.md)** - F12 uses same symbol resolution
- **[Code Editing](code-editing.md)** - Snippets for quick code entry
- **[Common Tasks](../guides/common-tasks.md)** - Usage examples

