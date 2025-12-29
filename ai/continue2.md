# Clarion Extension - Session Continuation Guide (2025-12-29)

## Current Session Summary

### ✅ Completed Work

#### 1. Built-in Functions & Keywords System
- Created `clarion-builtins.json` with 42 entries (68+ signatures total)
- Created `BuiltinFunctionService.ts` to manage built-ins  
- Integrated with **HoverProvider** - shows context-aware hover with parameter matching
- Integrated with **SignatureHelpProvider** - shows all signatures for functions, filters pure keywords
- Created `ai/builtin-functions-guide.md` for extraction process

**Functions Added:**
- File I/O: OPEN, CLOSE, ADD, PUT, GET, DELETE, NEXT, SET, FREE
- String: MESSAGE, CLIP, SUB, LEN, UPPER, LOWER, INSTRING, NUMERIC  
- Compiler: INCLUDE, MODULE, MEMBER, LINK, OMIT, COMPILE
- Control: DISPLAY, CLEAR
- Keywords: PROGRAM, CODE, MAP, LOOP

**Key Behaviors Implemented:**
- Hover on `DISPLAY` (no parens) → Shows only 0-param signature
- Hover on `DISPLAY(x)` → Shows only 1-param signature
- SignatureHelp on `DISPLAY(` → Shows all 3 signatures
- Pure keywords (MAP, PROGRAM) → Hover only, no signature help
- Case-insensitive matching

#### 2. Hover Provider Enhancements
- Smart parameter counting for built-ins
- Detects parentheses presence (bare keyword vs function call)
- Filters class method calls (ignores words preceded by dot)
- Shows only matching signature based on actual parameter count

### 🚧 In Progress / Next Steps

#### 1. **Attributes System** (NEW PRIORITY)
**Goal:** Add Clarion attributes (AT, COLOR, FONT, etc.) with context-aware completion

**Documentation Source:**
- Primary: `C:\Clarion\Clarion11.1\bin\decoded\window_and_report_attributes.htm`
- Individual attribute pages (130+ attributes total):
  - `at__set_position_and_size_.htm`
  - `color__set_color_.htm` 
  - `font__set_default_font_.htm`
  - etc.

**Attribute Categories Found:**
- WINDOW/REPORT: AT, CENTER, MODAL, MDI, SYSTEM, MAX, ICON, STATUS, etc.
- Display: COLOR, FONT, GRAY, HIDE, DISABLE
- Behavior: AUTO, IMM, READONLY, REQ, SKIP
- Layout: HSCROLL, VSCROLL, RESIZE, TILED, CENTERED
- Controls: USE, VALUE, FROM, FORMAT, RANGE
- OLE: AUTOSIZE, CLIP, CREATE, DOCUMENT, LINK, OPEN
- Reports: ABSOLUTE, ALONE, PAPER, LANDSCAPE, PREVIEW
- Totals: SUM, AVE, CNT, MAX, MIN, RESET
- And many more...

**Implementation Plan:**

1. **Data Structure** - Create `server/src/data/clarion-attributes.json`:
   ```json
   {
     "attributes": [
       {
         "name": "AT",
         "applicableTo": ["WINDOW", "REPORT", "CONTROL"],
         "params": ["LONG x", "LONG y", "LONG width", "LONG height"],
         "description": "Specifies position and size...",
         "propertyEquate": "PROP:AT"
       }
     ]
   }
   ```

2. **Service Layer** - Create `server/src/utils/AttributeService.ts`:
   ```typescript
   class AttributeService {
     isAttribute(name: string): boolean
     getAttributes(context: string): AttributeDefinition[]
     getSignature(name: string): SignatureInformation[]
   }
   ```

3. **Integration Points:**
   - HoverProvider → Show attribute documentation
   - CompletionProvider → Suggest valid attributes by context
   - SignatureHelpProvider → Show attribute parameters

4. **Context Detection:**
   - Use DocumentStructure to detect current structure type
   - Filter attributes based on context
   - Example: Inside WINDOW → suggest WINDOW attributes only

**Extraction Process:**
1. Start with top 20-30 WINDOW attributes (most common)
2. Add as proof-of-concept and test
3. Continue in batches of 20-30
4. Total ~130 attributes to extract

**Next Steps (When Resuming):**
```powershell
# Start extracting common WINDOW attributes
code "C:\Clarion\Clarion11.1\bin\decoded\at__set_position_and_size_.htm"
code "C:\Clarion\Clarion11.1\bin\decoded\center__set_centered_window_position_.htm"

# Create the data file
New-Item "server\src\data\clarion-attributes.json"

# Create the service
New-Item "server\src\utils\AttributeService.ts"
```

#### 2. Continue Built-in Function Extraction
**Reference:** `ai\builtin-functions-guide.md`

**Priority Functions to Add:**
- More string: FORMAT, PATTERN, ALL, ANY
- Math: ABS, SQRT, ROUND, RANDOM
- Date/Time: TODAY, CLOCK, DATE, TIME, DAY, MONTH, YEAR
- Queue: RECORDS, POINTER, SORT
- File: EOF, BUFFER, ERRORCODE, ERROR
- Control: ACCEPT, ALERT, REJECT, SELECT, CYCLE, BREAK

**Process:**
1. Check `clarion-builtins.json` to avoid duplicates
2. Find function in `C:\Clarion\Clarion11.1\bin\decoded\`
3. Read actual HTML documentation (don't guess!)
4. Add with accurate param counts and descriptions
5. Test with `npm test`

### 📋 Implementation Notes

**Design Decisions Made:**
- Functions with optional params → Separate signatures for each variant
- Keywords (0 params) → Hover only, filtered from signature help
- Bare keywords assume `()` → Show 0-param signature in hover
- Case-insensitive matching throughout
- Parameter count matching for precise hover info

**Files Modified This Session:**
- `server/src/data/clarion-builtins.json` - function/keyword definitions
- `server/src/utils/BuiltinFunctionService.ts` - service layer
- `server/src/providers/HoverProvider.ts` - built-in hover support
- `server/src/providers/SignatureHelpProvider.ts` - built-in signatures
- `ai/builtin-functions-guide.md` - extraction guide

**Files to Create Next:**
- `server/src/data/clarion-attributes.json` - attribute definitions
- `server/src/utils/AttributeService.ts` - attribute service
- `ai/attribute-extraction-guide.md` - extraction process

### ⚠️ Important Reminders

1. **Always check HTML docs** - Don't guess syntax from function names
2. **Test after changes** - Run `npm test` frequently
3. **Clarion is case-insensitive** - All matching must be case-insensitive
4. **Clarion syntax quirks:**
   - Functions without params can be called without `()`
   - `DISPLAY` = `DISPLAY()`
   - LOOP is a structure keyword, not a function
   - Attributes are NOT functions (different system entirely)
5. **Your assumptions may be wrong** - Example: You thought DISPLAY/ACCEPT were window-related, but that's incorrect. Always verify.

### 🎯 Next Session Starting Points

**Option A - Start Attributes System (Recommended):**
```powershell
# Review what attributes exist
Start-Process "C:\Clarion\Clarion11.1\bin\decoded\window_and_report_attributes.htm"

# Check current progress
Get-Content "ai\continue2.md"

# Start with most common attributes
code "C:\Clarion\Clarion11.1\bin\decoded\at__set_position_and_size_.htm"
code "C:\Clarion\Clarion11.1\bin\decoded\use__set_field_equate_label_or_control_update_variable_.htm"

# Create files
New-Item "server\src\data\clarion-attributes.json" -ItemType File
New-Item "server\src\utils\AttributeService.ts" -ItemType File
```

**Option B - Continue Built-in Functions:**
```powershell
# Check what we have
$json = Get-Content "server\src\data\clarion-builtins.json" -Raw | ConvertFrom-Json
Write-Host "Currently have: $($json.functions.Count) entries"
$json.functions | Select-Object name | Sort-Object name

# Find more functions to add
ls "C:\Clarion\Clarion11.1\bin\decoded" | Where-Object { $_.Name -match "^(abs|sqrt|round|today|clock)" }

# Add more using guide
code "ai\builtin-functions-guide.md"
```

**Option C - Test Current Work:**
```powershell
# Build and test
npm run compile
npm test

# Manual testing in VS Code:
# 1. Open a .clw file
# 2. Hover over: MESSAGE, DISPLAY, CLEAR, LOOP, MAP, PROGRAM
# 3. Type and trigger signature help: DISPLAY(, FREE(, OMIT(, CLEAR(
# 4. Verify hover shows correct signature based on param count
```

### 📊 Stats
- Built-in entries: 42
- Total signatures: 68+
- Attributes to add: ~130
- Tests passing: 400
- Pre-existing test failures: 7 (maintained baseline)
- Documentation files: 2 (continue.md, builtin-functions-guide.md)

---

## Quick Reference

### CHM Documentation Locations
```
C:\Clarion\Clarion11.1\bin\decoded\
  ├── window_and_report_attributes.htm (index)
  ├── at__set_position_and_size_.htm
  ├── color__set_color_.htm
  ├── (130+ other attribute files)
  ├── message__display_a_message_box_.htm
  ├── clip__remove_trailing_spaces_.htm
  └── (hundreds of function files)
```

### Key Commands
```powershell
# Test
npm test

# Build
npm run compile

# Check file
Get-Content "server\src\data\clarion-builtins.json" -Raw | ConvertFrom-Json | ConvertTo-Json -Depth 10

# Find docs
ls "C:\Clarion\Clarion11.1\bin\decoded" | Where-Object { $_.Name -match "pattern" }
```

### File Structure
```
server/
  └── src/
      ├── data/
      │   ├── clarion-builtins.json (42 entries)
      │   └── clarion-attributes.json (TO CREATE)
      ├── utils/
      │   ├── BuiltinFunctionService.ts (exists)
      │   └── AttributeService.ts (TO CREATE)
      └── providers/
          ├── HoverProvider.ts (integrated)
          ├── SignatureHelpProvider.ts (integrated)
          └── CompletionProvider.ts (TO INTEGRATE)
```

---

**Good luck with attributes! Start small (20-30), test thoroughly, then scale up! 🚀**
