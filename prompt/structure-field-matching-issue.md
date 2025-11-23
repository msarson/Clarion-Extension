# Structure Field Matching Issue - Fix Required

**Date:** 2025-11-20
**Status:** IN PROGRESS - Needs completion

## Problem Statement

The hover and goto definition providers are incorrectly matching unprefixed variable references to structure fields that require prefix or dot notation.

## Specific Issue

Given this code:
```clarion
MyGroup                GROUP,PRE(LOC)
  MyVar STRING(100)
  END

Code
    LOC:MyVar = 'Test Value'      ! ✅ CORRECT - Uses prefix
    MyVar = 'Another Test Value'  ! ❌ WRONG - Should NOT match to structure field
```

**Current Behavior:** When hovering over `MyVar` on line 16 (without prefix), the system matches it to the structure field `MyGroup.MyVar` which has prefix `LOC`.

**Expected Behavior:** The unprefixed `MyVar` should NOT match because structure fields can ONLY be referenced using:
1. `PREFIX:MyVar` (e.g., `LOC:MyVar`)
2. `STRUCTURENAME.MyVar` (e.g., `MyGroup.MyVar`)

No other access patterns are valid in Clarion.

## Log Evidence

From the logs at line [2025-11-20T23:23:08.335Z]:
```
[HoverProvider] ℹ️ INFO: PREFIX-DEBUG: Searching with searchText="MyVar", originalWord="MyVar", word="MyVar"
[HoverProvider] ℹ️ INFO: ✅ PREFIX-MATCH: Matched structure field "MyVar" (reference=false, unprefixed=true)
[HoverProvider] ℹ️ INFO: Found variable in symbol tree: MyVar STRING(100), detail: in GROUP (MyGroup)
[HoverProvider] ℹ️ INFO: ✅ HOVER-RETURN: Found variable info for MyVar: type=STRING(100), line=8
```

The system is matching `unprefixed=true` when it should reject this.

## Technical Details

### Symbol Tree Structure
The symbol tree correctly identifies structure fields with:
```json
{
  "_clarionVarName": "MyVar",
  "_isPartOfStructure": true,
  "_structurePrefix": "LOC",
  "_structureName": "MyGroup",
  "_possibleReferences": ["LOC:MYVAR", "MYGROUP.MYVAR"]
}
```

### Where the Fix is Needed

The matching logic needs to be updated in these files:
1. **server/src/providers/hoverProvider.ts** - The `findFieldInSymbol()` function
2. **server/src/providers/definitionProvider.ts** - The `findStructureFieldDefinition()` function

### Current Matching Logic (INCORRECT)

Around line where it checks:
```typescript
if (child._isPartOfStructure && child._possibleReferences) {
    // Currently matches BOTH:
    // 1. searchText in _possibleReferences (CORRECT)
    // 2. unprefixed field name (INCORRECT)
}
```

### Required Fix

The logic should be:
```typescript
if (child._isPartOfStructure && child._possibleReferences) {
    // ONLY match if searchText is in _possibleReferences
    // DO NOT match unprefixed field names
    const matchesReference = child._possibleReferences.some(ref => 
        ref.toUpperCase() === searchText.toUpperCase()
    );
    
    if (matchesReference) {
        // Match found
    } else {
        // Skip - unprefixed reference to structure field is invalid
    }
}
```

## Test Case

File: `test_structure_prefix.clw` (exists in project)

Test these scenarios:
1. `LOC:MyVar` hover/goto → ✅ Should work
2. `MyGroup.MyVar` hover/goto → ✅ Should work  
3. `MyVar` hover/goto → ❌ Should NOT match the structure field
4. `LOC:MyVar` in assignment → ✅ Should work
5. `MyVar` in assignment → ❌ Should NOT match structure field

## Files to Modify

1. `server/src/providers/hoverProvider.ts`
   - Look for the `findFieldInSymbol()` function
   - Find the section with "PREFIX-MATCH" logging
   - Update the matching logic to reject unprefixed references to structure fields

2. `server/src/providers/definitionProvider.ts`
   - Look for `findStructureFieldDefinition()` 
   - Apply the same fix

## Next Steps

1. Locate the exact matching logic in hoverProvider.ts
2. Update to reject `unprefixed=true` matches for structure fields
3. Apply the same fix to definitionProvider.ts
4. Test with test_structure_prefix.clw
5. Verify logs show rejection of unprefixed matches

## Additional Context

The `_possibleReferences` array contains the ONLY valid ways to reference the field. If the search text doesn't match one of these references (case-insensitive), it should not match.
