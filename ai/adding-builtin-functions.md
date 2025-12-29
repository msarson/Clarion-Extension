# Adding Clarion Built-in Functions to clarion-builtins.json

## Quick Start

When adding new Clarion built-in functions, follow this workflow:

### 1. Check What's Already Been Done

```powershell
$json = Get-Content "server\src\data\clarion-builtins.json" -Raw | ConvertFrom-Json
Write-Host "Current function count: $($json.functions.Count)"
$json.functions | ForEach-Object { Write-Host "  - $($_.name) ($($_.signatures.Count) overload(s))" }
```

### 2. Find Documentation in Decoded CHM Files

Location: `C:\Clarion\Clarion11.1\bin\decoded\`

Search for functions:
```powershell
$chmPath = "C:\Clarion\Clarion11.1\bin\decoded"
Get-ChildItem $chmPath -Filter "*functionname*.htm"
```

### 3. Read the CHM Documentation

Use the `view` tool to read the .htm file and understand:
- Function signature(s) - look for parameters and return types
- All overloads - functions may work on FILES, QUEUEs, VIEWs, WINDOWs, etc.
- Practical usage context - what it's actually used for

### 4. Key Things to Watch For

**Multiple Entity Types:**
- OPEN works on: FILE, VIEW, WINDOW, APPLICATION, REPORT
- GET works on: FILE, QUEUE (but NOT VIEW)
- NEXT works on: FILE, VIEW (but NOT QUEUE)
- Always verify in the CHM "Usage" sections

**Compiler Directives vs Runtime Functions:**
- INCLUDE, MEMBER, MODULE, LINK = compile-time directives
- OPEN, GET, ADD, PUT = runtime statements
- Both can be in the JSON, just describe them accurately

**Parameter Types:**
- Use proper Clarion types: FILE, QUEUE, VIEW, WINDOW, APPLICATION, REPORT, STRING, LONG, BYTE, etc.
- Check if parameters are optional

**Return Types:**
- Many statements don't return values (empty string "")
- Functions return: STRING, LONG, BYTE, etc.

### 5. Write Good Descriptions

**Bad (too vague):**
- "Positions for sequential processing"
- "Opens a file"

**Good (contextual and helpful):**
- "Positions file pointer to the beginning of the file in record number sequence. Used before NEXT to read from start."
- "Opens a file for reading and writing. Creates the file if it doesn't exist (unless CREATE attribute is 0). Check ERRORCODE() after."

Include:
- **What** it does
- **When** to use it
- **Prerequisites** (e.g., "Key fields must be set first")
- **Related functions** (e.g., "Use SET before NEXT")
- **Gotchas** (e.g., "Not supported by all drivers")

### 6. Add to JSON

Edit `server\src\data\clarion-builtins.json`:

```json
{
  "name": "FUNCTIONNAME",
  "signatures": [
    {
      "params": ["TYPE param1", "TYPE param2"],
      "returnType": "TYPE",
      "description": "Clear, helpful description with context"
    },
    {
      "params": ["TYPE param"],
      "returnType": "TYPE", 
      "description": "Second overload description"
    }
  ]
}
```

### 7. Test

```powershell
npm test
```

Should show passing tests. The JSON is auto-copied on build.

## Common Function Categories

### Already Added (Check JSON First!)
- String Functions: CLIP, SUB, UPPER, LOWER, LEN, FORMAT
- Core File/Queue Operations: ADD, PUT, GET, DELETE, SET, NEXT, PREVIOUS, OPEN, CLOSE, CREATE
- File I/O: EOF, EXISTS, RECORDS, NAME, PATH, COPY, REMOVE, RENAME
- Error Handling: ERRORCODE, ERROR, FILEERROR, FILEERRORCODE
- Dialog: MESSAGE
- Compiler Directives: INCLUDE, MEMBER, MODULE, LINK

### Common Categories to Add
- Date/Time Functions: TODAY, CLOCK, DATE, DAY, MONTH, YEAR, etc.
- Numeric Functions: ABS, SQRT, NUMERIC, etc.
- String Functions: INSTRING, CENTER, ALL, etc.
- Queue Functions: RECORDS(queue), FREE(queue), POINTER(queue), etc.
- Memory Functions: NEW, DISPOSE, SIZE, ADDRESS, etc.
- Conversion Functions: VAL, CHR, ASC, etc.

## Tips

1. **Don't assume** - Always check the CHM documentation
2. **Test as you go** - Run tests after adding a few functions
3. **Be precise** - If it only works on FILE and VIEW, don't add QUEUE
4. **Add context** - Good descriptions help developers understand when to use the function
5. **Check for duplicates** - Always review `clarion-builtins.json` first

## File Locations

- **JSON Data**: `server\src\data\clarion-builtins.json`
- **Service**: `server\src\utils\BuiltinFunctionService.ts`
- **Tests**: `server\src\test\BuiltinFunctionService.test.ts`
- **CHM Files**: `C:\Clarion\Clarion11.1\bin\decoded\`
- **Documentation**: `server\src\data\README.md` (skip updating during active work)

## Current Status

Run this to see what's been added:

```powershell
$json = Get-Content "server\src\data\clarion-builtins.json" -Raw | ConvertFrom-Json
$totalSigs = ($json.functions | ForEach-Object { $_.signatures.Count } | Measure-Object -Sum).Sum
Write-Host "Functions: $($json.functions.Count), Total Signatures: $totalSigs"
```

Last updated: 2025-12-29
