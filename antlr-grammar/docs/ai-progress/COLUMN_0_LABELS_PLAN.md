# Column-0 Label Implementation Plan

## Problem Statement

Clarion allows keywords to be used as labels when they appear at column 0:

```clarion
Window  WINDOW(...),AT(10,10)    ! Window is a LABEL
Button  BUTTON(...),AT(20,20)    ! Button is a LABEL  
String  STRING(20)                ! String is a LABEL
```

Without column-position awareness, the lexer tokenizes `Window` as `WINDOW` keyword, not as an identifier.

## Solution: Hybrid Option 3

Use semantic predicates on structure keywords to prevent them from matching at column 0.

### Lexer Strategy

**Add column-0 LABEL token:**
```antlr
LABEL : {getCharPositionInLine() == 0}? [A-Za-z_][A-Za-z0-9_:]* ;
```

**Add predicates to structure keywords (non-column-0):**
```antlr
WINDOW : {getCharPositionInLine() > 0}? 'WINDOW' ;
BUTTON : {getCharPositionInLine() > 0}? 'BUTTON' ;
STRING : {getCharPositionInLine() > 0}? 'STRING' ;
```

**Keep control-flow keywords without predicates:**
```antlr
IF : 'IF' ;      // Never at column 0
LOOP : 'LOOP' ;  // Never at column 0
END : 'END' ;    // Never at column 0
```

### Structure Keywords Needing Predicates (~35)

**Data Types (can be labels):**
- STRING, CSTRING, PSTRING, BSTRING, USTRING, ASTRING
- BYTE, SHORT, USHORT, LONG, ULONG
- REAL, SREAL, DECIMAL, PDECIMAL
- DATE, TIME, MEMO, BLOB

**Structure Types (can be labels):**
- WINDOW, REPORT, APPLICATION
- FILE, GROUP, QUEUE, RECORD, VIEW, TABLE
- CLASS, INTERFACE, MODULE

**Control Types (can be labels):**
- BUTTON, ENTRY, TEXT, LIST, COMBO, CHECK, RADIO
- OPTION, IMAGE, LINE, BOX, ELLIPSE, PANEL
- PROGRESS, REGION, PROMPT, SPIN
- SHEET, TAB
- MENU, MENUBAR, TOOLBAR, ITEM

**Report Structures:**
- FORM, HEADER, DETAIL, FOOTER, BREAK

### Control-Flow Keywords (NO predicates - never at column 0)

- IF, ELSIF, ELSE, THEN
- LOOP, TIMES, UNTIL, WHILE, BY, TO
- CASE, OF, OROF
- DO, EXECUTE, ACCEPT
- BREAK, CYCLE, EXIT, RETURN
- GOTO, ROUTINE
- CODE, DATA, MAP, END
- PROGRAM, PROCEDURE, MEMBER
- OPEN, CLOSE

### Parser Changes

Update declaration rules to accept both LABEL and IDENTIFIER:

```antlr
windowDeclaration
    : (LABEL | IDENTIFIER) WINDOW windowArgs ...
    ;

dataDeclaration
    : (LABEL | IDENTIFIER) dataType ...
    ;
```

## Implementation Steps

1. ✅ Create this plan document
2. [ ] Add documentation comment to ClarionTypes.g4
3. [ ] Add column-0 LABEL token to ClarionIdentifiers.g4
4. [ ] Add predicates to ~35 structure keywords in ClarionTypes.g4
5. [ ] Update parser rules to accept (LABEL | IDENTIFIER)
6. [ ] Generate lexer/parser
7. [ ] Build TypeScript
8. [ ] Test on UpdatePYAccount_IBSCommon.clw
9. [ ] Verify test suite (no regressions)
10. [ ] Document results

## Expected Outcome

- ✅ `Window  WINDOW(...)` → LABEL('Window') + WINDOW keyword
- ✅ Syntax highlighting works (keywords still recognized)
- ✅ Error messages clear ("expected WINDOW" not "expected IDENTIFIER")
- ✅ Parse tree distinguishes labels from keywords
- ✅ Column-0 keywords now parse as labels correctly

## Documentation

Add to grammar files:

```antlr
// ============================================================================
// COLUMN-0 LABEL HANDLING
// ============================================================================
// NOTE:
// Clarion labels may use keyword text (WINDOW, STRING, GROUP, etc.).
// Column 0 always implies label position.
// Structure keywords are predicated to non-column-0 to allow this.
//
// Example:
//   Window  WINDOW(...),AT(10,10)
//   ^^^^^^  ^^^^^^^^^^^^^^^^^^^^^^^
//   LABEL   WINDOW keyword + attributes
// ============================================================================
```
