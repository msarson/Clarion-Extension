# Clarion Language Structure Rules

This document outlines key structural rules of the Clarion language to assist in development and AI-assisted sessions.

## Procedure and Method Structure

### Procedure/Method Implementation

A procedure or method implementation follows this structure:

```clarion
ProcedureName PROCEDURE([parameters])
[DATA]                              ! Optional DATA section
  localVar1    LONG                 ! Local variables (only valid before CODE)
  localVar2    STRING(255)
[CODE]                              ! Execution marker - variables CANNOT appear after this
  ! Executable code here
  ! ...
```

**Key Rules:**
1. **Variable Declarations**: Can only appear between the PROCEDURE line and the CODE statement
2. **CODE Statement**: Marks the beginning of executable code
3. **After CODE**: No variable declarations are allowed after the CODE statement
4. **DATA Section**: Optional - if present, contains local variable declarations

### Method Implementation (Class Methods)

Method implementations use dot notation:

```clarion
ClassName.MethodName PROCEDURE([parameters])
  localVar    LONG                  ! Local variables before CODE
  CODE
  ! Executable code here
```

**Key Rules:**
- Follow the same structure as regular procedures
- Identified by dot notation in the name (e.g., `ThisWindow.Init`)
- Tokenizer sets `subType = TokenType.MethodImplementation`

### Procedure/Method Declaration (in CLASS/MAP/INTERFACE)

Inside a CLASS, MAP, or INTERFACE structure, procedures are **declarations only** (no CODE section):

```clarion
MyClass    CLASS
  Method1    PROCEDURE(LONG param)              ! Declaration only - no CODE
  Method2    PROCEDURE(STRING s), LONG          ! Returns LONG
END
```

**Key Rules:**
- These are method **declarations**, not implementations
- No CODE section
- No local variables
- Tokenizer sets `subType = TokenType.MethodDeclaration`

## Routine Structure

Routines are labeled code blocks within procedures/methods. They have two forms:

### Routine WITHOUT DATA Section

```clarion
MyRoutine  ROUTINE
  ! All lines here are executable code
  ! No variables allowed
  ! Continues until next ROUTINE or end of procedure
```

**Key Rules:**
1. No DATA statement on first non-empty line after ROUTINE
2. Everything after the ROUTINE line is executable code
3. No local variables for this routine
4. Scoped to the containing procedure/method

### Routine WITH DATA Section

```clarion
MyRoutine  ROUTINE
  DATA
    routineVar1  LONG               ! Variables scoped to this routine
    routineVar2  STRING(100)
  CODE                              ! Marks start of executable code
  ! Executable code here
```

**Key Rules:**
1. DATA statement must be on first non-empty line after ROUTINE
2. Variables declared between DATA and CODE are scoped to the routine
3. CODE statement marks the beginning of executable code
4. Variables CANNOT appear after the CODE statement
5. Scoped to the containing procedure/method

### Routine Scope

**Important**: Routines are **children** of the procedure/method they appear in. They are not standalone procedures.

```clarion
MyProcedure PROCEDURE
  localVar  LONG
  CODE
  ! Some code...
  
SubRoutine  ROUTINE              ! This routine is a child of MyProcedure
  DATA
    routineVar  LONG
  CODE
  ! Routine code...
```

## Token Types for Procedures

The tokenizer distinguishes between different procedure types using `subType`:

- `TokenType.GlobalProcedure` - Regular procedure at global level
- `TokenType.MethodImplementation` - Class method implementation (contains dot in name, has CODE)
- `TokenType.MethodDeclaration` - Method declaration inside CLASS/MAP/INTERFACE (no CODE)
- `TokenType.MapProcedure` - Procedure declaration inside MAP structure
- `TokenType.InterfaceMethod` - Method declaration inside INTERFACE structure

## Structure Hierarchy Rules

### Structures with Fields

Structures like GROUP, QUEUE, FILE can have fields as children:

```clarion
CustomerQueue  QUEUE
  CustID         LONG
  CustName       STRING(50)
END
```

### Method Implementations vs Declarations

1. **Method Declaration** (inside CLASS):
   - No CODE section
   - Part of class definition
   - Should be child of "Methods" container in class

2. **Method Implementation** (outside CLASS):
   - Has CODE section
   - Contains actual code
   - Should be child of "Methods" container in class (if class found)

### Global Procedures

Global procedures are **top-level** symbols, not children of other structures:

```clarion
GlobalProc PROCEDURE
  CODE
  ! ...
```

Should appear at root level in the outline, not nested under anything.

## Variable Declaration Rules Summary

| Context | Variables Allowed | Location |
|---------|------------------|----------|
| Procedure/Method | Yes | Between PROCEDURE line and CODE statement |
| Procedure/Method | No | After CODE statement |
| Routine (no DATA) | No | Not allowed |
| Routine (with DATA) | Yes | Between DATA and CODE statements |
| Routine (with DATA) | No | After CODE statement |
| CLASS/MAP/INTERFACE | No | These are declarations only |

## Execution Markers

- `CODE` - Marks the start of executable code
- `DATA` - Marks the start of variable declarations (in routines)

The tokenizer identifies these as `TokenType.ExecutionMarker`.

## Important Notes

1. **Procedures/Methods NEVER have a DATA statement** at the procedure level. Variables are declared directly after the PROCEDURE line.

2. **Only Routines can have DATA statements** to declare routine-local variables.

3. **After CODE, only executable statements** are allowed - no variable declarations.

4. **Routine scope**: Routines are always children of the procedure/method they appear in.

---

**Last Updated**: 2025-01-24
