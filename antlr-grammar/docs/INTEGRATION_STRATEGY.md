# ANTLR Lexer Integration Strategy

## Current State

**Existing Tokenizer**: `server/src/ClarionTokenizer.ts`
- Custom regex-based tokenization
- Used by ~150 test files
- Powers all language features: folding, symbols, diagnostics, etc.

**ANTLR Lexer**: `antlr-grammar/lexer/`
- Complete, production-ready lexer
- 100% tested on real-world code
- Superior token recognition (PICTURE, field equates, etc.)

## Migration Philosophy: **Gradual Replacement**

Don't do a big-bang rewrite. Instead:
1. Run ANTLR lexer in **parallel** initially (validate output)
2. Replace **specific features** one at a time
3. Keep both tokenizers until ANTLR is proven
4. Extensive testing at each step

## Recommended Integration Path

### Phase 1: Infrastructure (Week 1)

**Goal**: Get ANTLR lexer working alongside existing tokenizer

1. **Create Adapter Layer**
   ```typescript
   // server/src/tokenizer/AntlrTokenAdapter.ts
   export class AntlrTokenAdapter {
       // Convert ANTLR tokens to existing Token format
       static convertTokens(antlrTokens: Token[], text: string): Token[]
   }
   ```

2. **Add Toggle Flag**
   ```typescript
   // server/src/serverSettings.ts
   export interface Settings {
       useAntlrLexer?: boolean;  // Feature flag
   }
   ```

3. **Create Comparison Tool**
   ```typescript
   // server/src/test/TokenizerComparison.test.ts
   // Compare ANTLR vs existing tokenizer outputs
   ```

**Deliverable**: ANTLR lexer can be optionally enabled, outputs compatible tokens

---

### Phase 2: Low-Risk Feature (Week 2)

**Goal**: Replace tokenization for ONE specific feature where ANTLR excels

**Best Candidate**: **PICTURE Token Recognition**

**Why PICTURE tokens?**
- ✅ Well-isolated feature
- ✅ ANTLR handles it perfectly (complex regex patterns)
- ✅ Current tokenizer struggles with edge cases
- ✅ Easy to test (syntax highlighting)
- ✅ Low risk - only affects display, not logic

**Implementation**:
```typescript
// In ClarionTokenizer.ts or adapter
if (settings.useAntlrForPictures) {
    // Use ANTLR lexer for PICTURE patterns
    pictureTokens = antlrLexer.getPictureTokens();
} else {
    // Use existing logic
    pictureTokens = this.tokenizePicturePatterns();
}
```

**Testing**:
- Visual inspection of syntax highlighting
- Test files with complex PICTURE patterns
- Regression tests ensure other features work

**Rollback Plan**: Simple - just toggle the flag off

---

### Phase 3: Medium-Risk Feature (Week 3-4)

**Goal**: Replace tokenization for a more critical feature

**Best Candidate**: **Keyword Classification**

**Why keywords?**
- ✅ ANTLR has proper reserved vs soft keyword handling
- ✅ Current tokenizer may miss edge cases (keywords as labels)
- ✅ Column-0 semantic predicates in ANTLR are superior
- ✅ Affects syntax highlighting and symbol detection

**Implementation**:
```typescript
if (settings.useAntlrForKeywords) {
    // Use ANTLR's keyword classification
    // Respects column-0 rules, soft vs fully reserved
    tokens = antlrLexer.tokenizeWithKeywords();
} else {
    // Existing logic
}
```

**Testing**:
- Test keywords at column 0 (should be labels)
- Test keywords indented (should be keywords)
- Test soft keywords as labels
- Run full test suite (150+ tests)

---

### Phase 4: Full Switch (Week 5-6)

**Goal**: Use ANTLR lexer for ALL tokenization

**Prerequisites**:
- ✅ All Phase 2-3 features working
- ✅ No regressions in test suite
- ✅ Performance acceptable (measure!)
- ✅ Token format conversion robust

**Implementation**:
```typescript
export class ClarionTokenizer {
    public tokenize(): Token[] {
        if (this.useAntlr) {
            return AntlrTokenAdapter.tokenize(this.text);
        }
        // Legacy path (keep for fallback)
        return this.legacyTokenize();
    }
}
```

**Testing**:
- Run **entire test suite** (150+ tests)
- Test on **all real-world files** in test-programs/
- Performance benchmarking
- Memory usage monitoring

---

## Detailed Starting Point: PICTURE Tokens

### Why Start Here?

1. **Isolated Impact**: Only affects token types, not structure
2. **Immediate Value**: Better PICTURE recognition improves UX
3. **Easy Testing**: Visual - just look at syntax highlighting
4. **Low Risk**: Doesn't affect language features (folding, symbols, etc.)
5. **ANTLR Excels**: Complex patterns handled elegantly

### Current PICTURE Handling

```typescript
// server/src/tokenizer/TokenPatterns.ts
export const PICTURE_PATTERN = /(@[pPnNdDtTsSN])?..../;
```

Limitations:
- Complex patterns may not match correctly
- Edge cases with nested braces
- Hard to maintain regex

### ANTLR PICTURE Handling

```antlr
// antlr-grammar/lexer/ClarionLiterals.g4
PICTURE_NUMERIC    : '@P' ~['\r\n]*
PICTURE_DATE       : '@D' [0-9]+ ~['\r\n]*
PICTURE_TIME       : '@T' [0-9]+ ~['\r\n]*
// ... comprehensive patterns
```

### Implementation Steps

1. **Create adapter for PICTURE tokens**:
   ```typescript
   // server/src/tokenizer/PictureTokenAdapter.ts
   export class PictureTokenAdapter {
       static extractPictureTokens(text: string): Token[] {
           // Use ANTLR lexer for PICTURE patterns only
           const antlrLexer = new ClarionLexer(CharStream.fromString(text));
           const tokens = antlrLexer.getAllTokens();
           
           return tokens
               .filter(t => t.type >= PICTURE_NUMERIC && t.type <= PICTURE_FORMAT)
               .map(t => convertToLegacyToken(t));
       }
   }
   ```

2. **Integrate into existing tokenizer**:
   ```typescript
   // In ClarionTokenizer.ts
   if (serverSettings.useAntlrForPictures) {
       const pictureTokens = PictureTokenAdapter.extractPictureTokens(this.text);
       // Merge with existing tokens
       this.mergePictureTokens(pictureTokens);
   }
   ```

3. **Add setting**:
   ```json
   // package.json
   "configuration": {
       "properties": {
           "clarion.experimental.useAntlrForPictures": {
               "type": "boolean",
               "default": false,
               "description": "Use ANTLR lexer for PICTURE token recognition"
           }
       }
   }
   ```

4. **Test**:
   ```typescript
   // server/src/test/PictureTokenAntlr.test.ts
   describe('ANTLR PICTURE Token Recognition', () => {
       it('should recognize @P numeric pattern', () => {
           const code = "Balance  LONG   @P##########.##B";
           // Compare ANTLR vs current tokenizer
       });
   });
   ```

---

## Alternative Starting Point: Folding Provider

**Why consider folding?**
- ✅ Less critical than tokenization (errors won't break features)
- ✅ ANTLR parser provides perfect folding structure
- ✅ Already working (531 regions identified in test)
- ✅ Can run in parallel with existing folding

**Implementation**:
```typescript
// server/src/providers/AntlrFoldingProvider.ts
export class AntlrFoldingProvider {
    async provideFoldingRanges(document: TextDocument): Promise<FoldingRange[]> {
        // Use ANTLR parser to find folding regions
        const parser = new ClarionParser(/* ... */);
        const tree = parser.compilationUnit();
        // Walk tree and collect ranges
    }
}
```

**Advantage**: Non-destructive - can coexist with current folding

---

## Success Criteria

### Phase 1
- ✅ ANTLR lexer produces compatible Token[] output
- ✅ Feature flag works
- ✅ Comparison tests pass

### Phase 2  
- ✅ PICTURE tokens recognized correctly
- ✅ Syntax highlighting improved
- ✅ No regressions in existing tests
- ✅ Performance acceptable

### Phase 3
- ✅ Keywords classified correctly (column-0, soft vs reserved)
- ✅ All 150+ tests still pass
- ✅ Real-world files tokenize correctly

### Phase 4
- ✅ All tokenization via ANTLR
- ✅ Full test suite passes
- ✅ Performance metrics acceptable
- ✅ Rollback path still available

---

## Risk Mitigation

1. **Feature Flags**: Can disable at any time
2. **Parallel Running**: Compare outputs before switching
3. **Incremental**: One feature at a time
4. **Extensive Testing**: 150+ existing tests must pass
5. **Performance Monitoring**: ANTLR must not slow down editor
6. **Rollback Plan**: Keep legacy code path

---

## Performance Considerations

**ANTLR lexer is**:
- ✅ Compiled to efficient TypeScript
- ✅ Single-pass tokenization
- ⚠️ May be slower than hand-tuned regex (measure!)

**Optimization strategies**:
- Cache tokenization results (already done in TokenCache)
- Incremental tokenization for edits
- Worker threads for large files

---

## Timeline Estimate

| Phase | Duration | Risk | Impact |
|-------|----------|------|--------|
| 1. Infrastructure | 1 week | Low | Foundation |
| 2. PICTURE tokens | 1 week | Low | Better UX |
| 3. Keywords | 2 weeks | Medium | Correctness |
| 4. Full switch | 2 weeks | Medium | Complete |
| **Total** | **6 weeks** | | |

---

## Recommendation: Start with PICTURE Tokens

**Why?**
- Lowest risk
- Immediate value
- Easy to test
- ANTLR clearly superior
- Non-breaking change

**First PR**:
1. Add `AntlrTokenAdapter.ts`
2. Add `PictureTokenAdapter.ts`
3. Add feature flag `useAntlrForPictures`
4. Add comparison tests
5. Document behavior changes

**Success looks like**:
- Users can opt-in to ANTLR PICTURE recognition
- Syntax highlighting improves for complex patterns
- No regressions in any tests
- Performance is acceptable

Then iterate to next feature once proven!
