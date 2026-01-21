---
name: antlr-diagnostics
description: Analyze Clarion files using ANTLR grammar diagnostic tools. Use when debugging parse errors, testing grammar changes, or validating that files parse correctly.
---

# ANTLR Grammar Diagnostic Skill

## Purpose
This skill helps diagnose parse errors in Clarion source files using the ANTLR grammar. It runs the `diagnose-folding.js` diagnostic tool and interprets the results to suggest grammar fixes.

## When to Use This Skill
- User asks to "analyze" or "diagnose" a specific Clarion file
- Testing grammar changes against real-world Clarion code
- Investigating why folding stops at a certain line
- Debugging parse errors reported by the language server
- Validating that production Clarion files parse correctly

## How It Works

### The Diagnostic Process

```
┌─────────────────┐
│  Clarion File   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  diagnose-folding.js    │  ← Loads fresh ANTLR grammar
│  - Lexes file           │  ← No caching, no VS Code
│  - Parses with LL mode  │  ← Two-stage SLL→LL parsing
│  - Collects errors      │  ← Tracks line/col/message
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Error Report           │
│  - Line numbers         │
│  - Error messages       │
│  - Code context         │
│  - Parse time stats     │
└─────────────────────────┘
```

### What Gets Reported
1. **File Info**: Total lines, file size
2. **Parse Time**: How long parsing took
3. **Error Count**: Number of parse errors found
4. **Error Details**: For each error:
   - Line and column number
   - Error message (what the parser expected vs. what it got)
   - The actual token that caused the error
   - Code context (the line containing the error)
5. **First Error Location**: Where parsing first failed

### Key Files

**Diagnostic Tool:**
- `diagnose-folding.js` - Standalone script that parses files and reports errors
- Located at: `F:\github\Clarion-Extension\Clarion-Extension\diagnose-folding.js`
- Usage: `node diagnose-folding.js <path-to-file.clw>`

**Grammar Files:**
- `antlr-grammar/lexer/ClarionLexer.g4` - Combines all lexer rules
- `antlr-grammar/parser/ClarionParser.g4` - Main parser grammar (~1200 lines)
- `antlr-grammar/lexer/ClarionKeywords.g4` - Keywords (PROCEDURE, IF, LOOP, etc.)
- `antlr-grammar/lexer/ClarionTypes.g4` - Data types (STRING, LONG, GROUP, etc.)
- `antlr-grammar/lexer/ClarionIdentifiers.g4` - LABEL and IDENTIFIER tokens

**Language Server:**
- `server/src/providers/AntlrFoldingProvider.ts` - Uses ANTLR for folding
- Currently using LL mode only (SLL disabled due to ambiguities)

## Clarion Syntax Research

**When unsure about Clarion syntax:**
- Use the Clarion documentation in `F:\github\Clarion-Extension\Clarion-Extension\ClarionDocs` for research
- **IMPORTANT:** ClarionDocs contains `.htm` files, NOT `.md` files - search accordingly
- The grammar should match real Clarion compiler behavior, not assumptions
- Cross-reference syntax examples from production code with official documentation

## Step-by-Step Process

### 1. Run the Diagnostic Tool

```powershell
cd F:\github\Clarion-Extension\Clarion-Extension
node diagnose-folding.js <path-to-clarion-file>
```

**Example:**
```powershell
node diagnose-folding.js C:\Clarion\Clarion11.1\LibSrc\win\ABFILE.CLW
```

### 2. Interpret the Results

#### Success Case
```
✓ SUCCESS - File parses without errors
```
**Meaning:** The grammar handles this file perfectly. No action needed.

#### Error Case
```
✗ FAILED - 5 parse errors found
  First error at line 56
```

**Meaning:** Parse errors stop the parse tree from being built, which stops folding. Need to fix grammar.

### 3. Analyze Each Error

**Common Error Patterns:**

#### Pattern 1: "mismatched input X expecting Y"
```
Line 56, Col 50
mismatched input '*' expecting {CLASS, 'PRIVATE', ...}
Token: '*'
Code: DupString PROCEDURE(STRING),*STRING,PRIVATE
```

**Diagnosis:** The parser doesn't expect `*` at this position. Looking at the code, it's a **pointer return type** (`,*STRING`).

**Fix:** Add pointer support to return type rule:
```antlr
returnType
    : COMMA MULTIPLY? dataType  // Support ,*STRING
    ;
```

#### Pattern 2: "extraneous input X expecting Y"
```
Line 129, Col 11
extraneous input 'DRIVER' expecting {'PRIVATE', 'STATIC', ...}
Token: 'DRIVER'
Code: Trace FILE,DRIVER('ASCII'),CREATE
```

**Diagnosis:** The parser sees DRIVER as "extra" - it doesn't know FILE can have DRIVER attribute.

**Fix:** This is likely inside a COMPILE/OMIT block (preprocessor issue). Check if line is in conditional compilation block.

#### Pattern 3: "no viable alternative at input X"
```
Line 60, Col 42
no viable alternative at input '(SIGNED'
Token: 'SIGNED'
Code: OpCodeCanBeDone PROCEDURE(SIGNED opCode),BYTE,PRIVATE
```

**Diagnosis:** SIGNED isn't recognized as a valid type in the `parameterBaseType` rule.

**Fix:** Add SIGNED to parameter and base type rules:
```antlr
parameterBaseType
    : BYTE | SHORT | USHORT | LONG | ULONG | UNSIGNED | SIGNED
    | REAL | SREAL | DECIMAL | PDECIMAL
    ...
```

#### Pattern 4: "expecting <EOF>"
```
Line 46, Col 30
mismatched input 'END' expecting <EOF>
Token: 'END'
Code:                               END
```

**Diagnosis:** Parser thinks the file should end here. This indicates the parser got confused earlier and can't continue. Often caused by **SLL mode** being too aggressive.

**Fix:** 
1. Check if SLL mode is enabled (should be disabled for now)
2. Look at preceding structures - likely an ambiguity in structure declaration
3. May need to add more alternatives to handle the construct

### 4. Common Grammar Fixes

#### Missing Type Support
**Symptoms:** "no viable alternative", "expecting {type list}"
**Solution:** Add missing type to `baseType` and `parameterBaseType` rules
```antlr
baseType
    : BYTE (LPAREN expression RPAREN)?
    | SIGNED (LPAREN expression RPAREN)?  // ADD THIS
    | FILE  // Structure types
    | VIEW
    | RECORD
    ...
```

#### Missing Attribute Support
**Symptoms:** "mismatched input 'KEYWORD' expecting {attribute list}"
**Solution:** Add keyword to `structureAttribute` or relevant attribute rule
```antlr
structureAttribute
    : PRE | DIM | OVER | STATIC | THREAD | TYPE
    | PRIVATE   // ADD THIS
    | PROTECTED // ADD THIS
    ...
```

#### Missing Keyword as Identifier
**Symptoms:** "no viable alternative" when keyword used as variable/label name
**Solution:** Add keyword to `softKeyword` rule
```antlr
softKeyword
    : GROUP | QUEUE | CLASS
    | LINK  // ADD THIS - allows "Link PROCEDURE"
    ...
```

#### Column 0 Ambiguity
**Symptoms:** Keywords at column 0 not recognized as labels
**Solution:** Add column predicate to keyword in lexer
```antlr
// In ClarionKeywords.g4
LINK : {this.charPositionInLine > 0}? 'LINK' ;  // Now soft keyword
```

### 5. Testing Workflow

After making a grammar fix:

```powershell
# 1. Compile grammar
npm run compile

# 2. Re-test file
node diagnose-folding.js <file-path>

# 3. Compare error count
# Before: "5 parse errors"
# After:  "1 parse error"  ← Progress!

# 4. If errors reduced, repeat for remaining errors
# 5. If no change, the fix didn't work - try different approach
```

### 6. Known Limitations

#### OMIT/COMPILE Blocks
**Issue:** Preprocessor directives that consume text until terminator string
```clarion
COMPILE('***',TraceFiles)
Trace FILE,DRIVER('ASCII'),CREATE
R     RECORD
B       STRING(1000)
      END
***
```
**Status:** Known limitation - requires preprocessor-level handling
**Workaround:** Accept errors inside these blocks

#### SLL Mode Ambiguities
**Issue:** SLL mode produces incorrect parse trees for some constructs
**Affected:** Structure declarations with optional labels (QUEUE, CLASS, GROUP)
**Status:** SLL mode currently disabled - using LL only
**Future:** May re-enable when ambiguities resolved

#### Complex IF+ELSIF Patterns
**Issue:** Single-line THEN followed by ELSIF on next line
```clarion
if x then a           ← Single line with THEN
elsif y then b        ← Parser can't disambiguate this
end
```
**Status:** Known edge case - affects ~1 pattern in 14K lines
**Priority:** Low - very rare in practice

## Summary Protocol

When diagnosing a file, always:

1. **Run diagnostic script** - Get fresh, accurate parse results
2. **Count errors** - Track progress (started with 15, now at 4)
3. **Analyze first error** - First error often blocks subsequent parsing
4. **Identify pattern** - Match against common error patterns above
5. **Propose fix** - Specific grammar rule change
6. **Test fix** - Compile and re-run diagnostic
7. **Measure progress** - Did error count go down?
8. **Iterate** - Repeat for remaining errors
9. **Document** - Note what was fixed and why

## Example Session

```
User: "Can you analyze ABFILE.CLW?"

Response:
"Running ANTLR diagnostic on ABFILE.CLW..."

[Run: node diagnose-folding.js C:\Clarion\Clarion11.1\LibSrc\win\ABFILE.CLW]

"Found 5 errors. Let me analyze them:

Error 1 (Line 56): Missing pointer return type support
  Fix: Add MULTIPLY? to returnType rule

Error 2-5 (Lines 62-66): Same issue - pointer return types

Error 6 (Line 129): DRIVER attribute on FILE inside COMPILE block
  This is the known OMIT/COMPILE limitation

Let me fix the pointer return type issue first..."

[Make grammar change]
[Compile]
[Re-run diagnostic]

"After fix: Down to 1 error (the COMPILE block issue).
Successfully parsing 4122 out of 4123 lines (99.98%)!"
```

## Quick Reference

### Essential Commands
```powershell
# Diagnose a file
node diagnose-folding.js <file.clw>

# Compile grammar after changes
npm run compile

# Clean rebuild
Remove-Item -Recurse out
npm run compile

# View grammar rules
Get-Content antlr-grammar\parser\ClarionParser.g4 | Select-String "^ruleName"
```

### Error Message Decoder
- **"mismatched input"** → Grammar doesn't expect this token here
- **"extraneous input"** → Grammar sees token as unwanted extra
- **"no viable alternative"** → None of the rule alternatives match
- **"expecting <EOF>"** → Parser thinks file should end (got confused earlier)

### Fix Checklist
- [ ] Identified the error pattern
- [ ] Located the relevant grammar rule
- [ ] Made minimal change to grammar
- [ ] Compiled successfully
- [ ] Re-ran diagnostic
- [ ] Verified error count decreased
- [ ] Tested on other files if possible
- [ ] Documented what was fixed

---

**Remember:** Always consult ClarionDocs when uncertain about syntax. The grammar should match real Clarion compiler behavior, not just documentation.
