# Unreachable Code Detection Refactoring - Using Token finishesAt

## Current Problem

The client-side `UnreachableCodeDecorator` manually tracks structure depth by:
- Parsing each line to detect IF, LOOP, CASE, etc.
- Incrementing/decrementing depth counters
- Trying to handle single-line vs multi-line IF statements
- **RESULT**: Complex logic prone to bugs (like the conditional RETURN bug)

## Proposed Solution: Use Server-Side Tokens with finishesAt

The server's `DocumentStructure` already accurately tracks structure boundaries and sets `finishesAt` on:
- Procedures/Methods/Functions
- Routines
- All structures (IF, LOOP, CASE, ACCEPT, etc.)

### Architecture

**Server-Side** (New):
```typescript
// server/src/providers/UnreachableCodeProvider.ts
export class UnreachableCodeProvider {
    provideUnreachableRanges(document: TextDocument): Range[] {
        const tokens = getTokens(document);
        const ranges: Range[] = [];
        
        // Find all procedures/methods/functions
        const procedures = tokens.filter(t => 
            t.type === TokenType.Procedure || 
            t.type === TokenType.Function ||
            t.subType === TokenType.MethodImplementation
        );
        
        for (const proc of procedures) {
            // Find CODE marker
            const codeToken = findExecutionMarker(proc);
            if (!codeToken) continue;
            
            // Scan from CODE to proc.finishesAt
            let terminated = false;
            
            for (let line = codeToken.line + 1; line <= proc.finishesAt; line++) {
                const lineTokens = getTokensOnLine(line);
                
                // Check for ROUTINE (always reachable)
                if (hasRoutine(lineTokens)) {
                    terminated = false;
                    continue;
                }
                
                // Check for top-level terminator
                if (!terminated && isTopLevelTerminator(lineTokens, tokens)) {
                    terminated = true;
                    continue;
                }
                
                // Mark unreachable
                if (terminated) {
                    ranges.push(Range.create(line, 0, line, lineLength));
                }
            }
        }
        
        return ranges;
    }
    
    private isTopLevelTerminator(lineTokens: Token[], allTokens: Token[]): boolean {
        // Find RETURN/EXIT/HALT token on this line
        const terminator = lineTokens.find(t => 
            t.type === TokenType.Keyword && 
            /^(RETURN|EXIT|HALT)$/.test(t.value.toUpperCase())
        );
        
        if (!terminator) return false;
        
        // Check if terminator is inside a structure
        // Find any structure that:
        // 1. Starts before this line
        // 2. Ends after this line (finishesAt > line)
        // 3. Is not a PROCEDURE/ROUTINE
        const containingStructure = allTokens.find(t =>
            t.type === TokenType.Structure &&
            t.line < terminator.line &&
            t.finishesAt !== undefined &&
            t.finishesAt > terminator.line &&
            !/^(PROCEDURE|FUNCTION|ROUTINE)$/i.test(t.value)
        );
        
        // If inside a structure, it's NOT a top-level terminator
        return !containingStructure;
    }
}
```

**Client-Side** (Simplified):
```typescript
// client/src/UnreachableCodeDecorator.ts
export class UnreachableCodeDecorator {
    private async updateDecorations(): Promise<void> {
        // Request unreachable ranges from server
        const ranges = await this.client.sendRequest('clarion/unreachableRanges', {
            textDocument: { uri: document.uri }
        });
        
        // Apply decorations
        this.activeEditor.setDecorations(this.decorationType, ranges);
    }
}
```

### Benefits

1. **Accuracy**: Uses proven `finishesAt` logic from DocumentStructure
2. **Simplicity**: No manual depth tracking, no complex parsing
3. **Maintainability**: One source of truth for structure boundaries
4. **Correctness**: Automatically handles:
   - Single-line vs multi-line IF
   - Nested structures of any depth
   - ROUTINE blocks
   - All structure types (ACCEPT, EXECUTE, BEGIN, etc.)
5. **Performance**: Server already has tokens, just scan once

### Key Logic

**To determine if RETURN is top-level:**
```typescript
// Find any structure token where:
// - Starts before RETURN line
// - finishesAt is AFTER RETURN line  
// - Is not PROCEDURE/ROUTINE

if (containingStructure) {
    // RETURN is inside IF/LOOP/CASE/etc
    // NOT a top-level terminator
} else {
    // RETURN is at top level
    // Mark following code as unreachable
}
```

### Example

```clarion
MyProc PROCEDURE()               ! finishesAt = 15
  CODE                           ! line 2
  IF x = 1 THEN                  ! finishesAt = 5
    RETURN 0                     ! line 4 - inside structure with finishesAt=5
  END                            ! line 5
  
  MESSAGE('Reachable')           ! line 7 - NOT unreachable (IF ended at 5)
  
  RETURN result                  ! line 9 - NO containing structure (proc finishesAt=15 doesn't count)
  
  MESSAGE('Unreachable')         ! line 11 - IS unreachable
```

**Logic for line 4 (RETURN 0):**
- Find containing structure: IF token (line 3, finishesAt=5)
- Line 4 < finishesAt 5? YES
- Therefore: NOT top-level terminator

**Logic for line 9 (RETURN result):**
- Find containing structure: PROCEDURE doesn't count
- No IF/LOOP/CASE containing this line
- Therefore: IS top-level terminator

## Implementation Plan

1. Create `server/src/providers/UnreachableCodeProvider.ts`
2. Register custom LSP request handler in `server.ts`
3. Simplify `client/src/UnreachableCodeDecorator.ts` to call server
4. Remove all manual parsing/depth tracking code
5. Add comprehensive tests

## Testing

The existing test files work perfectly:
- `test-programs/unreachable-code/test-conditional-return.clw`
- `test-programs/unreachable-code/test-all-scenarios.clw`

Just need to verify all patterns work with the new logic.
