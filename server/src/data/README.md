# Clarion Built-in Functions

This directory contains definitions for Clarion's built-in functions used by the SignatureHelpProvider to show parameter hints.

## File Structure

- **`clarion-builtins.json`** - JSON file containing all function definitions
- **`README.md`** - This file

## JSON Schema

```json
{
  "functions": [
    {
      "name": "FUNCTIONNAME",
      "signatures": [
        {
          "params": ["TYPE param1", "TYPE param2"],
          "returnType": "TYPE",
          "description": "What this function does"
        }
      ]
    }
  ]
}
```

## Adding a New Function

### Example: Adding MESSAGE function

```json
{
  "name": "MESSAGE",
  "signatures": [
    {
      "params": ["STRING text"],
      "returnType": "BYTE",
      "description": "Displays a message box with text and OK button"
    },
    {
      "params": ["STRING text", "STRING title"],
      "returnType": "BYTE",
      "description": "Displays a message box with text, title, and OK button"
    },
    {
      "params": ["STRING text", "STRING title", "LONG icon"],
      "returnType": "BYTE",
      "description": "Displays a message box with text, title, icon, and buttons"
    }
  ]
}
```

### Guidelines

1. **Function Name**: Use UPPERCASE (though lookup is case-insensitive)
2. **Parameters**: Use format `"TYPE paramName"` (e.g., `"STRING text"`, `"LONG count"`)
3. **Return Type**: Use Clarion data types (`BYTE`, `STRING`, `LONG`, etc.)
4. **Description**: Keep concise, describe what the function does
5. **Overloads**: Each signature variant is a separate entry in the `signatures` array

## Common Clarion Types

- `BYTE` - 8-bit unsigned integer (0-255)
- `SHORT` - 16-bit signed integer
- `USHORT` - 16-bit unsigned integer
- `LONG` - 32-bit signed integer
- `ULONG` - 32-bit unsigned integer
- `REAL` - 4-byte floating point
- `DECIMAL` - Packed decimal
- `STRING` - Character string
- `CSTRING` - Null-terminated string
- `PSTRING` - Pascal string (length prefixed)
- `DATE` - Date value (LONG format)
- `TIME` - Time value (LONG format)
- `ANY` - Any data type

## Extracting from CHM Files

When using Clarion CHM help files:

1. Open the CHM file
2. Navigate to the function reference section
3. For each function, extract:
   - Function name
   - Parameter list (with types)
   - Return type
   - Description/purpose

## Testing

After adding functions:

1. Rebuild the extension: `npm run compile`
2. Reload VS Code
3. Type the function name followed by `(` in a Clarion file
4. Signature help should appear showing your new function

## Current Status

**Functions defined:** 29

### Functions Available:

**String Functions (6):**
1. **CLIP** - Removes trailing spaces from a string
2. **SUB** - Returns a portion of a string  
3. **UPPER** - Converts string to uppercase
4. **LOWER** - Converts string to lowercase
5. **LEN** - Returns the length of a string
6. **FORMAT** - Formats a numeric value according to a picture string

**Core File/Queue Operations (10):**
7. **ADD** (4 overloads) - Adds records to files or queue entries
8. **PUT** (5 overloads) - Updates records in files, queues, or views
9. **GET** (3 overloads) - Reads records from files or queue entries
10. **DELETE** (3 overloads) - Removes records from files, queues, or views
11. **SET** (4 overloads) - Positions for sequential file/view processing
12. **NEXT** (2 overloads) - Reads next record from files or views in sequence
13. **PREVIOUS** (2 overloads) - Reads previous record from files or views in sequence
14. **OPEN** (2 overloads) - Opens a file for access
15. **CLOSE** (1 overload) - Closes an open file
16. **CREATE** (2 overloads) - Creates an empty data file

**File I/O Functions (8):**
17. **EOF** - Returns non-zero when end of file reached
18. **EXISTS** - Returns non-zero if file exists on disk
19. **RECORDS** - Returns the number of records in a file
20. **NAME** - Returns the filename without path
21. **PATH** - Returns the current working directory
22. **COPY** - Copies a file from source to destination
23. **REMOVE** - Deletes a file from disk
24. **RENAME** - Renames or moves a file or directory

**Error Handling Functions (4):**
25. **ERRORCODE** - Returns error code from last file operation
26. **ERROR** - Returns error message text from last file operation
27. **FILEERROR** - Returns file driver error message
28. **FILEERRORCODE** - Returns file driver error code

**Dialog Functions (1):**
29. **MESSAGE** (4 overloads) - Displays a message box

The JSON file now has 29 Clarion built-in functions with 48 total signatures ready for signature help!

## Tips

- Start with the most commonly used functions
- Group related functions together (e.g., all string functions)
- Add comments in the JSON (supported by most parsers)
- Validate JSON syntax before committing
