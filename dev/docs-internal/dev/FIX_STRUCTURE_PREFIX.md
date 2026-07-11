# Fix for Structure Field Prefix Hover/Goto Definition

## Problem
When hovering or using goto definition on a bare field name (e.g., `MyVar`), the extension incorrectly showed/navigated to structure fields that require a prefix (e.g., `LOC:MyVar` or `MyGroup.MyVar`).

## Solution Status

### ✅ COMPLETED:
1. **HoverProvider** - Symbol-based search now correctly checks `_possibleReferences`
2. **HoverProvider** - Word extraction now includes colons (LOC:MyVar)
3. **HoverProvider** - Legacy token search now checks `isStructureField`
4. **ClarionDocumentSymbolProvider** - Creates `_possibleReferences` array with valid reference forms

### ⚠️ IN PROGRESS:
1. **DefinitionProvider** - Needs same fix for token-based search in `findSymbolDefinition`

## Files Modified

### 1. server/src/ClarionDocumentSymbolProvider.ts (DONE ✅)
- Added `_possibleReferences` array to structure fields
- Includes both `PREFIX:FIELD` and `STRUCTURE.FIELD` patterns

### 2. server/src/providers/HoverProvider.ts (DONE ✅)
- `getWordRangeAtPosition`: Always includes colons
- `findVariableInSymbol`: Checks `_possibleReferences`
- `findLocalVariableInfoLegacy`: Skips structure fields for bare names

### 3. server/src/providers/DefinitionProvider.ts (NEEDS FIX ⚠️)
- Has `prefixPart` check at line 656
- But may need additional checks in other code paths

## Test Results

✅ `LOC:MyVar` hover/goto - WORKS (finds structure field)
❌ `MyVar` hover/goto - STILL BROKEN (shouldn't find structure field)

## Next Steps

Need to check DefinitionProvider for all code paths that might be finding the structure field.
