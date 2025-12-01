# Tokenizer Bug: Array Subscripts Followed by Dot Terminators

## Issue
Dots (`.`) immediately following array subscript closing brackets (`]`) are not being tokenized as separate `EndStatement` tokens. Instead, they are included as part of the subscript token.

## Example Code
```clarion
if newLen then self.flush(newValue[1 : newlen]).
```

## Expected Tokenization
- `newValue` - Variable (Type 5)
- `[` - Delimiter (Type 19)
- `1` - Number (Type 6)
- `:` - Delimiter (Type 19)
- `newlen` - Variable (Type 5)
- `]` - Delimiter (Type 19)
- `.` - EndStatement (Type 26) ← **Should be separate token**

## Actual Tokenization
- `newValue` - Variable (Type 5)
- `[1` - (Type 24 - LineContinuation??)
- `:` - Delimiter (Type 19)
- `newlen` - Variable (Type 5)
- `]).` - LineContinuation (Type 24) ← **Dot included in bracket token**

## Impact
- **Diagnostic Provider**: Reports false positive "IF statement is not terminated"
- **Syntax Highlighting**: Dot terminator not highlighted correctly
- **Code Analysis**: Structure matching fails for inline IFs with array subscripts

## Root Cause
The tokenizer has special handling for array subscripts that appears to consume characters beyond the closing bracket. The pattern or logic needs to be fixed to:
1. Stop tokenizing at the closing `]`
2. Allow the dot to be recognized as a separate `EndStatement` token

## Affected Patterns
Need to investigate:
- Array subscript tokenization logic
- LineContinuation pattern: `/&?\s*\|.*/i` (line 841) - why is `]).` matching this?
- Delimiter patterns for `[` and `]`
- EndStatement pattern priority

## Test Case
Real-world example from StringTheory library:
```clarion
if sepLen then self.flush(pSep).                    ! ← Works ✅
if newLen then self.flush(newValue[1 : newlen]).   ! ← Fails ❌ (dot not recognized)
```

## Workaround
Until fixed, users should:
1. Put array subscript IFs on separate lines with END
2. Or use intermediate variables to avoid subscripts in inline IFs

```clarion
! Instead of:
if newLen then self.flush(newValue[1 : newlen]).

! Use:
if newLen
  self.flush(newValue[1 : newlen])
end

! Or:
tempValue = newValue[1 : newlen]
if newLen then self.flush(tempValue).
```

## Priority
**Medium** - Affects real-world code but workarounds exist

## Files Involved
- `server/src/ClarionTokenizer.ts` - Main tokenizer logic
- Array subscript handling (needs investigation)
- Delimiter/EndStatement pattern interactions

---

**Discovered:** 2025-11-30  
**Status:** Open - Requires tokenizer investigation  
**Related:** Diagnostic Provider integration testing
