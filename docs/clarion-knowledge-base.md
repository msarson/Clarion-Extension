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

## File and Queue Operations

### GET Statement
```clarion
! FILE usage - by key
GET(file, key)

! FILE usage - by file pointer
GET(file, filepointer [,length])

! FILE usage - by key pointer
GET(key, keypointer)

! QUEUE usage - by position
GET(queue, pointer)

! QUEUE usage - by key field(s)
GET(queue, [+]key,...,[-]key)

! QUEUE usage - by name string
GET(queue, name)

! QUEUE usage - by function
GET(queue, function)
```

**Purpose:** Retrieves a specific record from a FILE or entry from a QUEUE.

---

### FILE Usage

**GET(file, key)**
- Gets the first record from the file matching the key component field values
- Key must be declared as KEY or INDEX in the file structure
- If no match found, posts "Record Not Found" error (35)

**GET(file, filepointer [,length])**
- Gets a record by relative position within the file
- `filepointer` - Value returned by POINTER(file), file driver dependent
- `length` - Optional bytes to read (1 to RECORD length, defaults to full RECORD)
- If filepointer = 0, clears current record pointer (no record retrieved)
- Out of range filepointer posts "Record Not Found" error (35)

**GET(key, keypointer)**
- Gets a record by relative position within the key
- `keypointer` - Value returned by POINTER(key), file driver dependent
- Out of range keypointer posts "Record Not Found" error (35)

**Important FILE Notes:**
- If GET is unsuccessful, RECORD buffer content is not affected
- Filepointer/keypointer values are file driver dependent (could be record number, byte position, etc.)
- Use `GET(file, 0)` to clear record pointer before using DUPLICATE for ADD

---

### QUEUE Usage

**GET(queue, pointer)**
- Retrieves entry at relative position (1-based)
- Order is as entries were added or last SORTed
- If pointer = 0, POINTER procedure returns 0
- Out of range posts "Entry Not Found" error (30)

**GET(queue, [+]key,...,[-]key)**
- Searches for first QUEUE entry matching key field value(s)
- Multiple key parameters allowed (up to 16), comma-separated
- `+` prefix = ascending sort, `-` prefix = descending sort
- If QUEUE not SORTed on these fields, creates "alternate sort order" cache
- Posts "Entry Not Found" error (30) if no match

**GET(queue, name)**
- Searches by NAME attributes of fields
- `name` - String containing NAME attributes, comma-separated
- Optional `+` or `-` prefix for each field name
- Case sensitive
- Creates alternate sort order cache if not already sorted
- Posts "Entry Not Found" error (30) if no match

**GET(queue, function)**
- Reads from positional value returned by function
- Function must have two parameters (*GROUP or named GROUP passed by address)
- Both parameters same type, cannot be omitted
- Function returns SIGNED value
- RAW, C, PASCAL attributes not permitted in prototype

---

**Common Error Codes:**
| Code | Error |
|------|-------|
| 08 | Insufficient Memory |
| 30 | Entry Not Found (QUEUE) |
| 35 | Record Not Found (FILE) |
| 36 | File Not Open |
| 43 | Record Is Already Held |
| 75 | Invalid Field Type Descriptor |

**Examples:**
```clarion
! FILE - Get by key match
CUS:Name = 'Smith'
GET(Customer, CUS:NameKey)
IF ERROR() THEN Message('Customer not found') .

! FILE - Get by position
FilePos# = POINTER(Customer)
! ... later ...
GET(Customer, FilePos#)

! FILE - Clear record pointer
GET(Customer, 0)  ! Clears pointer for DUPLICATE

! QUEUE - Get by position
GET(MyQueue, 5)  ! Get 5th entry

! QUEUE - Get by field value
QUE:Status = 'Active'
GET(MyQueue, QUE:Status)

! QUEUE - Get by multiple keys (sorted)
QUE:LastName = 'Smith'
QUE:FirstName = 'John'
GET(MyQueue, +QUE:LastName, +QUE:FirstName)

! QUEUE - Get by name string
GET(MyQueue, '+LastName,+FirstName')
```

### SET Statement
```clarion
! FILE usage - physical order
SET(file)
SET(file, key)
SET(file, filepointer)

! KEY usage - keyed sequence
SET(key)
SET(key, key)
SET(key, keypointer)
SET(key, key, filepointer)

! VIEW usage
SET(view)
SET(view, number)
```

**Purpose:** Initializes sequential processing of a FILE or VIEW for NEXT/PREVIOUS operations.

**Important:** SET does not retrieve a record - it only sets up processing order and starting point.

---

### FILE Usage

**SET(file)**
- Physical record order processing
- Positions to beginning (for NEXT) or end (for PREVIOUS)
- No starting point specified

**SET(file, key)**
- Physical record order processing
- Positions to first record matching key component field values
- **RARELY USED** - only useful if file physically sorted in key order
- **Common mistake:** Using this instead of `SET(key, key)`

**SET(file, filepointer)**
- Physical record order processing
- Positions to record at filepointer position
- filepointer from POINTER(file) - driver dependent value

---

### KEY Usage

**SET(key)**
- Keyed sequence processing in key sort order
- Positions to beginning (for NEXT) or end (for PREVIOUS)
- No starting point specified

**SET(key, key)**
- Keyed sequence processing in key sort order
- Positions to first/last record matching key component field values
- **Both key parameters must be the same**
- If exact match: NEXT reads first match, PREVIOUS reads last match
- If no exact match: NEXT reads next greater, PREVIOUS reads next lesser

**SET(key, keypointer)**
- Keyed sequence processing in key sort order
- Positions to record at keypointer position within key
- keypointer from POINTER(key) - driver dependent value

**SET(key, key, filepointer)**
- Keyed sequence processing in key sort order
- Positions to record matching key values at exact record number (filepointer)
- **Both key parameters must be the same**
- Combines key matching with specific record position

---

### VIEW Usage

**SET(view)**
- Sequential processing for VIEW
- Positions to beginning or end of filtered record set
- Records sorted by ORDER attribute
- VIEW must be OPEN before SET

**SET(view, number)**
- Sequential processing for VIEW with partial ORDER
- `number` - Limits to first N expressions in ORDER attribute
- Assumes values in first N ORDER expressions are fixed
- VIEW must be OPEN before SET

---

**Important Notes:**
- SET combined with NEXT processes forward through file/key
- SET combined with PREVIOUS processes backward through file/key
- filepointer/keypointer values are file driver dependent
- Attempting to SET past end of file sets EOF() to true
- Attempting to SET before beginning of file sets BOF() to true

**Examples:**
```clarion
! FILE - Sequential processing from start
SET(Customer)
LOOP
  NEXT(Customer)
  IF ERROR() THEN BREAK .
  ! Process record
END

! KEY - Process in key order
SET(CUS:NameKey)
LOOP
  NEXT(Customer)
  IF ERROR() THEN BREAK .
  ! Process in name order
END

! KEY - Start at specific value
CUS:LastName = 'Smith'
SET(CUS:NameKey, CUS:NameKey)
LOOP
  NEXT(Customer)
  IF ERROR() THEN BREAK .
  IF CUS:LastName <> 'Smith' THEN BREAK .  ! Stop when past 'Smith'
  ! Process all Smith records
END

! FILE - Resume from saved position
SavePos# = POINTER(Customer)
! ... later ...
SET(Customer, SavePos#)
NEXT(Customer)

! KEY - Resume from saved key position
SavePos# = POINTER(CUS:NameKey)
! ... later ...
SET(CUS:NameKey, SavePos#)
NEXT(Customer)

! VIEW - Sequential processing
OPEN(CustomerView)
SET(CustomerView)
LOOP
  NEXT(CustomerView)
  IF ERROR() THEN BREAK .
  ! Process filtered records
END

! VIEW - Partial ORDER
SET(CustomerView, 2)  ! First 2 ORDER expressions fixed
LOOP
  NEXT(CustomerView)
  IF ERROR() THEN BREAK .
  ! Process subset
END
```

**Common Patterns:**
```clarion
! Forward scan
SET(key)
LOOP
  NEXT(file)
  IF ERROR() THEN BREAK .
END

! Backward scan
SET(key)
LOOP
  PREVIOUS(file)
  IF ERROR() THEN BREAK .
END

! Range scan
key:field = StartValue
SET(key, key)
LOOP
  NEXT(file)
  IF ERROR() OR key:field > EndValue THEN BREAK .
END
```

---

## File Declarations

### FILE Structure
```clarion
label FILE,DRIVER('driver')
       [,CREATE] [,RECLAIM] [,OWNER('password')] [,ENCRYPT]
       [,NAME('filename')] [,PRE(prefix)]
       [,BINDABLE] [,TYPE] [,THREAD] [,EXTERNAL] [,DLL] [,OEM]
  label KEY(components) [,attributes]
  label INDEX(components) [,attributes]
  label MEMO(size) [,attributes]
  label BLOB [,attributes]
  [label] RECORD
    fields
  END
END
```

**Purpose:** Declares a data file structure describing a disk file.

**Required Attributes:**
- **DRIVER('driver')** - Specifies file type (PROP:DRIVER) - **REQUIRED**
- **RECORD** - Declares record structure for fields - **REQUIRED**

---

### FILE Attributes

**CREATE**
- Allows file creation with CREATE statement during execution
- Property: PROP:CREATE

**RECLAIM**
- Specifies reuse of deleted record space
- Property: PROP:RECLAIM

**OWNER('password')**
- Specifies password for data encryption
- Property: PROP:OWNER

**ENCRYPT**
- Encrypts the data file
- Property: PROP:ENCRYPT

**NAME('filename')**
- Sets the filename
- Property: PROP:NAME
- Can be STRING,STATIC with THREAD attribute for per-thread filenames

**PRE(prefix)**
- Declares label prefix for the structure
- All field labels automatically prefixed

**BINDABLE**
- All RECORD variables available for dynamic expressions
- Enables BIND(file) for all fields
- Uses NAME attribute (or label with prefix) as logical name
- Creates larger .EXE - use only when many fields used dynamically

**TYPE**
- FILE is type definition for parameters
- **Only available for Clarion#**

**THREAD**
- Separate record buffer allocated per execution thread
- Buffer allocated only when thread OPENs file
- Use with NAME('STRING,STATIC') for per-thread filenames
- Property: PROP:THREAD
- **Note:** Local FILEs (in PROCEDURE/ROUTINE) are automatically threaded

**EXTERNAL**
- FILE defined in external library
- Memory allocated by external library
- Allows access to public FILEs from external libraries

**DLL**
- FILE defined in .DLL
- Required in addition to EXTERNAL attribute

**OEM**
- String data converted OEM ↔ ANSI on disk I/O
- OEM ASCII to ANSI when reading
- ANSI to OEM ASCII when writing
- Property: PROP:OEM

---

### KEY and INDEX

**KEY(components)**
- Dynamically updated file access index
- Components: field1[,field2,...]
- Automatically maintained by file driver

**INDEX(components)**
- Static file access index
- Must be built at run time
- Not automatically maintained

**Common KEY/INDEX Attributes:**
- DUP - Allow duplicate key values
- NOCASE - Case-insensitive comparison
- OPT - Optional (null) key values
- PRIMARY - Primary key

---

### MEMO and BLOB

**MEMO(size)**
- Variable length text field
- Maximum 64K length
- Memory allocated when FILE opened
- De-allocated when FILE closed

**BLOB**
- Variable length memo field
- May exceed 64K length
- Memory allocated as needed when FILE open

---

### Important Notes

**Memory Allocation:**
- RECORD buffer allocated as static memory on heap
- Remains static even if FILE declared in local data section
- MEMO memory allocated at OPEN, de-allocated at CLOSE
- BLOB memory allocated as needed after OPEN

**Thread Safety:**
- Local FILEs (in PROCEDURE/ROUTINE) automatically threaded
- Global FILEs need explicit THREAD attribute for per-thread buffers
- Thread buffer allocated only if thread OPENs the file

**Driver Dependency:**
- All attributes and data types depend on file driver support
- Unsupported features cause error when FILE opened
- Check driver documentation for restrictions

**Termination:**
- FILE structure must end with END or `.`

---

**Examples:**
```clarion
! Simple file declaration
Customer FILE,DRIVER('TOPSPEED'),PRE(CUS),CREATE,RECLAIM
  KEY(CUS:ID),PRIMARY
  INDEX(CUS:LastName),DUP,NOCASE
  RECORD
CUS:ID        LONG
CUS:LastName  STRING(30)
CUS:FirstName STRING(30)
CUS:Address   STRING(50)
CUS:Notes     MEMO(1000)
  END
END

! File with BINDABLE for dynamic expressions
Report FILE,DRIVER('TOPSPEED'),BINDABLE,NAME('REPORT.TPS')
  RECORD
ReportDate    DATE,NAME('Date')
ReportAmount  DECIMAL(12,2),NAME('Amount')
ReportStatus  STRING(20),NAME('Status')
  END
END
! Now can use: BIND(Report) and evaluate 'Amount * 1.1'

! Threaded file for multi-threading
LogFile FILE,DRIVER('ASCII'),THREAD,NAME('LOG.TXT')
  RECORD
LogEntry STRING(200)
  END
END

! Encrypted file with owner password
Secure FILE,DRIVER('TOPSPEED'),ENCRYPT,OWNER('MyPassword'),CREATE
  KEY(SEC:ID),PRIMARY
  RECORD
SEC:ID        LONG
SEC:Data      STRING(100)
  END
END

! External file from library
External FILE,DRIVER('TOPSPEED'),EXTERNAL,PRE(EXT)
  RECORD
EXT:Field1 STRING(20)
EXT:Field2 LONG
  END
END

! File with BLOB for large data
Document FILE,DRIVER('TOPSPEED'),CREATE
  KEY(DOC:ID),PRIMARY
  RECORD
DOC:ID       LONG
DOC:Title    STRING(100)
DOC:Content  BLOB  ! Can exceed 64K
  END
END
```

---

## Data Structures

### QUEUE Structure
```clarion
label QUEUE([group])
       [,PRE(prefix)] [,STATIC] [,THREAD] [,TYPE] [,BINDABLE]
       [,EXTERNAL] [,DLL]
  fieldlabel variable [,NAME('name')]
  ...
END
```

**Purpose:** Declares a memory QUEUE structure (dynamic array with run-length compression).

---

### QUEUE Attributes

**group (optional)**
- Label of previously declared GROUP, QUEUE, or RECORD
- QUEUE inherits fields from the named group
- Can add additional fields after inherited ones
- If no additional fields needed, can use group label as data type directly

**PRE(prefix)**
- Declares fieldlabel prefix for the structure
- All field labels automatically prefixed

**STATIC**
- Declares procedure-local QUEUE with static memory allocation
- Buffer remains persistent between procedure calls
- Otherwise, procedure-local QUEUEs allocated on stack

**THREAD**
- Memory allocated once per execution thread
- Implies STATIC attribute for procedure-local data
- Separate QUEUE instance per thread

**TYPE**
- QUEUE is just a type definition (no memory allocated)
- Used for QUEUEs passed as PROCEDURE parameters
- Allows receiving procedure to directly address component fields
- Parameter declaration instantiates local prefix (e.g., `PROCEDURE(LOC:PassedQueue)`)

**BINDABLE**
- All variables available for dynamic expressions
- Enables `BIND(queue)` for all fields
- Uses NAME attribute (or label with prefix) as logical name
- Creates larger .EXE - use only when many fields used dynamically

**EXTERNAL**
- QUEUE defined in external library
- Memory allocated by external library
- Allows access to public QUEUEs from external libraries

**DLL**
- QUEUE defined in .DLL
- Required in addition to EXTERNAL attribute

---

### Memory Management

**Compression:**
- Each entry run-length compressed during ADD or PUT
- De-compressed during GET
- Minimizes memory usage automatically

**Overhead:**
- 8 bytes per entry (uncompressed records)
- 12 bytes per entry (compressed records)

**Memory Allocation:**
- **Procedure-local (no STATIC):**
  - Buffer allocated on stack (if not too large)
  - Entry memory freed when QUEUE FREEd or PROCEDURE RETURNs
  - QUEUE automatically FREEd on RETURN
  
- **Global/Module/Local with STATIC:**
  - Buffer allocated in static memory
  - Data persistent between procedure calls
  - Entry memory freed only when QUEUE explicitly FREEd

**Entry Limits:**
- Theoretical maximum: 2^26 (67,108,864) entries
- Actual limit: Dependent on available virtual memory
- Maximum size per entry: 4MB (sum of all variables)

**Initialization:**
- Variables in buffer NOT automatically initialized
- Must explicitly assign values
- Do NOT assume blanks or zeros

---

### Usage Notes

**When Used in Expressions:**
- QUEUE treated like GROUP data type
- Can be used in assignments, expressions, parameter lists

**Field Access:**
- Use WHAT() and WHERE() procedures for positional field access
- Direct field access using fieldlabel (with prefix if defined)

**Dynamic Addition/Deletion:**
- Memory dynamically allocated when entries added (ADD)
- Memory freed when entries deleted (DELETE)
- Entries compressed to minimize memory

---

**Examples:**
```clarion
! Simple QUEUE
MyQueue QUEUE
Name    STRING(30)
Age     LONG
Status  STRING(20)
        END

! QUEUE with prefix
CustomerQueue QUEUE,PRE(CQ)
CQ:ID         LONG
CQ:Name       STRING(50)
CQ:Balance    DECIMAL(12,2)
              END

! QUEUE inheriting from GROUP
PersonGroup GROUP
Name          STRING(30)
Age           LONG
            END

PersonQueue QUEUE(PersonGroup)  ! Inherits Name and Age
Address       STRING(50)        ! Additional field
            END

! QUEUE with BINDABLE for dynamic expressions
ReportQueue QUEUE,BINDABLE
Amount        DECIMAL(12,2),NAME('Amount')
Quantity      LONG,NAME('Qty')
Total         DECIMAL(12,2),NAME('Total')
            END
! Now can use: BIND(ReportQueue) and evaluate 'Amount * Qty'

! STATIC QUEUE for persistent data
MyProc PROCEDURE
LocalQueue QUEUE,STATIC  ! Persists between calls
Value        LONG
           END
CODE
  ! Queue data persists across procedure calls

! TYPE QUEUE for parameter passing
EmployeeType QUEUE,TYPE
EmpID          LONG
EmpName        STRING(50)
EmpSalary      DECIMAL(10,2)
             END

ProcessEmployee PROCEDURE(EmployeeType EMP)  ! EMP: prefix
CODE
  ! Access fields as EMP:EmpID, EMP:EmpName, etc.

! Threaded QUEUE for multi-threading
ThreadQueue QUEUE,THREAD
ThreadData    STRING(100)
ThreadCount   LONG
            END

! Simple usage
MyQueue QUEUE
Item      STRING(20)
        END
CODE
  CLEAR(MyQueue)
  MyQueue.Item = 'First'
  ADD(MyQueue)
  
  MyQueue.Item = 'Second'
  ADD(MyQueue)
  
  LOOP X# = 1 TO RECORDS(MyQueue)
    GET(MyQueue, X#)
    MESSAGE(MyQueue.Item)
  END
  
  FREE(MyQueue)  ! Free all entries
```

### GROUP Structure
```clarion
label GROUP([group])
       [,PRE(prefix)] [,DIM(dimensions)] [,OVER(variable)] [,NAME('name')]
       [,EXTERNAL] [,DLL] [,STATIC] [,THREAD] [,BINDABLE] [,TYPE]
       [,PRIVATE] [,PROTECTED]
  declarations
END
```

**Purpose:** Declares a compound data structure for organizing related variables.

---

### GROUP Attributes

**group (optional)**
- Label of previously declared GROUP or QUEUE
- GROUP inherits fields from the named group
- Can add additional fields after inherited ones
- If inheriting from QUEUE/RECORD, only fields inherited (not functionality)

**PRE(prefix)**
- Declares label prefix for variables within the structure
- NOT valid on GROUP within FILE structure

**DIM(dimensions)**
- Dimensions variables into an array
- Creates structured array
- Access using Field Qualification syntax with subscripts

**OVER(variable)**
- Shares memory location with another variable or structure
- Variables occupy same memory space

**NAME('name')**
- Specifies alternate "external" name for the field

**EXTERNAL**
- Variable defined in external library
- Memory allocated by external library
- NOT valid within FILE, QUEUE, or GROUP declarations

**DLL**
- Variable defined in .DLL
- Required in addition to EXTERNAL attribute

**STATIC**
- Variable's memory permanently allocated
- For procedure-local GROUPs, makes data persistent

**THREAD**
- Memory allocated once per execution thread
- Implicitly adds STATIC attribute on procedure-local data

**BINDABLE**
- All variables available for dynamic expressions
- Enables `BIND(group)` for all fields
- Uses NAME attribute (or label with prefix) as logical name
- Creates larger .EXE - use only when many fields used dynamically

**TYPE**
- GROUP is type definition (no memory allocated)
- Used for GROUPs passed as PROCEDURE parameters
- Allows receiving procedure to directly address component fields
- Parameter declaration instantiates local prefix

**PRIVATE**
- GROUP and all component fields not visible outside module containing CLASS methods
- Valid only in CLASS

**PROTECTED**
- Variable not visible outside base CLASS and derived CLASS methods
- Valid only in CLASS

---

### Important Characteristics

**String Treatment:**
- When referenced in statement/expression, GROUP treated as STRING
- Composed of all variables within structure

**Numeric Storage Warning:**
- Numeric variables (except DECIMAL) don't collate properly when treated as strings
- Building KEY on GROUP with numeric variables may produce unexpected collating sequence

**Nesting:**
- GROUP may be nested within RECORD or another GROUP
- Supports hierarchical data organization

**Field Access:**
- Use Field Qualification syntax (e.g., `GroupName.FieldName`)
- WHAT() and WHERE() procedures allow positional field access

---

**Examples:**
```clarion
! Simple GROUP
NameGroup GROUP
FirstName   STRING(20)
MiddleInit  STRING(1)
LastName    STRING(20)
          END

! GROUP with prefix
AddressGrp GROUP,PRE(ADR)
ADR:Street   STRING(50)
ADR:City     STRING(30)
ADR:State    STRING(2)
ADR:Zip      STRING(10)
           END

! GROUP inheriting from another GROUP
PersonType GROUP,TYPE
Name         STRING(30)
Age          LONG
           END

Employee GROUP(PersonType)  ! Inherits Name and Age
EmployeeID   LONG           ! Additional field
Department   STRING(20)
         END

! Dimensioned GROUP (structured array)
DateTimeGrp GROUP,DIM(10)
Date          LONG                    ! Referenced as DateTimeGrp[1].Date
StartStopTime LONG,DIM(2)             ! Referenced as DateTimeGrp[1].StartStopTime[1]
            END

! BINDABLE GROUP for dynamic expressions
FileNames GROUP,BINDABLE
FileName    STRING(8),NAME('FILE')
Dot         STRING('.'),NAME('Dot')
Extension   STRING(3),NAME('EXT')
          END
! Now can use: BIND(FileNames) and evaluate dynamic expressions

! TYPE GROUP for parameter passing
PassGroup GROUP,TYPE
F1          STRING(20)
F2          STRING(1)
F3          STRING(20)
          END

ProcessData PROCEDURE(PassGroup PG)  ! PG: prefix
CODE
  Message(PG.F1)  ! Access using field qualification

! OVER attribute - shared memory
TotalAmount DECIMAL(12,2)
AmountParts GROUP,OVER(TotalAmount)
Dollars       LONG
Cents         SHORT
            END
! TotalAmount and AmountParts occupy same memory

! Nested GROUP
CustomerRec GROUP
Name          STRING(50)
Address       GROUP
  Street        STRING(50)
  City          STRING(30)
  State         STRING(2)
  Zip           STRING(10)
              END
Phone         STRING(20)
            END
! Access as CustomerRec.Address.City
```

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

