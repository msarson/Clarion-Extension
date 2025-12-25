# Definition Resolution Migration Plan

## Executive Summary

Move Clarion definition-resolution logic from the client-side `ClarionDefinitionProvider` into the language server, while preserving 100% existing behaviour through strict TDD practices.

---

## Current State Analysis

### Client-Side Implementation (`client/src/providers/definitionProvider.ts`)

**Currently DISABLED** (commented out in `LanguageFeatureManager.ts` lines 85-102)

The client-side provider handled:
1. **Forward Navigation** (Declaration → Implementation)
   - MAP procedure declarations → PROCEDURE implementations
   - CLASS method declarations → Method implementations
   - Uses `DocumentManager.findLinkAtPosition()` to locate declarations
   - Uses `DocumentManager.resolveMethodImplementation()` to find implementations

2. **Reverse Navigation** (Implementation → Declaration)
   - PROCEDURE implementations → MAP declarations (same file)
   - Class.Method implementations → CLASS method declarations (in INCLUDE files)
   - Regex-based parsing: `/^(\w+)\.(\w+)\s+PROCEDURE/i`

### Server-Side Implementation (`server/src/providers/DefinitionProvider.ts`)

**Currently ACTIVE** - Comprehensive provider handling:
- Label definitions (variables, structures, procedures)
- Structure field definitions (dot notation, prefix notation)
- Class member navigation (self.Method, obj.Method)
- Method implementation ↔ declaration (bidirectional)
- Parameter definitions
- Global definitions (cross-file via SolutionManager)
- File reference navigation (INCLUDE, MODULE, etc.)

**Key infrastructure already available:**
- `TokenCache` - Fast token lookup
- `ClassMemberResolver` - Class member resolution with overload support
- `MethodOverloadResolver` - Parameter counting and matching
- `TokenHelper` - Scope and context utilities
- `ClarionDocumentSymbolProvider` - Structure analysis
- `SolutionManager` - Cross-file resolution

---

## Gap Analysis

### What Client-Side Did That Server May Not

❌ **NO GAPS IDENTIFIED** - Server-side provider already implements:
1. ✅ Method implementation → declaration (lines 93-130)
2. ✅ Class member resolution via `ClassMemberResolver` (lines 79-89)
3. ✅ INCLUDE file searching (lines 1419-1540, 1862-1956)
4. ✅ MAP procedure resolution (though indirectly via global search)

### What Server Does That Client Didn't

✅ **ENHANCED CAPABILITIES:**
1. Structure field prefix validation (`_possibleReferences`)
2. Parameter definition navigation
3. Global cross-file symbol resolution
4. Routine scope handling
5. Complex prefix notation (e.g., `Queue:Browse:1:Field`)

---

## Test Coverage Assessment

### Existing Tests (`server/src/test/DefinitionProvider.test.ts`)

**Current Coverage:**
- ✅ Word extraction (self.Method, LOC:Counter, Structure.Field, DO routine)
- ✅ Symbol detection (variables, procedures, routines, classes, queues)
- ✅ Scope detection (procedure, routine nesting)
- ✅ Method implementation pattern detection
- ✅ Self method call pattern detection

### Critical Missing Test Cases

#### 1. MAP Procedure Resolution
```clarion
MAP
  ProcessOrder(LONG orderId)
END

! ... later ...
ProcessOrder PROCEDURE(LONG orderId)  ! ← F12 should jump to MAP
  CODE
END
```

**Tests Needed:**
- [ ] F12 on MAP declaration → PROCEDURE implementation
- [ ] F12 on PROCEDURE implementation → MAP declaration
- [ ] MAP with PROCEDURE keyword: `ProcessOrder PROCEDURE(LONG id)`
- [ ] MAP without PROCEDURE keyword: `ProcessOrder(LONG id)`
- [ ] MAP with comma syntax: `ProcessOrder,PROCEDURE(LONG id)`
- [ ] Multi-parameter procedures
- [ ] Parameter type matching (not name matching)

#### 2. CLASS Method Resolution (Cross-File)
```clarion
! In window.inc
WindowManager CLASS
  Init PROCEDURE()  ! ← F12 from implementation should jump here
  Kill PROCEDURE()
END

! In window.clw
INCLUDE('window.inc')

WindowManager.Init PROCEDURE()  ! ← F12 should jump to CLASS declaration
  CODE
END
```

**Tests Needed:**
- [ ] F12 on CLASS method declaration → implementation (same file)
- [ ] F12 on CLASS method declaration → implementation (different file)
- [ ] F12 on method implementation → CLASS declaration (in INCLUDE)
- [ ] Method overloads (parameter count matching)
- [ ] Nested INCLUDE resolution
- [ ] CLASS not found handling

#### 3. Method Call Navigation
```clarion
WindowManager.Init PROCEDURE()
  CODE
  self.SaveFile()  ! ← F12 should jump to SaveFile declaration
END
```

**Tests Needed:**
- [ ] F12 on `self.Method()` → method declaration
- [ ] F12 on `object.Method()` → method declaration (typed variable)
- [ ] Parameter count matching for overloads
- [ ] Method not found in class

#### 4. Edge Cases
**Tests Needed:**
- [ ] Cursor on class name in `Class.Method PROCEDURE` → CLASS definition
- [ ] Cursor on method name in `Class.Method PROCEDURE` → CLASS method declaration
- [ ] Multiple MAP blocks in same file
- [ ] Shadowed procedure names (local vs. global)
- [ ] Procedure in routine scope
- [ ] Forward declarations vs. implementations

---

## Test Implementation Strategy

### Phase 1: Lock Down Current Behavior (REQUIRED BEFORE REFACTORING)

Create comprehensive test suite in `server/src/test/DefinitionProvider.test.ts`:

```typescript
suite('MAP Procedure Resolution', () => {
    test('F12 on MAP declaration jumps to implementation', async () => {
        const code = `
MAP
  ProcessOrder(LONG orderId)
END

ProcessOrder PROCEDURE(LONG orderId)
  CODE
  RETURN
END
        `.trim();
        
        const document = createTestDocument(code);
        const position = { line: 2, character: 5 }; // On 'ProcessOrder' in MAP
        
        const result = await definitionProvider.provideDefinition(document, position);
        
        assert.ok(result, 'Should find definition');
        assert.strictEqual(getLocationLine(result), 5, 'Should jump to PROCEDURE line');
    });
    
    test('F12 on PROCEDURE implementation jumps to MAP declaration', async () => {
        const code = `
MAP
  ProcessOrder(LONG orderId)
END

ProcessOrder PROCEDURE(LONG orderId)
  CODE
  RETURN
END
        `.trim();
        
        const document = createTestDocument(code);
        const position = { line: 5, character: 5 }; // On 'ProcessOrder' in PROCEDURE
        
        const result = await definitionProvider.provideDefinition(document, position);
        
        assert.ok(result, 'Should find definition');
        assert.strictEqual(getLocationLine(result), 2, 'Should jump to MAP line');
    });
});

suite('CLASS Method Resolution (Cross-File)', () => {
    test('F12 on method implementation jumps to CLASS declaration in INCLUDE', async () => {
        // Test setup with mock INCLUDE file
        // ...
    });
    
    test('F12 on CLASS method declaration jumps to implementation', async () => {
        // Test setup
        // ...
    });
});

suite('Method Call Navigation', () => {
    test('F12 on self.Method() call jumps to method declaration', async () => {
        // Test setup with CLASS and method call
        // ...
    });
});
```

### Phase 2: Verify Server-Side Capabilities

**Before writing new code:**
1. Run existing tests to establish baseline
2. Add new tests that FAIL (proving behavior doesn't exist yet)
3. Implement minimal server-side logic to make tests pass
4. DO NOT TOUCH CLIENT-SIDE CODE until tests pass

### Phase 3: Client-Side Reduction (ONLY AFTER TESTS PASS)

Once server-side tests prove behavior equivalence:
1. Completely remove `ClarionDefinitionProvider` from client
2. Remove `findMapDeclarationFromImplementation()` logic
3. Remove `findClassMethodDeclaration()` logic
4. Remove `findMethodInClass()` logic
5. Remove `findMapDeclaration()` logic
6. Verify all tests still pass
7. Integration test in VS Code extension

---

## Server-Side Architecture

### Existing Capabilities to Leverage

1. **Token-Based Resolution** (already implemented)
   - No regex parsing needed - tokens have `subType`, `line`, `finishesAt`
   - `TokenHelper.getInnermostScopeAtLine()` for context

2. **Class Member Resolution** (already implemented)
   - `ClassMemberResolver.findClassMemberInfo()` handles INCLUDE searching
   - `MethodOverloadResolver.findMethodDeclaration()` handles parameter matching

3. **Symbol Search** (already implemented)
   - Label index in `DocumentStructure`
   - Global search via `SolutionManager`

### Minimal Additions Needed

#### MAP Procedure Resolution Enhancement

**Current State:** Server searches globally for procedures, may not prioritize MAP declarations

**Required Addition:**
```typescript
// In DefinitionProvider.provideDefinition()
// Already exists at lines 93-130, but verify MAP-specific behavior

// BEFORE structure field checks, add explicit MAP check:
const mapDeclaration = await this.findMapProcedureDeclaration(word, document, position);
if (mapDeclaration) {
    return mapDeclaration;
}
```

**Implementation:**
```typescript
private async findMapProcedureDeclaration(
    procName: string,
    document: TextDocument,
    position: Position
): Promise<Definition | null> {
    const tokens = this.tokenCache.getTokens(document);
    
    // Find MAP structures
    const mapTokens = tokens.filter(t => 
        t.type === TokenType.Structure && 
        t.value.toUpperCase() === 'MAP'
    );
    
    for (const mapToken of mapTokens) {
        // Search within MAP...END for procedure declarations
        const endLine = mapToken.finishesAt || Number.MAX_VALUE;
        
        const procDecl = tokens.find(t =>
            t.line > mapToken.line &&
            t.line < endLine &&
            t.type === TokenType.Label &&
            t.value.toLowerCase() === procName.toLowerCase() &&
            t.start === 0
        );
        
        if (procDecl) {
            return Location.create(document.uri, {
                start: { line: procDecl.line, character: 0 },
                end: { line: procDecl.line, character: procDecl.value.length }
            });
        }
    }
    
    return null;
}
```

**Why This Works:**
- Reuses existing token infrastructure
- No regex parsing needed
- Leverages `finishesAt` for MAP block boundaries
- Natural priority: checked BEFORE global symbol search

#### Reverse MAP Navigation (Implementation → Declaration)

**Current State:** Lines 93-130 handle method implementation → declaration

**Verify Coverage:**
```typescript
// Lines 95-96: Already detects "Class.Method PROCEDURE" pattern
const methodImplMatch = line.match(/^(\w+)\.(\w+)\s+PROCEDURE\s*\((.*?)\)/i);

// For MAP procedures (no dot), add similar check:
const procImplMatch = line.match(/^(\w+)\s+PROCEDURE\s*\((.*?)\)/i);
if (procImplMatch && !methodImplMatch) {
    const procName = procImplMatch[1];
    // Search for MAP declaration
    return this.findMapProcedureDeclaration(procName, document, position);
}
```

---

## Implementation Checklist

### ✅ Pre-Implementation (DO FIRST)
- [ ] Create feature branch: `git checkout -b feature/server-side-definition-resolution`
- [ ] Document current test results: `npm test > baseline-tests.log`
- [ ] Verify server-side provider is active (already confirmed: LanguageFeatureManager.ts line 88)
- [ ] Verify client-side provider is disabled (already confirmed: lines 85-102)

### ✅ Test Writing (BEFORE CODE CHANGES)
- [ ] Write MAP procedure forward navigation tests (5+ tests)
- [ ] Write MAP procedure reverse navigation tests (5+ tests)
- [ ] Write CLASS method cross-file tests (8+ tests)
- [ ] Write method call navigation tests (4+ tests)
- [ ] Write edge case tests (6+ tests)
- [ ] Run tests - verify they FAIL (proving behavior gaps)
- [ ] Commit tests: `git commit -m "Add comprehensive definition resolution tests"`

### ✅ Server-Side Implementation
- [ ] Add `findMapProcedureDeclaration()` method
- [ ] Add reverse MAP navigation check in `provideDefinition()`
- [ ] Verify method implementation → CLASS declaration (already exists)
- [ ] Run tests - verify they PASS
- [ ] No regression in existing tests
- [ ] Commit: `git commit -m "Implement server-side MAP/CLASS definition resolution"`

### ✅ Client-Side Cleanup (ONLY AFTER SERVER TESTS PASS)
- [ ] Remove `ClarionDefinitionProvider` class entirely
- [ ] Remove `definitionProvider.ts` file
- [ ] Clean up imports in `LanguageFeatureManager.ts`
- [ ] Run all tests - verify NO REGRESSIONS
- [ ] Manual testing in VS Code
- [ ] Commit: `git commit -m "Remove obsolete client-side definition provider"`

### ✅ Validation
- [ ] Run full test suite: `npm test`
- [ ] Manual testing scenarios:
  - [ ] F12 on MAP procedure → implementation
  - [ ] F12 on PROCEDURE → MAP declaration
  - [ ] F12 on CLASS method → implementation (cross-file)
  - [ ] F12 on method implementation → CLASS declaration
  - [ ] F12 on `self.Method()` → declaration
  - [ ] F12 on variable → definition (verify no regression)
- [ ] Performance check (no noticeable slowdown)
- [ ] Document behavior in CHANGELOG.md

### ✅ Merge Preparation
- [ ] Rebase on parent branch: `git rebase version-0.7.8`
- [ ] Resolve conflicts if any
- [ ] Final test run
- [ ] Code review checklist:
  - [ ] Tests cover all edge cases
  - [ ] No duplicated logic
  - [ ] Logging appropriately placed
  - [ ] Error handling in place
- [ ] Merge to parent branch

---

## Risk Mitigation

### Risk: Breaking Existing Functionality
**Mitigation:** TDD approach with comprehensive test suite BEFORE refactoring

### Risk: Performance Regression
**Mitigation:** 
- Leverage existing `TokenCache` (already in use)
- Use indexed lookups in `DocumentStructure`
- No regex parsing in hot paths

### Risk: Incomplete Client-Side Behavior Replication
**Mitigation:**
- Test matrix covers all client-side code paths
- Manual testing checklist
- Maintain client-side code until server proven equivalent

### Risk: INCLUDE Resolution Failures
**Mitigation:**
- Server already has `SolutionManager` integration
- `ClassMemberResolver` already handles INCLUDE searching
- Test with nested INCLUDE scenarios

---

## Success Criteria

1. ✅ All new tests pass (28+ tests added)
2. ✅ All existing tests pass (no regression)
3. ✅ Manual testing scenarios work identically
4. ✅ Client-side `ClarionDefinitionProvider` removed
5. ✅ No performance degradation
6. ✅ Code simpler (less duplication)
7. ✅ Future maintenance easier (single implementation)

---

## Timeline Estimate

| Phase | Task | Effort | Dependencies |
|-------|------|--------|--------------|
| 1 | Test Writing | 4-6 hours | None |
| 2 | Server Implementation | 2-3 hours | Phase 1 complete |
| 3 | Client Cleanup | 1 hour | Phase 2 tests pass |
| 4 | Testing & Validation | 2-3 hours | Phase 3 complete |
| **Total** | **Full Migration** | **9-13 hours** | Sequential |

---

## Appendix: Code References

### Server-Side Files
- `server/src/providers/DefinitionProvider.ts` (2121 lines) - Main provider
- `server/src/utils/ClassMemberResolver.ts` - Class member resolution
- `server/src/utils/MethodOverloadResolver.ts` - Overload matching
- `server/src/utils/TokenHelper.ts` - Scope utilities
- `server/src/TokenCache.ts` - Token caching
- `server/src/DocumentStructure.ts` - Structure analysis

### Client-Side Files (TO BE REMOVED)
- `client/src/providers/definitionProvider.ts` (294 lines) - DISABLED provider
- References in `client/src/providers/LanguageFeatureManager.ts` (lines 85-102)

### Test Files
- `server/src/test/DefinitionProvider.test.ts` (235 lines) - Current tests

---

## Notes

- Client-side provider is **already disabled** (commented out since lines 85-102)
- Server-side provider is **already active and comprehensive**
- Main gap: Explicit MAP procedure bidirectional navigation
- All infrastructure exists: tokens, caching, cross-file resolution
- This is primarily a **test coverage + small enhancement** task, not a major refactor
- TDD approach ensures no behavior loss during cleanup

---

## Questions for Review

1. **Scope Confirmation:** Should we also migrate HoverProvider and ImplementationProvider to server-side, or focus only on DefinitionProvider?
   - *Decision: Focus on DefinitionProvider only (as requested)*

2. **Client-Side Preservation:** Should we keep `ClarionDefinitionProvider` file as a reference, or delete entirely?
   - *Recommendation: Delete entirely - reduces confusion, server is source of truth*

3. **Test Location:** Should MAP/CLASS tests be in a separate file, or extend existing `DefinitionProvider.test.ts`?
   - *Recommendation: Extend existing file - keeps all definition tests together*

4. **Performance Baseline:** Should we measure definition resolution latency before/after?
   - *Recommendation: Yes - add simple timing logs in test runs*

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-25  
**Status:** Ready for Review  
**Next Step:** Create feature branch and begin Phase 1 (Test Writing)
