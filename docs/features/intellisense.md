# IntelliSense & Code Completion

Smart code completion with context-aware suggestions and full documentation.

## Overview

The Clarion Extension provides comprehensive IntelliSense support:

- **261 documented items** (148 built-in functions, 82 attributes, 31 controls)
- **Context-aware suggestions** - Only shows relevant items
- **Parameter hints** - See function signatures as you type
- **Signature help** - Multiple overload support
- **Quick info** - Hover documentation for all items

---

## Features

### Auto-Complete Suggestions

**As you type, IntelliSense shows:**
- Built-in functions
- Clarion keywords
- Structure names (CLASS, GROUP, QUEUE, FILE)
- Variables in scope
- Procedures and methods
- Attributes and properties

**Example:**
```clarion
  S  ← Type 'S' and see all symbols starting with S
  SUB  ← Continue typing, list narrows
```

Press **Tab** or **Enter** to accept the suggestion.

---

### Built-in Functions (148 Functions)

**Full documentation for all Clarion built-in functions:**

#### String Functions
- `SUB(string, start, <length>)` - Extract substring
- `CLIP(string)` - Remove trailing spaces
- `UPPER(string)` - Convert to uppercase
- `LOWER(string)` - Convert to lowercase
- `LEN(string)` - Get string length
- `INSTRING(pattern, source, <case>, <start>)` - Find substring
- And many more...

#### Numeric Functions
- `ABS(number)` - Absolute value
- `INT(number)` - Integer portion
- `ROUND(number, decimals)` - Round to decimals
- `SQRT(number)` - Square root
- `NUMERIC(string)` - Convert string to number
- And more...

#### Date/Time Functions
- `TODAY()` - Current date
- `CLOCK()` - Current time
- `DATE(month, day, year)` - Create date
- `DAY(date)` - Extract day
- `MONTH(date)` - Extract month
- `YEAR(date)` - Extract year
- And more...

#### File I/O Functions
- `RECORDS()` - Get record count
- `POINTER()` - Get current record pointer
- `EOF()` - Check end of file
- `ERROR()` - Get last error code
- `ERRORCODE()` - Get detailed error
- And more...

**[See complete function list →](../CLARION_LANGUAGE_REFERENCE.md)**

---

### Parameter Hints

**See function signatures as you type:**

```clarion
  SUB(  ← Type opening parenthesis
```

**Shows:**
```
SUB(string, start, <length>)

Parameters:
  string - Source string
  start  - Starting position (1-based)
  length - Number of characters (optional)
```

**Navigate parameters:**
- Type the first parameter
- Type comma `,` to move to next parameter
- Hint updates to highlight current parameter

---

### Signature Help

**For methods with overloads, see all variations:**

```clarion
  MyObj.Process(  ← Multiple overloads
```

**Shows:**
```
1 of 3  ↑↓

Process(STRING value)
Process(*STRING reference)  
Process(<STRING optional>)
```

Use **arrow keys** to cycle through overloads.

**The extension automatically:**
- Resolves to correct overload based on parameter types
- Shows parameter descriptions for each overload
- Highlights current parameter position

---

### Attributes & Properties (82 Attributes)

**IntelliSense for Clarion attributes:**

#### Procedure Attributes
- `PROC` - Procedure attribute
- `PASCAL` - Pascal calling convention
- `RAW` - Raw data mode
- `DLL` - DLL export
- `NAME` - External name
- And more...

#### Data Attributes
- `DIM` - Array dimension
- `OVER` - Overlay variable
- `EXTERNAL` - External declaration
- `STATIC` - Static variable
- `THREAD` - Thread-local
- And more...

#### File Attributes
- `DRIVER` - File driver
- `RECLAIM` - Reclaim deleted records
- `CREATE` - Create if doesn't exist
- `BINDABLE` - Bindable file
- And more...

---

### Control Types (31 Controls)

**Window and report controls with IntelliSense:**

- `BUTTON` - Push button
- `ENTRY` - Text entry field
- `LIST` - List box
- `DROP` - Drop list
- `COMBO` - Combo box
- `CHECK` - Check box
- `RADIO` - Radio button
- `STRING` - Display string
- `BOX` - Rectangle/box
- `LINE` - Line drawing
- And more...

---

## Context-Aware Suggestions

### Inside DATA Sections
**Only shows:**
- Variable types (STRING, LONG, REAL, etc.)
- Structure keywords (GROUP, QUEUE, FILE)
- Attributes (DIM, OVER, etc.)

### Inside CODE Sections
**Only shows:**
- Statements (IF, LOOP, CASE, etc.)
- Functions (SUB, CLIP, etc.)
- Variables in scope
- Procedures

### Inside Procedure Parameters
**Only shows:**
- Parameter types
- Reference/pointer modifiers (*, &, <>)

---

## Keyboard Shortcuts

### Trigger IntelliSense
- **Ctrl+Space** - Force show suggestions
- **Type first characters** - Auto-triggers

### Navigate Suggestions
- **↑↓ Arrow keys** - Move through list
- **Page Up/Page Down** - Jump pages
- **Home/End** - First/last item

### Accept Suggestion
- **Tab** or **Enter** - Insert selected item
- **Escape** - Dismiss without inserting

### Signature Help
- **Ctrl+Shift+Space** - Show/rehow signature help
- **↑↓ Arrow keys** - Cycle through overloads (when multiple)

---

## Customization

### Trigger Behavior

**Control when IntelliSense appears:**

```json
{
  "editor.quickSuggestions": {
    "comments": false,  // Don't show in comments
    "strings": true,    // Show in strings
    "other": true       // Show everywhere else
  }
}
```

---

### Acceptance Behavior

**Control how suggestions are accepted:**

```json
{
  // Accept with Enter key
  "editor.acceptSuggestionOnEnter": "on",
  
  // Accept with commit characters like ( . , etc.
  "editor.acceptSuggestionOnCommitCharacter": true,
  
  // Show suggestions while typing
  "editor.wordBasedSuggestions": "matchingDocuments"
}
```

---

### Suggestion Filtering

**Control what appears in suggestions:**

```json
{
  // Show snippets
  "editor.snippetSuggestions": "inline",
  
  // Tab completes suggestions
  "editor.tabCompletion": "on",
  
  // Auto-select first suggestion
  "editor.suggestSelection": "first"
}
```

---

## Tips & Tricks

### Quick Function Lookup
1. Start typing function name
2. IntelliSense shows matches with descriptions
3. Hover over suggestion for full documentation

### Parameter Hints During Editing
- Place cursor inside function parentheses
- Press **Ctrl+Shift+Space**
- See parameter hints even after function is written

### Explore Available Functions
- Type a few letters (e.g., `DAT`)
- See all functions starting with those letters
- Read descriptions to discover functionality

### Case-Insensitive Matching
- Type `sub` or `SUB` or `Sub`
- All match the same function
- Use whatever case is comfortable

---

## Troubleshooting

### IntelliSense Not Appearing

**Check:**
1. File extension is `.clw`, `.inc`, or `.equ`
2. Solution is opened (folder with `.sln` file)
3. Extension is activated (check status bar shows "Clarion")

**Try:**
- Press **Ctrl+Space** to manually trigger
- Reload window: `Ctrl+Shift+P` → "Developer: Reload Window"
- Check Output panel for errors

---

### Wrong Suggestions Appearing

**Possible causes:**
1. Not in correct context (DATA vs CODE section)
2. Variable not in scope
3. File not part of solution

**Solution:**
- Check you're in the right section
- Verify variable is declared in accessible scope

---

### Parameter Hints Not Showing

**Check:**
1. Cursor is inside function parentheses
2. Function is recognized built-in function
3. Not inside a comment

**Try:**
- Press **Ctrl+Shift+Space** manually
- Ensure proper syntax: `FunctionName(`

---

## Related Features

- **[Navigation](navigation.md)** - F12 uses same symbol resolution
- **[Code Editing](code-editing.md)** - Snippets complement IntelliSense
- **[Common Tasks](../guides/common-tasks.md)** - Usage examples

