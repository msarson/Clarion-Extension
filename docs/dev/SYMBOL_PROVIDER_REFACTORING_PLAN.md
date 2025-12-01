# Symbol Provider Refactoring Plan

## Current Status
The `ClarionDocumentSymbolProvider` is a large (~2000+ lines) complex class that needs systematic refactoring to improve maintainability.

## Goals
1. **Reduce complexity** - Break down large methods into smaller, focused functions
2. **Eliminate duplication** - Extract common patterns into helpers
3. **Improve testability** - Make it easier to unit test individual components
4. **Fix bugs** - Address hierarchy issues with class method implementations

## Phase 1: Extract Symbol Creation Patterns
**Status**: ✅ Started - SymbolBuilder.ts created with initial helpers

### Tasks
- [x] Create SymbolBuilder utility class
- [ ] Replace all `DocumentSymbol.create()` calls with `SymbolBuilder.createSymbol()`
- [ ] Replace all `Range.create()` calls with `SymbolBuilder.createRange()` or `createLineRange()`
- [ ] Use `SymbolBuilder.parseClassMethod()` consistently
- [ ] Use `SymbolBuilder.extractAttributes()` for structure attributes

### Benefits
- Consistent symbol creation across the codebase
- Easier to modify symbol formatting in one place
- Reduced line count by ~20%

## Phase 2: Extract Token Processing Logic
**Status**: 📋 Planned

### Create New Utility: `TokenProcessor.ts`
Move token manipulation logic out of the provider:
- `extractParenContent()`
- `findMatchingEnd()`
- `getTokensInRange()`
- `findTokenByType()`
- Token iteration patterns

### Benefits
- Reusable token processing across providers
- Easier to test token manipulation logic
- Cleaner provider code

## Phase 3: Extract Hierarchy Management
**Status**: 📋 Planned - **Critical for fixing bugs**

### Create New Class: `SymbolHierarchyManager.ts`
Handle parent-child relationships and nesting:
- Class implementation grouping
- Method organization under classes
- Procedure nesting detection
- Parent stack management

### Benefits
- Fixes the "methods appearing under wrong parent" bug
- Easier to reason about symbol hierarchy
- Better separation of concerns

## Phase 4: Break Down `provideDocumentSymbols()`
**Status**: 📋 Planned

### Current Issues
- Single 1500+ line method
- Multiple responsibilities mixed together
- Hard to understand control flow

### Proposed Structure
```typescript
provideDocumentSymbols() {
    // 1. Initialize
    this.initialize();
    
    // 2. First pass: collect all symbols
    const rawSymbols = this.collectSymbols(tokens);
    
    // 3. Build hierarchy
    const hierarchicalSymbols = this.buildHierarchy(rawSymbols);
    
    // 4. Post-process
    return this.finalizeSymbols(hierarchicalSymbols);
}
```

### Extract Methods
- `collectProcedureSymbols()`
- `collectStructureSymbols()`
- `collectRoutineSymbols()`
- `collectVariableSymbols()`
- `buildClassHierarchy()`
- `organizeMethodsIntoClasses()`

## Phase 5: Improve Class Method Handling
**Status**: 🐛 Bug - Needs fixing

### Current Issues
1. Method implementations appearing under wrong parents
2. Case-sensitivity causing duplicate class containers
3. Regular procedures getting "Methods" children incorrectly

### Proposed Fix
1. Separate tracking: class methods vs regular procedures
2. Case-insensitive class name grouping (already using `.toUpperCase()`)
3. Only create "Methods" container for actual class implementations
4. Ensure class containers are always root-level

### Implementation Steps
1. Track method implementations separately during collection
2. After all symbols collected, group by class name (uppercase)
3. Create class implementation containers
4. Add "Methods" sub-container
5. Move methods into their class containers
6. Add non-class symbols to root

## Phase 6: Add Comprehensive Tests
**Status**: 📋 Planned

### Test Coverage Needed
- Symbol creation for each structure type
- Method grouping by class
- Hierarchy building
- Edge cases (nested structures, overloaded methods, etc.)

## Measurement Criteria

### Code Quality Metrics
- [ ] Method count < 20 per class
- [ ] Method length < 100 lines each
- [ ] Cyclomatic complexity < 10
- [ ] Code duplication < 5%

### Performance Metrics
- [ ] Symbol generation < 150ms for 14K line files
- [ ] No performance regression from refactoring

### Bug Fixes
- [ ] Class method hierarchy displays correctly
- [ ] No duplicate class containers
- [ ] Methods only appear under classes, not regular procedures

## Notes for Implementation

### Safe Refactoring Approach
1. Always commit working state before changes
2. Extract one pattern at a time
3. Test after each extraction
4. Keep both old and new code until verified
5. Update tests as you go

### Risk Areas
- Hierarchy building logic is complex
- Multiple interdependent pieces
- Performance-sensitive code
- Limited test coverage currently

## Next Steps
1. Complete Phase 1 - Use SymbolBuilder consistently
2. Write tests for current behavior
3. Extract TokenProcessor
4. Fix class method hierarchy bug (Phase 5)
5. Continue with remaining phases
