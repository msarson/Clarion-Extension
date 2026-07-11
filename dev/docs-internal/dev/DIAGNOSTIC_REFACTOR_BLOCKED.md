# Diagnostic Provider Refactor - Analysis

## Goal
Refactor `DiagnosticProvider.validateStructureTerminators()` to use token hierarchy (`parent`, `children`, `finishesAt`) instead of manual stack tracking.

## Current Status: **BLOCKED**

## Problem Discovered
The refactor cannot proceed because **MODULE tokens do not have hierarchy information set**.

### Investigation Results

Testing three MODULE scenarios:

```clarion
1. MODULE inside CLASS body:
   MODULE('KERNEL32')
     GetTickCount PROCEDURE(),ULONG
   END
   
2. MODULE inside MAP body:
   MODULE('KERNEL32')
     GetTickCount PROCEDURE(),ULONG
   END

3. MODULE as CLASS attribute:
   MyClass CLASS,MODULE
```

**Findings:**
- **Scenario 1 & 2**: MODULE is tokenized as `TokenType.Label` (type 25)
  - `finishesAt`: undefined ❌
  - `parent`: undefined ❌
  
- **Scenario 3**: MODULE is tokenized as `TokenType.Structure` (type 16)
  - `finishesAt`: undefined ❌  
  - `parent`: undefined ❌

**None of the MODULE tokens have hierarchy information!**

## Root Cause

`DocumentStructure.ts` processes structures and sets `parent`, `children`, and `finishesAt`, BUT:

1. MODULE tokenized as **Label** is not processed as a structure
2. MODULE tokenized as **Structure** on the CLASS line is explicitly skipped (it's an attribute, not a nested structure)
3. The tokenizer only processes tokens of type `TokenType.Structure` for hierarchy

## What This Means

The current `DiagnosticProvider` MUST use manual stack tracking because:
- Not all structure-like tokens have hierarchy info
- The `finishesAt` property is only set for properly processed structures
- MODULE is a special case that sometimes needs manual validation

## Path Forward

To enable this refactor, we need to:

### Phase 1: Fix Token Hierarchy (PREREQUISITE)
1. Ensure `DocumentStructure` processes MODULE tokens (both Label and Structure types)
2. Set `parent` property for MODULE inside MAP/CLASS
3. Set `finishesAt` property when MODULE has END/dot terminator
4. Add tests to verify MODULE hierarchy is correct

### Phase 2: Refactor DiagnosticProvider (AFTER Phase 1)
1. Simplify `validateStructureTerminators()` to check `token.finishesAt`
2. Remove manual stack tracking
3. Use `token.parent` to determine context
4. Update tests

## Decision

**REVERT this refactor** and create it as a future enhancement after Phase 1 is complete.

The current manual stack-based approach in DiagnosticProvider is necessary because the token hierarchy is incomplete.

## Related Files
- `server/src/providers/DiagnosticProvider.ts` - Current validation logic
- `server/src/DocumentStructure.ts` - Token hierarchy builder  
- `server/src/tokenizer/TokenTypes.ts` - Token interface definition
- `server/src/test/ModuleStructure.test.ts` - MODULE hierarchy tests

## Test Results
- Before refactor: 244 passing, 4 failing
- After refactor attempt: 242 passing, 6 failing
- MODULE-related tests now fail because hierarchy is missing
