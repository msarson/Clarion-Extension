# MAP Procedure Overload Resolution - Session Restart

**Date:** 2025-12-28  
**Status:** In Progress - Not Working Yet

## Problem Statement

MAP procedure overload resolution is not working correctly. Both **Hover** and **Ctrl+F12 (Go to Implementation)** are not detecting overloaded procedures and always default to just one of the overloads.

### Example Issue
```clarion
MAP
  AtSortReport(STRING StartConfigGrp, STRING StartReRunGrp)
  AtSortReport(LONG orderId)
END

AtSortReport PROCEDURE(STRING StartConfigGrp, STRING StartReRunGrp)
  CODE
  RETURN

AtSortReport PROCEDURE(LONG orderId)
  CODE
  RETURN
```

**Current Behavior:**
- F12 or Ctrl+F12 on either MAP declaration always goes to the same implementation
- Hover shows wrong implementation
- Not matching by parameter types, only by name

## What We've Implemented

### 1. Created `ProcedureSignatureUtils` (NEW)
**File:** `server/src/utils/ProcedureSignatureUtils.ts`

Shared utility for parsing and comparing procedure/method signatures:
- `extractParameterTypes(signature)` - Extracts array of parameter types from signature
- `parametersMatch(implParams, declParams)` - Compares two parameter arrays
- `countParameters(signature)` - Counts parameters handling `<>`, defaults, nested parens
- Handles `*STRING`, `&STRING`, `<LONG>`, `LONG=0`, etc.

### 2. Updated `MapProcedureResolver`
**File:** `server/src/utils/MapProcedureResolver.ts`

Added overload resolution to both methods:

#### `findMapDeclaration(procName, tokens, document, implementationSignature?)`
- Collects ALL candidate MAP declarations with matching name
- If multiple found, uses `implementationSignature` for type matching
- Extracts parameter types from both implementation and declarations
- Returns best match or first candidate

#### `findProcedureImplementation(procName, tokens, document, position, declarationSignature?)`
- Collects ALL candidate implementations with matching name
- If multiple found, uses `declarationSignature` for type matching
- Extracts parameter types and compares
- Returns best match or first candidate

### 3. Updated Callers

**DefinitionProvider:**
- Line 152: Pass `line` (implementation signature) to `findMapDeclaration()`
- Line 187: Pass `line` (declaration signature) to `findProcedureImplementation()`

**HoverProvider:**
- Line 85: Pass `line` (implementation signature) to `findMapDeclaration()`

## Special Clarion Rules

### MAP Shorthand Syntax
Procedures in MAP can be declared two ways:

```clarion
MAP
  ! Shorthand - indented, no PROCEDURE keyword
  MyFunc(LONG x), LONG
  
  ! Traditional - column 0, with PROCEDURE keyword  
MyProc PROCEDURE(STRING s), BYTE
END
```

**Critical:** Implementations NEVER have return types in the PROCEDURE line:
```clarion
! MAP declaration includes return type
MAP
  TextLineCount PROCEDURE(LONG TextFEQ),LONG
END

! Implementation OMITS return type
TextLineCount PROCEDURE(LONG TextFEQ)
  CODE
  RETURN LastLineNo
```

### MODULE within MAP
```clarion
MAP
  ! Direct MAP procedures
  SortCaseSensitive(*LinesGroupType p1, *LinesGroupType p2), Long
  
  MODULE('kernel32.dll')
    GetTickCount(), ULONG
  END
END
```

## Why It's Not Working

**DEBUGGING NEEDED:**

1. **Are signatures being extracted correctly?**
   - Check if `ProcedureSignatureUtils.extractParameterTypes()` works with shorthand syntax
   - Does it handle both `MyFunc(LONG x), LONG` and `MyFunc PROCEDURE(LONG x)` formats?

2. **Are signatures being passed to the resolver?**
   - In DefinitionProvider/HoverProvider, is `line` the correct full signature?
   - Does `line` include the full parameter list?

3. **Token matching logic**
   - Are we finding ALL overloaded tokens correctly?
   - Check if `t.label` and `t.value` correctly identify procedure names

4. **Client-side implementation provider**
   - `client/src/providers/implementationProvider.ts` has its own `findMapProcedureImplementation()`
   - Does it need similar overload resolution?
   - Currently uses improved MAP block detection but NO parameter matching

## Test Case Needed

Add to `server/src/test/MapProcedureResolver.test.ts`:

```typescript
test('Should resolve overloaded MAP procedure by parameter types', () => {
    const code = `  MAP
    ProcessOrder(LONG orderId)
    ProcessOrder(STRING orderCode, LONG customerId)
  END

ProcessOrder PROCEDURE(LONG orderId)
  CODE
  RETURN
  END

ProcessOrder PROCEDURE(STRING orderCode, LONG customerId)
  CODE
  RETURN
  END`;
    
    const document = createDocument(code);
    const tokens = tokenizeAndBuildStructure(code);
    const resolver = new MapProcedureResolver();
    
    // From implementation with STRING, LONG
    const implLine = 'ProcessOrder PROCEDURE(STRING orderCode, LONG customerId)';
    const result = resolver.findMapDeclaration('ProcessOrder', tokens, document, implLine);
    
    assert.ok(result, 'Should find declaration');
    assert.strictEqual(result.range.start.line, 2, 'Should match STRING,LONG overload not LONG');
});
```

## Related Files

### Server-side (Language Server)
- `server/src/utils/ProcedureSignatureUtils.ts` - NEW shared utility
- `server/src/utils/MapProcedureResolver.ts` - Updated with overload resolution
- `server/src/utils/MethodOverloadResolver.ts` - Similar logic for class methods (WORKING)
- `server/src/providers/DefinitionProvider.ts` - Calls MapProcedureResolver
- `server/src/providers/HoverProvider.ts` - Calls MapProcedureResolver

### Client-side (VSCode Extension)
- `client/src/providers/implementationProvider.ts` - Ctrl+F12 handler (NEEDS UPDATE?)
- `client/src/documentManager.ts` - Has `findMethodImplementationLine()` with MAP support

## Previous Similar Work

**Method Overload Resolution** (WORKING):
- Commits: 0f701d5, 9f3588b, b5aa024, 15a78bb
- Successfully matches class method overloads by parameter types
- Uses `MethodOverloadResolver.findMethodDeclaration()` with type matching
- Handles `*STRING` vs `STRING` vs `&STRING` correctly

## Next Steps

1. **Add failing test** for MAP procedure overloads
2. **Debug signature extraction** - log what's being extracted
3. **Verify token structure** - ensure multiple overloads are found
4. **Check line content** - is full signature being passed?
5. **Update client-side** if needed for Ctrl+F12
6. **Run test** - make it pass
7. **Manual testing** in real Clarion code

## Commits Related to This Work

- `d22f54b` - Add MAP procedure overload resolution with parameter type matching
- `f06e01c` - Fix client-side Go to Implementation for MAP procedures  
- `f060d1e` - Refactor MapProcedureResolver to use DocumentStructure
- Earlier today: Refactored overload resolver, definition provider, hover provider

## Questions to Answer

1. Why does `MethodOverloadResolver` work but `MapProcedureResolver` doesn't?
2. Is the shorthand MAP syntax being parsed into tokens correctly?
3. Should we extract the signature from tokens or from `document.getText()`?
4. Do we need to handle return types in MAP declarations specially?
5. Is the client-side `implementationProvider` interfering?
