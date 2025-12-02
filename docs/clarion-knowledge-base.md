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

### CASE Statement
```clarion
CASE condition
OF expression [TO expression]
  [statements]
[OROF expression [TO expression]]
  [statements]
[ELSE]
  [statements]
END
```

**Purpose:** Selective execution structure based on condition matching.

**Key Rules:**
- `condition` - A numeric or string variable or expression to evaluate
- `OF expression` - Executes statements when expression equals condition
- `TO` - Allows a range of values (inclusive): `OF 1 TO 10`
- `OROF expression` - Alternative match for the same OF block (control "falls through")
- `ELSE` - Executes when no OF/OROF matches (optional, must be last)
- Must terminate with END or `.`

**Important Notes:**
- Multiple OF options allowed in one CASE
- Multiple OROF options can be associated with one OF
- OROF does not terminate preceding statement groups (fall-through behavior)
- More efficient than complex IF/ELSIF structures for multiple conditions
- Both range expressions (OF-TO, OROF-TO) are evaluated even if condition is less than lower boundary

**Examples:**
```clarion
! Simple CASE
CASE UserChoice
OF 1
  Message('Option One')
OF 2
  Message('Option Two')
ELSE
  Message('Invalid Choice')
END

! CASE with ranges
CASE Score
OF 90 TO 100
  Grade = 'A'
OF 80 TO 89
  Grade = 'B'
OF 70 TO 79
  Grade = 'C'
ELSE
  Grade = 'F'
END

! CASE with OROF (fall-through)
CASE KeyCode
OF MouseLeft
OROF MouseRight
  HandleMouseClick()
OF KeyEnter
OROF KeySpace
  ProcessSelection()
END
```

**Diagnostic Rules:**
- CASE must be terminated with END or `.`
- OF is required (at least one)
- ELSE is optional but must be last if present
- TO requires two expressions (lower and upper bounds)
- OROF must be associated with a preceding OF

### CHOOSE Function
```clarion
! Index-based selection
CHOOSE(expression, value, value [,value...])

! Condition-based selection
CHOOSE(condition [,truevalue, falsevalue])
```

**Purpose:** Returns a chosen value from a list based on an expression or condition.

**Syntax Forms:**

1. **Index-based:** `CHOOSE(expression, value1, value2, value3, ...)`
   - `expression` - Arithmetic expression that resolves to a positive integer
   - Returns the value at position indicated by expression (1-based)
   - If expression is out of range, returns the **last** value parameter

2. **Condition-based:** `CHOOSE(condition [,truevalue, falsevalue])`
   - `condition` - Logical expression
   - Returns `truevalue` if true, `falsevalue` if false
   - If no values provided, returns 1 (true) or 0 (false)

**Return Data Type Rules:**
| All Value Parameters | Return Data Type |
|---------------------|------------------|
| All LONG | LONG |
| DECIMAL or LONG | DECIMAL |
| All STRING | STRING |
| DECIMAL, LONG, or STRING | DECIMAL |
| Anything else | REAL |

**Examples:**
```clarion
! Index-based selection
DayName = CHOOSE(DayOfWeek, 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat')
! If DayOfWeek = 1, returns 'Sun'
! If DayOfWeek = 3, returns 'Tue'
! If DayOfWeek = 99, returns 'Sat' (last value)

! Condition-based (with values)
Status = CHOOSE(Score >= 60, 'Pass', 'Fail')
! Returns 'Pass' if Score >= 60, else 'Fail'

! Condition-based (no values)
Result = CHOOSE(X > Y)
! Returns 1 if X > Y, else 0

! Complex expression
Price = CHOOSE(Quantity, 10.00, 9.50, 9.00, 8.50)
! Quantity=1: $10.00, Quantity=2: $9.50, Quantity=3+: $8.50
```

**Key Notes:**
- CHOOSE is a function, not a structure (no END required)
- Expression/condition is evaluated first
- Out-of-range index returns last value (not first or error)
- Return type determined by value parameter types
- More efficient than IF/ELSIF chains for simple selections

### EXECUTE Structure
```clarion
EXECUTE expression
  statement 1
  statement 2
  [BEGIN
    statements
  END]
  statement n
[ELSE]
  statement
END
```

**Purpose:** Single statement execution structure based on numeric index (1 to n).

**Key Rules:**
- `expression` - Numeric expression or integer variable
- Each statement position corresponds to the expression value (1-based)
- If expression = 1, executes statement 1
- If expression = 2, executes statement 2
- If expression = n, executes statement n
- If expression = 0 or > n, executes ELSE statement (if present)
- Must terminate with END or `.`

**BEGIN Structure:**
- Allows multiple statements to be treated as a single EXECUTE option
- Terminated by END or `.`
- Counts as one statement in the EXECUTE sequence

**Important Notes:**
- Most efficient structure for integer-based branching (1 to n)
- More efficient than CASE or IF/ELSIF for sequential integer values
- ELSE is optional - if omitted and expression is out of range, execution continues after EXECUTE
- Can nest other structures (IF, CASE, LOOP, EXECUTE, BEGIN) within EXECUTE
- EXECUTE can be nested within other structures

**Examples:**
```clarion
! Simple EXECUTE
EXECUTE MenuChoice
  ProcessNew()
  ProcessEdit()
  ProcessDelete()
  ProcessPrint()
ELSE
  Message('Invalid menu choice')
END

! EXECUTE with BEGIN blocks
EXECUTE Action
  InsertRecord()
  BEGIN
    LocateRecord()
    UpdateRecord()
  END
  DeleteRecord()
END

! Nested structures
EXECUTE ReportType
  BEGIN
    IF DetailLevel = 1 THEN
      SummaryReport()
    ELSE
      DetailedReport()
    END
  END
  QuickReport()
  CustomReport()
ELSE
  Message('Unknown report type')
END

! Inline terminator
EXECUTE Choice
  X = 1
  X = 2
  X = 3
.
```

**Diagnostic Rules:**
- EXECUTE must be terminated with END or `.`
- Expression must evaluate to a numeric value
- BEGIN blocks within EXECUTE must be properly terminated
- ELSE is optional but must appear after all statement options if present

**Performance Comparison:**
- **EXECUTE** - Most efficient for sequential integers (1 to n)
- **CASE** - More efficient than IF/ELSIF for multiple discrete values
- **IF/ELSIF** - Least efficient for multiple conditions

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

