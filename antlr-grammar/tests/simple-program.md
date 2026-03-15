# Example Test File 1 - Simple Program

A basic Clarion Win32 program structure to test the grammar.

## Source Code

```clarion
PROGRAM

MAP
  MyProc PROCEDURE(LONG pValue)
END

MyVar  LONG
Result STRING(100)

  CODE
  MyVar = 123
  Result = 'Hello World'
  MyProc(MyVar)
  
MyProc PROCEDURE(LONG pValue)
LocalVar LONG
  CODE
  LocalVar = pValue * 2
  RETURN
```

## Expected Parse Tree Structure

- compilationUnit
  - programDeclaration
    - MAP section
      - procedurePrototype: MyProc
    - globalDataSection
      - variableDeclaration: MyVar (LONG)
      - variableDeclaration: Result (STRING(100))
    - codeSection
      - assignmentStatement: MyVar = 123
      - assignmentStatement: Result = 'Hello World'
      - procedureCall: MyProc(MyVar)
    - procedureDeclaration: MyProc
      - parameterList: pValue (LONG)
      - localDataSection
        - variableDeclaration: LocalVar (LONG)
      - codeSection
        - assignmentStatement: LocalVar = pValue * 2
        - returnStatement
