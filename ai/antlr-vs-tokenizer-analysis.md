# ANTLR vs Tokenizer - Gap Analysis

## Performance Comparison (stringtheory.clw - 14,351 lines)

| Metric | Tokenizer | ANTLR | Difference |
|--------|-----------|-------|------------|
| **Time** | 1.5 seconds | 20 seconds | **13x slower** |
| **Folding Ranges** | 2,582 | 3,715 | **+1,133 (43% more)** |
| **Exact Matches** | - | 2,437 | **65.6% agreement** |

---

## Key Findings

### ANTLR Creates 1,278 Extra Folds That Tokenizer Misses

**Most significant:**
1. **CASE OF/OROF clauses** - Individual case branches
2. **CODE sections** - Separate folds for CODE blocks within procedures  
3. **Nested control structures** - More granular folding of nested IF/LOOP

### Tokenizer Creates 145 Extra Folds That ANTLR Doesn't

**Likely:**
- Comment blocks
- Possibly over-aggressive pattern matching
- Some structural inference that ANTLR doesn't recognize

---

## Detailed Pattern Analysis

### 1. ✅ **CASE OF Clauses** (ANTLR advantage)

**Example from stringtheory.clw line 172-173:**
```clarion
case pLen
  of 0 to 50      ← ANTLR creates fold here
    return 50
  of 51 to 255    ← And here
    return 255
  of 256 to 511   ← And here
    return 511
end
```

**Current tokenizer:** Only folds the entire CASE statement  
**ANTLR:** Folds each OF clause individually  
**Should tokenizer add this?** YES - very useful for large CASE statements

---

### 2. ✅ **CODE Sections** (ANTLR advantage)

**ANTLR creates separate folds for:**
- The PROCEDURE declaration (includes DATA + CODE)
- The CODE section itself

**Example:**
```clarion
SomeProc PROCEDURE()    ← Fold #1: entire procedure
x  LONG
  CODE                  ← Fold #2: just the CODE section
  x = 5
  RETURN
```

**Current tokenizer:** Only creates one fold for entire procedure  
**ANTLR:** Creates nested folds (procedure + code section)  
**Should tokenizer add this?** MAYBE - useful for procedures with large DATA sections

---

### 3. ⚠️ **Over-Folding** (Potential ANTLR issue)

With 3,715 folds vs 2,582, ANTLR might be creating too many small folds.

**Questions:**
- Are 2-3 line folds useful?
- Does VSCode's fold UI get cluttered?
- Is there a practical limit?

---

## Recommendations for Tokenizer Improvements

### HIGH PRIORITY: Add OF/OROF Clause Folding
**Impact:** Large CASE statements become much more navigable  
**Complexity:** Medium - need to track OF/OROF within CASE  
**Pattern:**
```
CASE expression
  OF value1    ← Detect this
    ...statements...
  OF value2    ← Detect this
    ...statements...
END
```

### MEDIUM PRIORITY: Add CODE Section Folding
**Impact:** Procedures with large DATA sections benefit  
**Complexity:** Low - already detect CODE keyword  
**Pattern:**
```
ProcName PROCEDURE()
x  LONG
  CODE       ← Create nested fold starting here
  ...
```

### LOW PRIORITY: Review tokenizer's 145 extra folds
**Impact:** Might be false positives  
**Complexity:** High - requires case-by-case analysis  

---

## Implementation Hints from ANTLR Grammar

Looking at the grammar rules that create these folds:

### OF Clause Folding (ClarionParser.g4 lines 374-379):
```antlr
ofClause
    : (QUESTION? OF | QUESTION? OROF) ofExpression statementSuite?
    ;
```

The `statementSuite` is what gets folded.

### CODE Section (lines 195-198):
```clarion
codeSection
    : CODE NEWLINE+ statementList?
    | CODE EOF
    ;
```

---

## Questions for You

1. **Do you want CASE OF clause folding?** (Most impactful improvement)
2. **Do you want nested CODE section folds?** (Less critical)
3. **Should we investigate the 145 "extra" tokenizer folds?** (Might be bugs)
4. **Is 3,715 folds too many for a 14k-line file?** (Average 1 fold per 4 lines)

---

## The ANTLR Value Proposition (Revised)

Given the 13x slowdown, ANTLR's value is:
- ✅ **43% more folding coverage** (especially CASE clauses)
- ✅ **Grammatically correct folds** (no heuristics)
- ✅ **Handles all edge cases** we fixed in grammar
- ❌ **But 13x slower**

**Pragmatic approach:**
1. Keep tokenizer as primary (fast)
2. Add OF clause folding to tokenizer (biggest win)
3. Use ANTLR for optional "strict validation" mode
4. OR: Optimize ANTLR to run in web worker / background thread

