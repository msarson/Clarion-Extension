# Fix Go To Definition for Structure Fields with Prefixes

## Problem
When hovering over `MyVar` (without prefix) in code like `MyVar = 'Another Test Value'`, the hover correctly returns NO information (which is correct because `MyVar` is only valid as `LOC:MyVar`).

However, when using **Go To Definition** (F12) on `MyVar`, it incorrectly jumps to the structure field definition at line 8, even though `MyVar` without the prefix should not be recognized.

## Root Cause
The DefinitionProvider is finding `MyVar` as a **label token** (type 25) and returning it, without checking if it's a structure field that requires a prefix.

## Test Case
```clarion
Some Procedure()
foundDKIM             BYTE
foundSPF              BYTE
foundCNAME            BYTE
txtLine               CSTRING(1024)
CNAMELINE             CSTRING(1024)
LOC:SMTPbccAddress   STRING(255)   
MyGroup                GROUP,PRE(LOC)
MyVar STRING(100)
  END

    Code
    CNAMELINE = ''
    LOC:SMTPbccAddress = ''
    LOC:MyVar = 'Test Value'        ! <-- F12 here SHOULD work (correct)
    MyVar = 'Another Test Value'     ! <-- F12 here SHOULD NOT work (currently broken)
```

## Expected Behavior
- **Hover on `MyVar`**: No hover (WORKING ✅)
- **Hover on `LOC:MyVar`**: Shows type info (WORKING ✅)
- **F12 on `MyVar`**: Should NOT find definition (BROKEN ❌)
- **F12 on `LOC:MyVar`**: Should find definition (WORKING ✅)

## Logs Showing the Issue
```
[2025-11-20T22:50:33.946Z] [DefinitionProvider] INFO: Looking for label definition: MyVar
[2025-11-20T22:50:33.946Z] [DefinitionProvider] INFO: Found 1 label tokens for MyVar
[2025-11-20T22:50:33.946Z] [DefinitionProvider] INFO: Found label definition for MyVar in the current document
```

The DefinitionProvider finds the label token at line 8 and returns it, but it should check if this token has `_possibleReferences` metadata and validate that the search term matches one of those references.

## Solution Location
File: `server/src/providers/definitionProvider.ts`

Look for the section that searches for label definitions:
```typescript
// Look for label definition
this.logger.info('Looking for label definition: ' + word);
const labelTokens = this.tokenCache.getTokens(document.uri, TokenType.Label);
const matchingLabels = labelTokens.filter(t => 
    t.value?.toUpperCase() === word.toUpperCase()
);
```

## Required Fix
After finding matching label tokens, check if the token is a structure field with `_possibleReferences`. If so, validate that the search word (with or without prefix) matches one of the possible references.

The logic should be similar to what's already working in the HoverProvider around line 230-250:
```typescript
// Check if this is a structure field with prefix requirements
const possibleRefs = (child as any)._possibleReferences as string[] | undefined;
if ((child as any)._isPartOfStructure && possibleRefs && possibleRefs.length > 0) {
    const searchTextUpper = searchText.toUpperCase();
    const matches = possibleRefs.some(ref => ref === searchTextUpper);
    
    if (!matches) {
        // This is a structure field but the reference doesn't match required formats
        this.logger.info(`❌ PREFIX-SKIP: Skipping structure field - "${searchText}" not in possible references`);
        continue;
    }
    this.logger.info(`✅ PREFIX-MATCH: Matched structure field with qualified reference: "${searchText}"`);
}
```

## Token Metadata Available
The token at line 8 has this metadata (from ClarionDocumentSymbolProvider):
```javascript
{
    "_structurePrefix": "LOC",
    "_isPartOfStructure": true,
    "_possibleReferences": ["LOC:MYVAR", "MYGROUP.MYVAR"]
}
```

This metadata needs to be checked in the DefinitionProvider's label search fallback code.

## Files Involved
1. `server/src/providers/definitionProvider.ts` - needs the fix
2. `server/src/providers/hoverProvider.ts` - has the working reference implementation (lines 230-250)
3. `server/src/providers/clarionDocumentSymbolProvider.ts` - already correctly sets the metadata

## Compilation
After making changes:
```bash
cd F:\github\Clarion-Extension\Clarion-Extension
npm run compile
```
