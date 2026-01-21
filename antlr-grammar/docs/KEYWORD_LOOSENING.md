# Keyword Loosening Summary

## Changes Made

Systematically made most keywords **SOFT** (usable as identifiers when not at column 0) to match real Clarion compiler behavior.

### Keywords Made SOFT (Column Predicate Added)

#### OOP & Class Features
- `DISPOSE` - can be field name
- `DERIVED` - can be field name  
- `REPLACE` - can be field name
- `VIRTUAL` - can be field name
- `IMPLEMENTS` - can be field name

#### Access Modifiers  
- `PRIVATE` - can be field name
- `PROTECTED` - can be field name
- `PUBLIC` - can be field name
- `INTERNAL` - can be field name

#### Declaration Modifiers
- `CONST` - can be field name
- `STATIC` - can be field name
- `THREAD` - can be field name
- `AUTO` - can be field name
- `EXTERNAL` - can be field name
- `DLL` - can be field name
- `EQUATE` - can be field name
- `ONCE` - can be field name

#### Structure/Type Keywords
- `KEY` - can be field name
- `STRUCT` - can be field name
- `ENUM` - can be field name
- `UNION` - can be field name
- `LIKE` - can be field name
- `BINDABLE` - can be field name
- `TYPE` - can be field name
- `NAME` - can be field name
- `DRIVER` - can be field name
- `CREATE` - can be field name
- `RECLAIM` - can be field name
- `OWNER` - can be field name

#### Calling Conventions
- `PASCAL` - can be field name
- `RAW` - can be field name
- `PROC` - can be field name

#### Miscellaneous
- `ITEMIZE` - can be field name
- `SECTION` - structural only at column 0
- `ENDSECTION` - structural only at column 0

### Keywords Kept FULLY RESERVED

#### Structural (Must be at column 0 or specific positions)
- `PROGRAM`, `MEMBER`
- `PROCEDURE`, `FUNCTION`, `ROUTINE`
- `DATA`, `CODE`, `MAP`
- `END`

#### Control Flow
- `IF`, `ELSIF`, `ELSE`, `THEN` (with column >0 predicates)
- `CASE`, `OF`, `OROF`
- `LOOP`, `WHILE`, `UNTIL`, `TIMES`, `TO`, `BY`
- `BREAK`, `CYCLE`, `EXIT`, `GOTO`, `RETURN`
- `CHOOSE`, `EXECUTE`, `DO`
- `ACCEPT`, `BEGIN`

#### Operators
- `AND`, `OR`, `NOT`, `XOR`
- `NEW`

#### Preprocessor
- `COMPILE`, `OMIT`, `INCLUDE`, `PRAGMA`
- `ASSERT`

#### Special
- `SELF`, `PARENT` - always refer to object/class context

## Rationale

Clarion's compiler is very permissive about using keywords as identifiers. The main disambiguation mechanism is **column position**:

- **Column 0**: Structural keywords only (PROCEDURE, CLASS, DATA, etc.)
- **Column >0**: Almost anything can be an identifier

This matches real-world Clarion code patterns like:
- `Parameters.Property` (Property as field name)
- `Config.Static` (Static as field name)
- `File.Key` (Key as field name)
- `Options.Create` (Create as field name)

## Testing

Test file at `test-soft-keywords.clw` verifies these keywords work as:
- Field names in GROUPs
- Parameter names
- Variable names
- Method/procedure names

## Expected Impact

- ✅ Fewer parse errors on real-world code
- ✅ Better folding coverage  
- ✅ More accurate symbol recognition
- ✅ Matches actual Clarion compiler behavior
- ⚠️ Might accept some invalid code (acceptable trade-off)
