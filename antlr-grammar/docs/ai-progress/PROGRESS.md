# ANTLR Grammar Progress Summary

## Completed ✅

### Lexer Grammar (90% complete)

1. **ClarionKeywords.g4** - All Win32 keywords extracted
   - Document level (PROGRAM, MEMBER - **NOTE: MODULE is NOT document-level**)
   - Procedure keywords (PROCEDURE, FUNCTION, ROUTINE)
   - Control flow (IF, LOOP, CASE, etc.)
   - OOP keywords (CLASS, INTERFACE, NEW, etc.)
   - Preprocessor directives (COMPILE, OMIT, INCLUDE)
   - MODULE keyword moved to declaration keywords (used in MAP blocks and CLASS attributes)
   - Excluded Clarion.NET keywords (TRY/CATCH, NAMESPACE, etc.)

2. **ClarionTypes.g4** - Data types and attributes
   - Numeric types (BYTE, SHORT, LONG, REAL, etc.)
   - String types (STRING, CSTRING, PSTRING, etc.)
   - Date/Time types
   - Structure types (FILE, GROUP, QUEUE, etc.)
   - Control types (BUTTON, ENTRY, LIST, etc.)
   - Data attributes (DIM, OVER, PRE, etc.)
   - File attributes (KEY, INDEX, DRIVER, etc.)
   - Control attributes (AT, USE, HIDE, etc.)

3. **ClarionLiterals.g4** - Literal values
   - String literals (single-quoted with '' escaping)
   - Numeric literals (decimal, hex, binary, octal)
   - Picture formats (@N, @D, @T, @P, @K)
   - Boolean constants (TRUE, FALSE, NULL)
   - Equate constants (LEVEL:BENIGN, ICON:Question, etc.)

4. **ClarionOperators.g4** - Operators and delimiters
   - Arithmetic (+, -, *, /, %, **)
   - Comparison (=, <, >, <=, >=, <>)
   - Assignment (:=, :=:)
   - String concatenation (&)
   - Delimiters (parentheses, brackets, comma, colon, etc.)

5. **ClarionLexer.g4** - Main lexer combining all components
   - Comments (! and |)
   - Identifiers (labels, variables, qualified IDs)
   - Implicit type variables ($, #, ")
   - Reference/pointer variables (&var, *var)
   - Line continuation handling
   - Whitespace handling

### Parser Grammar (30% complete)

6. **ClarionParser.g4** - Basic parser structure
   - Top-level: PROGRAM, MEMBER (MODULE removed - it's not document-level)
   - MAP section with prototypes and MODULE references
   - DATA sections (global and local)
   - CODE sections
   - Basic statements (IF, LOOP, CASE, assignment)
   - Structure declarations (FILE, GROUP, QUEUE, CLASS, WINDOW, REPORT)
   - Procedure/routine declarations
   - Basic expressions

### Documentation

7. **README.md** - Project overview and structure
8. **grammar-notes.md** - Design decisions and language characteristics

### Test Files

9. **simple-program.clw** - Basic test case
10. **simple-program.md** - Expected parse tree

## In Progress 🚧

### Parser Rules Need Refinement:
- Expression precedence rules
- Statement termination (dot vs newline)
- Structure nesting rules
- Control flow statement details
- DATA section variable declarations with complex types

## Not Yet Started ❌

### Advanced Parser Rules:
1. **Complex Expressions**
   - Operator precedence
   - Function calls with complex arguments
   - Structure member access
   - Array indexing

2. **Advanced Structures**
   - VIEW (SQL join) declarations
   - Nested structures
   - CLASS methods with implementations
   - WINDOW/REPORT complex layouts

3. **Advanced Statements**
   - ACCEPT loops
   - EXECUTE statements
   - File I/O statements (OPEN, CLOSE, GET, PUT, etc.)
   - Screen I/O (DISPLAY, ACCEPT, etc.)

4. **Attributes**
   - Full attribute parsing with parameters
   - Context-sensitive attribute validation

5. **Labels and Scope**
   - Label scoping rules
   - Routine local variables
   - Procedure local vs global resolution

6. **Compiler Directives**
   - COMPILE/OMIT conditionals
   - SECTION/ENDSECTION
   - PRAGMA directives

## Next Steps 📋

1. **Test Current Grammar**
   - Install ANTLR4
   - Generate lexer/parser
   - Test with simple-program.clw
   - Fix any syntax errors in grammar files

2. **Refine Parser Rules**
   - Add expression precedence
   - Improve statement parsing
   - Handle statement terminators correctly

3. **Add More Test Cases**
   - FILE with RECORD and KEY
   - CLASS with methods
   - WINDOW with controls
   - LOOP variations
   - CASE statement

4. **Extract from Real Code**
   - Use test-programs/ folder
   - Use ExampleCode/ folder
   - Test against actual Clarion projects

5. **Advanced Features**
   - Picture format parsing
   - Complex DATA declarations
   - Nested structures
   - VIEW definitions

## Known Issues / Questions ⚠️

1. **Keyword vs Identifier Ambiguity**
   - FILE, QUEUE, RECORD can be keywords OR identifiers
   - Context-dependent parsing may be needed
   - **MODULE is NOT a document-level keyword** - used in MAP blocks and CLASS attributes only

2. **Statement Termination**
   - Dot (.) as terminator vs member access
   - Newline sensitivity
   - When is dot required vs optional?

3. **Label Rules**
   - Labels at column 0 vs indented code
   - How to handle in ANTLR (which ignores whitespace)?
   - May need lexer modes

4. **Line Continuation**
   - How to handle | across multiple grammar rules
   - May need special processing

5. **Case Insensitivity**
   - Currently using fragment rules (A:[aA], etc.)
   - Consider using ANTLR's case-insensitive options

## File Structure Summary

```
antlr-grammar/
├── lexer/
│   ├── ClarionLexer.g4      ✅ Main lexer (combining all)
│   ├── ClarionKeywords.g4   ✅ All Win32 keywords
│   ├── ClarionTypes.g4      ✅ Data types and attributes  
│   ├── ClarionLiterals.g4   ✅ String/number/picture literals
│   └── ClarionOperators.g4  ✅ Operators and delimiters
├── parser/
│   └── ClarionParser.g4     🚧 Basic parser structure
├── tests/
│   ├── simple-program.clw   ✅ Basic test
│   └── simple-program.md    ✅ Expected results
└── docs/
    └── grammar-notes.md     ✅ Design decisions
```

## Estimated Completion

- **Lexer**: 90% complete
- **Basic Parser**: 30% complete
- **Full Parser**: 10% complete
- **Overall**: 40% complete

## Time Investment

- Lexer: ~2-3 hours ✅
- Basic Parser: ~1 hour ✅
- Remaining Parser: ~4-6 hours
- Testing & Refinement: ~3-5 hours
- **Total Estimated**: ~10-15 hours
