# Clarion Language Knowledge Base

This document provides comprehensive reference information about the Clarion programming language to help guide language server implementation and diagnostics.

---

## Conditional Compilation - OMIT and COMPILE

### OMIT Directive

**Syntax:** `OMIT(terminator [,expression])`

The OMIT directive specifies a block of source code lines to be omitted from the compilation. The omitted block begins with the OMIT directive and ends with the line that contains the same string constant as the terminator. **The entire terminating line is included in the OMIT block.**

**Key Rules:**
- The `terminator` is a string constant (e.g., `'**END**'`, `'***'`) that marks the last line of the omitted block
- The terminator string is **case-sensitive** - it must match exactly
- The terminator can appear anywhere on the line (e.g., as a comment like `!**END**` or standalone like `***`)
- The line containing the terminator is NOT compiled (it's part of the OMIT block)
- An optional `expression` parameter allows conditional OMIT execution
- If the expression is true, the OMIT executes (code is omitted)
- If the expression is false or missing, code is omitted unconditionally

**Expression Format:**
```clarion
<equate>
<equate> = <integer constant>
<equate> <> <integer constant>
<equate> > <integer constant>
<equate> < <integer constant>
<equate> >= <integer constant>
<equate> <= <integer constant>
```

**Nesting:**
- Maximum nesting: 8 levels with conditions that don't omit, plus 1 additional level that does omit
- OMIT and COMPILE blocks can be nested within each other

**Examples:**
```clarion
! Unconditional OMIT
OMIT('**END**')
  SIGNED   EQUATE(SHORT)
  UNSIGNED EQUATE(USHORT)
**END**

! Conditional OMIT - only omit if _WIDTH32_ is true
OMIT('***',_WIDTH32_)
  SIGNED   EQUATE(SHORT)
  UNSIGNED EQUATE(USHORT)
***

! Terminator in comment
OMIT('EndOfFile')
  Demo EQUATE(0)
  !EndOfFile

! Multiple terminators
OMIT('**END1**')
  code1
  OMIT('**END2**')
    code2
  **END2**
**END1**
```

---

### COMPILE Directive

**Syntax:** `COMPILE(terminator [,expression])`

The COMPILE directive specifies a block of source code lines to be included in the compilation. It works exactly like OMIT but with opposite logic.

**Key Rules:**
- Same terminator rules as OMIT (case-sensitive, can be anywhere on line)
- The code between COMPILE and terminator is compiled only if the expression is true
- If expression is false or missing, code is included unconditionally
- Although not required, COMPILE without an expression is typically unnecessary since all code is compiled by default unless explicitly omitted

**Examples:**
```clarion
! Conditional COMPILE - only compile if _WIDTH32_ is true
COMPILE('***',_WIDTH32_)
  SIGNED   EQUATE(LONG)
  UNSIGNED EQUATE(ULONG)
***

! Nested OMIT/COMPILE
COMPILE('**32bit**',_width32_)
  COMPILE('*debug*',_debug_)
    DEBUGGER::BUTTONLIST Equate('&Continue|&Halt|&Debug')
  !*debug*
  
  OMIT('*debug*',_debug_)
    DEBUGGER::BUTTONLIST Equate('&Continue|&Halt')
  !*debug*
!**32bit**
```

---

### Diagnostic Rules for OMIT/COMPILE

The language server should flag:

1. **Unterminated OMIT blocks** - OMIT directive without matching terminator
2. **Unterminated COMPILE blocks** - COMPILE directive without matching terminator
3. **Case mismatch** - Terminator string with wrong case (e.g., `OMIT('**END**')` but terminator is `**end**`)

The language server should NOT flag:

1. Terminators in comments (e.g., `!**END**` is a valid terminator)
2. Terminators standalone on their own line (e.g., just `***`)
3. Properly matched OMIT/COMPILE blocks even if deeply nested

---

## Statement Terminators

Clarion statements can be terminated in two ways:

### 1. END Keyword
```clarion
IF condition
  ! statements
END

LOOP
  ! statements
END
```

### 2. Inline Dot Terminator
```clarion
IF condition THEN statement.
LOOP WHILE condition. ! Dot terminates the LOOP
```

**Rules:**
- The dot (`.`) must be the last character on the line (whitespace/comments allowed after)
- Only one statement per line when using dot terminator
- LOOP can also be terminated with WHILE or UNTIL (no dot needed)

---

## Control Structures

### IF Statement
```clarion
IF condition [THEN]
  [statements]
[ELSIF condition [THEN]]
  [statements]
[ELSE]
  [statements]
END

! or inline:
IF condition THEN statement.
```

**Diagnostic Rules:**
- IF must be terminated with END or `.`
- ELSIF and ELSE are optional
- THEN keyword is optional

### LOOP Statement
```clarion
LOOP
  [statements]
END

LOOP
  [statements]
WHILE condition

LOOP
  [statements]
UNTIL condition

! or inline:
LOOP WHILE condition.
LOOP UNTIL condition.
```

**Diagnostic Rules:**
- LOOP must be terminated with END, WHILE, UNTIL, or `.`
- WHILE and UNTIL provide conditional termination

---

## Module Structure

### Program Structure
```clarion
PROGRAM
  ! global declarations
  
  MAP
    MODULE('file')
      PROCEDURE(params)
    END
  END
  
CODE
  ! main program code
```

### Module Termination Rules
**Critical:** A MODULE section inside a MAP does NOT use END to terminate!

```clarion
MAP
  MODULE('file')       ! Start of MODULE
    PROCEDURE(params)  ! MODULE content
  END                  ! Terminates the MAP, not the MODULE!
END
```

The MODULE is implicitly terminated when:
- Another MODULE starts
- The END keyword terminates the containing MAP

**Diagnostic Rules:**
- Do NOT flag "MODULE not terminated" inside MAP structures
- MODULE can only appear inside MAP sections
- END after MODULE actually terminates the MAP, not the MODULE

---

## DATA Scope

1. **Global** - Declared before CODE in PROGRAM
2. **Module** - Declared in MAP...MODULE
3. **Local** - Declared after PROCEDURE, before CODE
4. **Routine Local** - Declared after ROUTINE

---

## Column 0 Rules

Labels must start in column 0:
```clarion
MyLabel  ROUTINE
```

Non-labels must NOT start in column 0 (use indentation).

---

## Character Encoding

Clarion source files use **ANSI/ASCII encoding only**. They do NOT support:
- UTF-8
- Unicode
- Multi-byte character sets

---

