# Clarion Syntax Diagnostics Feature Analysis

**Feature:** Real-time validation of unterminated structures  
**Date:** 2025-11-30  
**Status:** Planning Phase  
**Approach:** Test-Driven Development (TDD)

## Overview

Implement real-time syntax diagnostics in the language server to detect unterminated structures (IF, LOOP, CASE, GROUP, etc.) and display errors to users in VS Code.

## Knowledge Base Reference

All validation rules based on: `docs/CLARION_LANGUAGE_REFERENCE.md`

### Structures That Require Terminators

#### Control Structures
Must be terminated with `END` or `.`:
- **IF** - Single terminator for entire IF/ELSIF/ELSE structure
- **LOOP** - Requires terminator
- **CASE** - Requires terminator
- **EXECUTE** - Requires terminator
- **BEGIN** - Requires END (code block)

#### Data Structures
Must be terminated with `END` or `.`:
- **GROUP** - Requires terminator
- **QUEUE** - Requires terminator
- **FILE** - Requires terminator
- **RECORD** - Requires terminator
- **CLASS** - Requires END
- **INTERFACE** - Requires END
- **MODULE** - Requires END (inside MAP)
- **MAP** - Requires END

### Structures That Do NOT Require Terminators

- **PROCEDURE** - Implicitly terminated by next procedure or EOF
- **MEMBER** - No terminator (module-level keyword)
- **PROGRAM** - No terminator (module-level keyword)
- **ROUTINE** - Implicitly terminated by next ROUTINE/PROCEDURE or EOF
- **ELSIF** - Part of IF structure, no separate terminator
- **ELSE** - Part of IF/CASE structure, no separate terminator

### Special Rules

1. **IF/ELSIF/ELSE**: Only ONE terminator for entire structure
   ```clarion
   IF x < 0 THEN
     result = -1
   ELSIF x = 0 THEN
     result = 0
   ELSE
     result = 1
   .              ! ← Single terminator for entire IF
   ```

2. **Dot vs END**: Either can be used interchangeably
   ```clarion
   IF a=b THEN c=d.           ! Dot terminator
   IF a=b THEN c=d END        ! END terminator
   ```

3. **Scope Boundaries**: Structures must be terminated within their scope
   - Control structures within procedures
   - Data structures before CODE section
   - MAP structures at module level

## Architecture

### Component Structure

```
server/src/
├── providers/
│   ├── DiagnosticProvider.ts        # NEW - Main validation logic
│   └── StructureValidator.ts        # NEW - Structure-specific rules
├── test/
│   ├── DiagnosticProvider.test.ts   # NEW - TDD tests
│   └── StructureValidator.test.ts   # NEW - Validation tests
└── server.ts                        # MODIFY - Register diagnostics
```

### Class Design

#### DiagnosticProvider
```typescript
export class DiagnosticProvider {
  /**
   * Validate a Clarion document for syntax errors
   * @param document - TextDocument to validate
   * @returns Array of Diagnostic objects
   */
  static validateDocument(document: TextDocument): Diagnostic[];
  
  /**
   * Validate structure terminators
   * @param tokens - Tokenized document
   * @returns Array of Diagnostic objects for unterminated structures
   */
  static validateStructureTerminators(tokens: Token[]): Diagnostic[];
  
  /**
   * Create diagnostic for unterminated structure
   * @param structure - Token representing unclosed structure
   * @returns Diagnostic with error details
   */
  private static createUnterminatedStructureDiagnostic(structure: Token): Diagnostic;
}
```

#### StructureValidator
```typescript
export class StructureValidator {
  private structureStack: StructureStackItem[] = [];
  
  /**
   * Check if token type requires terminator
   */
  requiresTerminator(structureType: string): boolean;
  
  /**
   * Check if token is valid terminator for structure
   */
  isValidTerminator(terminator: Token, structure: Token): boolean;
  
  /**
   * Process token and update structure stack
   */
  processToken(token: Token): void;
  
  /**
   * Get list of unterminated structures
   */
  getUnterminatedStructures(): Token[];
}

interface StructureStackItem {
  token: Token;
  structureType: string;
  expectsTerminator: boolean;
  line: number;
  column: number;
}
```

### Integration with Language Server

#### server.ts modifications
```typescript
// Add to InitializeResult capabilities
capabilities: {
  textDocumentSync: TextDocumentSyncKind.Full,
  diagnosticProvider: {
    interFileDependencies: false,
    workspaceDiagnostics: false
  }
}

// Add diagnostic handler
connection.languages.diagnostics.on(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return { kind: 'full', items: [] };
  
  const diagnostics = DiagnosticProvider.validateDocument(document);
  return {
    kind: 'full',
    items: diagnostics
  };
});

// Trigger diagnostics on document change
documents.onDidChangeContent(change => {
  // ... existing code ...
  connection.languages.diagnostics.refresh();
});
```

## Test-Driven Development Approach

### Phase 1: Write Failing Tests

Create comprehensive tests that define expected behavior:

#### Test Categories

1. **Unterminated IF Statements**
   ```typescript
   test('Should detect IF without terminator', () => {
     const code = `TestProc PROCEDURE()
       CODE
       IF x > 0 THEN
         y = 1
       RETURN`;
     const diagnostics = validateCode(code);
     expect(diagnostics).toHaveLength(1);
     expect(diagnostics[0].message).toContain('IF');
     expect(diagnostics[0].message).toContain('unterminated');
   });
   ```

2. **Unterminated LOOP Statements**
3. **Unterminated CASE Statements**
4. **Unterminated Data Structures (GROUP, QUEUE, etc.)**
5. **Valid Terminated Structures (should pass)**
6. **IF/ELSIF/ELSE with single terminator (should pass)**
7. **Procedures without END (should pass)**
8. **Nested structures**

### Phase 2: Implement Feature

Implement code to make tests pass:

1. Create `StructureValidator` class
2. Implement structure tracking logic
3. Create `DiagnosticProvider` class
4. Implement diagnostic creation
5. Integrate with language server
6. Run tests continuously until all pass

### Phase 3: Validate with Real Code

Test with actual Clarion programs in `test-programs/`:
- Run against `TEST_CLARION_SYNTAX_FIXED.clw` (should have 0 diagnostics)
- Run against modified version with intentional errors (should detect)

## Validation Rules Matrix

| Structure | Requires END/. | Special Rules |
|-----------|----------------|---------------|
| IF | ✅ Yes | Single for IF/ELSIF/ELSE |
| ELSIF | ❌ No | Part of IF |
| ELSE | ❌ No | Part of IF/CASE |
| LOOP | ✅ Yes | - |
| CASE | ✅ Yes | - |
| OF | ❌ No | Part of CASE |
| EXECUTE | ✅ Yes | - |
| BEGIN | ✅ Yes | Code block |
| GROUP | ✅ Yes | - |
| QUEUE | ✅ Yes | - |
| FILE | ✅ Yes | - |
| RECORD | ✅ Yes | - |
| CLASS | ✅ Yes | - |
| INTERFACE | ✅ Yes | - |
| MAP | ✅ Yes | - |
| MODULE | ✅ Yes | Inside MAP |
| PROCEDURE | ❌ No | Implicit |
| ROUTINE | ❌ No | Implicit |
| PROGRAM | ❌ No | Module-level |
| MEMBER | ❌ No | Module-level |

## Error Messages

### Unterminated Structure
```
IF statement at line X is not terminated with END or .
Expected END or . before line Y
```

### Mismatched Terminator
```
END at line X does not match any open structure
Unexpected END - no structure to close
```

### Context-Aware Messages
```
IF statement starting at line 15 is not terminated
Expected END or . before RETURN at line 20
```

## Diagnostic Severity Levels

- **Error**: Unterminated structure (prevents compilation)
- **Warning**: (Future) Style issues, deprecated syntax
- **Information**: (Future) Optimization suggestions
- **Hint**: (Future) Code improvements

## Performance Considerations

### Optimization Strategies

1. **Incremental Updates**
   - Only re-validate changed procedures/sections
   - Cache validation results per procedure

2. **Debouncing**
   - Delay validation 300ms after last keystroke
   - Prevent validation on every character

3. **Token Reuse**
   - Use existing tokenization from `TokenCache`
   - No need to re-tokenize for validation

4. **Scope Limiting**
   - Only validate within procedure boundaries
   - Skip validation in comments/strings

### Expected Performance

- **Small files** (< 500 lines): < 10ms
- **Medium files** (500-2000 lines): < 50ms
- **Large files** (2000+ lines): < 200ms

## Testing Strategy

### Unit Tests (TDD Approach)

**File:** `server/src/test/DiagnosticProvider.test.ts`

Test suites:
1. **Structure Detection** (20 tests)
   - Detect each structure type
   - Verify terminator requirements

2. **Validation Logic** (30 tests)
   - Unterminated structures
   - Properly terminated structures
   - Nested structures
   - Edge cases

3. **Diagnostic Creation** (10 tests)
   - Message format
   - Line/column accuracy
   - Severity levels

4. **Integration** (10 tests)
   - Full document validation
   - Multiple errors
   - No false positives

**Total:** ~70 unit tests

### Integration Tests

Test with real Clarion programs:
1. `TEST_CLARION_SYNTAX_FIXED.clw` - Should produce 0 diagnostics
2. Modified versions with intentional errors - Should detect all errors
3. Complex nested structures - Should handle correctly

### Test Execution

```bash
npm test                          # Run all tests
npm test DiagnosticProvider      # Run specific test suite
npm test -- --watch              # Watch mode for TDD
```

## Implementation Phases

### Phase 1: Setup & Tests (Day 1)
- ✅ Create analysis document (this file)
- [ ] Create test file structure
- [ ] Write failing tests for IF statements
- [ ] Write failing tests for LOOP statements
- [ ] Write failing tests for data structures
- [ ] Verify all tests fail initially

**Deliverable:** Comprehensive failing test suite

### Phase 2: Core Implementation (Day 1-2)
- [ ] Create `StructureValidator` class
- [ ] Implement structure stack tracking
- [ ] Implement terminator detection
- [ ] Run tests - some should pass
- [ ] Create `DiagnosticProvider` class
- [ ] Implement diagnostic creation
- [ ] Run tests - more should pass

**Deliverable:** Basic validation working, tests passing

### Phase 3: Integration (Day 2)
- [ ] Integrate with language server
- [ ] Add diagnostic capability registration
- [ ] Add refresh on document change
- [ ] Test in VS Code extension
- [ ] All tests passing

**Deliverable:** Feature working in VS Code

### Phase 4: Polish & Validation (Day 3)
- [ ] Test with real Clarion programs
- [ ] Refine error messages
- [ ] Add edge case handling
- [ ] Performance optimization
- [ ] Update documentation

**Deliverable:** Production-ready feature

## Success Criteria

### Must Have
- ✅ Detects all unterminated IF statements
- ✅ Detects all unterminated LOOP statements
- ✅ Detects all unterminated CASE statements
- ✅ Detects unterminated data structures (GROUP, QUEUE, etc.)
- ✅ No false positives on valid code
- ✅ All 70+ unit tests passing
- ✅ Works in VS Code with real-time feedback

### Nice to Have
- Suggest fix actions (add END or .)
- Context-aware messages with structure name
- Quick fix code actions
- Configurable severity levels

## Risks & Mitigations

### Risk 1: False Positives
**Impact:** High - Users lose trust in diagnostics  
**Mitigation:** Comprehensive test suite, validate against KB rules  
**Status:** Addressed with TDD approach

### Risk 2: Performance Issues
**Impact:** Medium - Slow editor experience  
**Mitigation:** Token reuse, debouncing, scope limiting  
**Status:** Monitored during implementation

### Risk 3: Incomplete KB Rules
**Impact:** Medium - Missing validation cases  
**Mitigation:** Refer to KB, ask user for clarification  
**Status:** KB is comprehensive, can be extended

## Future Enhancements

### Phase 2 Features (Future)
1. **Semantic Validation**
   - Undefined variable usage
   - Type mismatches
   - Unreachable code

2. **Style Checking**
   - Column 0 violations
   - Unicode character detection
   - Indentation consistency

3. **Code Actions**
   - Quick fix: Add END
   - Quick fix: Add dot terminator
   - Quick fix: Remove unnecessary END

4. **Custom Rules**
   - User-configurable validation
   - Project-specific rules
   - Team coding standards

## Documentation Updates

After implementation, update:
- [ ] `docs/CLARION_LANGUAGE_REFERENCE.md` - Add validation rules section
- [ ] `README.md` - Document diagnostic feature
- [ ] `CHANGELOG.md` - Add feature to changelog
- [ ] `docs/TEST_RESULTS.md` - Update with new test counts

## References

- **Knowledge Base:** `docs/CLARION_LANGUAGE_REFERENCE.md`
- **LSP Spec:** [Diagnostic](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#diagnostic)
- **VS Code API:** [DiagnosticProvider](https://code.visualstudio.com/api/references/vscode-api#languages.registerDiagnosticProvider)
- **TDD Reference:** [Test-Driven Development](https://en.wikipedia.org/wiki/Test-driven_development)

## Appendix: Code Examples

### Example 1: Simple Unterminated IF
```clarion
TestProc PROCEDURE()
x LONG
  CODE
  IF x > 0 THEN    ! ← Opens structure
    y = 1
  RETURN           ! ← ERROR: IF not terminated
```
**Expected:** Diagnostic at line 4 (IF line)

### Example 2: Properly Terminated IF
```clarion
TestProc PROCEDURE()
x LONG
  CODE
  IF x > 0 THEN
    y = 1
  .                ! ← Properly terminated
  RETURN
```
**Expected:** No diagnostic

### Example 3: IF/ELSIF/ELSE with Single Terminator
```clarion
TestProc PROCEDURE()
x LONG
  CODE
  IF x < 0 THEN
    result = -1
  ELSIF x = 0 THEN
    result = 0
  ELSE
    result = 1
  .                ! ← Single terminator for entire structure
  RETURN
```
**Expected:** No diagnostic

### Example 4: Nested Structures
```clarion
TestProc PROCEDURE()
x LONG
y LONG
  CODE
  IF x > 0 THEN
    LOOP           ! ← Opens LOOP
      y += 1
      IF y > 10 THEN BREAK.
    END            ! ← Closes LOOP
  .                ! ← Closes IF
  RETURN
```
**Expected:** No diagnostic

### Example 5: Multiple Errors
```clarion
TestProc PROCEDURE()
x LONG
MyGroup GROUP      ! ← Opens GROUP (unterminated)
Field1 LONG
Field2 LONG
  CODE
  IF x > 0 THEN    ! ← Opens IF (unterminated)
    y = 1
  RETURN
```
**Expected:** 2 diagnostics (GROUP and IF)

---

**Status:** Ready for TDD implementation  
**Next Step:** Create failing test suite in `DiagnosticProvider.test.ts`
