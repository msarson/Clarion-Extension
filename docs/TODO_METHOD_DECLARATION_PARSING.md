# TODO: Fix Method Declaration Parsing in Classes

## Problem
Method definitions inside CLASS structures are being incorrectly parsed as properties/variables instead of methods.

### Example
```clarion
CLASS (StringTheory)
  ! ... other members ...
  Flush  PROCEDURE (StringTheory pStr),long, proc, virtual  ! <-- Incorrectly parsed
```

The Structure View shows: `"StringTheory ),long,proc,virtual"` as a **Property** instead of recognizing `Flush` as a **Method**.

## Root Cause
1. The tokenizer defines `TokenType.MethodDeclaration` (line 44 in ClarionTokenizer.ts) but **never assigns it**
2. PROCEDURE keywords are tokenized as generic `TokenType.Keyword` (line 849)
3. When parsing, `StringTheory` (the parameter type) is recognized as a Type token
4. The `handleVariableToken` method is called, treating it as a variable declaration
5. The check for PROCEDURE on the same line (lines 1454-1475 in ClarionDocumentSymbolProvider.ts) should prevent this, but it's not working correctly

## Solution
The tokenizer needs logic to:
1. Detect when a PROCEDURE keyword appears inside a CLASS/INTERFACE/MAP structure
2. Set the `subType` to `TokenType.MethodDeclaration` for these cases
3. This will cause the symbol provider to correctly handle it as a method (lines 409-415, 1305-1307)

## Files to Modify
- `server/src/ClarionTokenizer.ts` - Add logic to assign MethodDeclaration subType
- Possibly `server/src/providers/ClarionDocumentSymbolProvider.ts` - Verify the PROCEDURE check is working

## Test Case
Line 408 in C:\Clarion\Clarion11.1\accessory\libsrc\win\StringTheory.inc:
```clarion
Flush                 Procedure (StringTheory pStr),long, proc, virtual
```

Should appear in Structure View as:
- **Method**: `Flush (StringTheory pStr)`
- Under: `Class (StringTheory)` → `Properties` → **Methods** (not Properties)

## Related
- Recent tokenizer changes for inline dot (`.`) terminators may have affected this
- Variable tokenization was working before these changes
