# HoverProvider Architecture Analysis
**Date:** 2026-01-04  
**Analyzed Version:** 0.8.4  
**Total Lines:** 1,857 lines

---

## Executive Summary

The `HoverProvider` class has grown into a **God Object** anti-pattern with significant code duplication and unclear separation of concerns. While some refactoring has begun (extraction of helper classes), the main provider remains bloated with 1,857 lines and handles too many responsibilities directly.

### Severity: 🔴 HIGH
- **Technical Debt:** High
- **Maintainability:** Low  
- **Testability:** Difficult
- **Performance Impact:** Moderate (repeated file reads, no caching strategy)

---

## Current Architecture

### File Structure
```
server/src/providers/
├── HoverProvider.ts (1,857 lines) ⚠️ TOO LARGE
└── hover/
    ├── ContextualHoverHandler.ts (199 lines) ✅
    ├── HoverFormatter.ts (576 lines) ⚠️ MODERATE
    ├── SymbolHoverResolver.ts (84 lines) ✅
    └── VariableHoverResolver.ts (466 lines) ⚠️ MODERATE
```

### Already Extracted (Good!) ✅
| Class | Lines | Purpose | Status |
|-------|-------|---------|--------|
| `HoverFormatter` | 576 | Format hover markdown | ✅ Well-used |
| `ContextualHoverHandler` | 199 | Context-aware keyword hover | ✅ Partially used |
| `SymbolHoverResolver` | 84 | Data types & controls | ✅ Used |
| `VariableHoverResolver` | 466 | Variable hover | ⚠️ UNDERUTILIZED |

---

## Code Smells Identified

### 🔴 CRITICAL: God Object
**Lines:** 1,857  
**Methods:** 25+ private methods  
**Responsibilities:** 22 distinct concerns in ONE method

The `provideHover()` method alone is **829 lines** (lines 69-897).

### 🔴 CRITICAL: Duplicate Logic

**Variable Resolution - TWO DUPLICATE PATHS:**

1. **Path A:** `HoverProvider` → Direct inline logic (lines 687-892, plus helper methods)
2. **Path B:** `HoverProvider` → `VariableHoverResolver` (only partially used!)

Both implement global/module variable lookup with nearly identical code!

### 🔴 CRITICAL: Mixed Responsibilities

`HoverProvider.provideHover()` handles ALL of these directly:
1. OMIT/COMPILE block detection
2. Word extraction & context detection  
3. MODULE keyword special handling
4. TO keyword special handling
5. ELSE keyword special handling
6. PROCEDURE keyword special handling
7. Procedure call detection & resolution
8. Data type & control hover
9. Attribute hover
10. Built-in function hover
11. Method implementation detection
12. MAP procedure hover (declaration ↔ implementation)
13. Method declaration hover (declaration ↔ implementation)
14. Structure/group field access
15. Class member access (SELF.member)
16. Variable field access (structure.field)
17. Parameter hover
18. Local variable hover
19. Module-local variable hover
20. Global variable hover (current file)
21. Global variable hover (MEMBER parent file)
22. CLASS type hover

**That's 22 distinct responsibilities in ONE method!**

### 🟡 MODERATE: File I/O Duplication
File reading patterns repeated throughout:
```typescript
// Pattern repeated 5+ times:
const fileContent = await fs.promises.readFile(filePath, 'utf-8');
const doc = TextDocument.create(uri, 'clarion', 1, fileContent);
const tokens = this.tokenCache.getTokens(doc);
```

---

## Key Problems

### Problem 1: VariableHoverResolver Not Fully Utilized ⚠️
**Current State:**
- `VariableHoverResolver` has complete implementations for:
  - `findParameterHover()` ✅ Used
  - `findLocalVariableHover()` ✅ Used
  - `findModuleVariableHover()` ❌ NOT USED
  - `findGlobalVariableHover()` ❌ NOT USED

**Why?**
`HoverProvider` reimplements global/module variable logic inline!

### Problem 2: No ProcedureHoverResolver
Procedure hover logic (200+ lines) is inline in `provideHover()`

### Problem 3: No MethodHoverResolver  
Method hover logic (150+ lines) is inline

### Problem 4: No Caching Strategy
File reads are repeated without caching - MEMBER parent files and MODULE files read on every hover

---

## Recommended Refactoring Path

### Phase 1: Extract Missing Resolvers (PRIORITY) 🔴

#### 1.1: Create `ProcedureHoverResolver`
**Extract from:** Lines 148-204, 276-346, 349-392  
**Lines Reduced:** ~300 lines

```typescript
class ProcedureHoverResolver {
    async resolveProcedureCall(name: string, context: HoverContext): Promise<Hover | null>
    async resolveMapDeclaration(name: string, context: HoverContext): Promise<Hover | null>
    async resolveProcedureImplementation(name: string, context: HoverContext): Promise<Hover | null>
}
```

#### 1.2: Create `MethodHoverResolver`
**Extract from:** Lines 249-272, 394-585  
**Lines Reduced:** ~200 lines

```typescript
class MethodHoverResolver {
    async resolveMethodImplementation(context: HoverContext): Promise<Hover | null>
    async resolveMethodDeclaration(context: HoverContext): Promise<Hover | null>
    async resolveMethodCall(className: string, methodName: string, context: HoverContext): Promise<Hover | null>
}
```

#### 1.3: Fully Utilize `VariableHoverResolver` ⭐ QUICK WIN
**Replace:** Lines 687-892 (inline variable logic)  
**With:** Calls to EXISTING `VariableHoverResolver` methods  
**Lines Reduced:** ~200 lines  
**Effort:** LOW (methods already exist!)

**Result:** Main provider reduced from 1,857 → ~1,157 lines (-700 lines)

---

### Phase 2: Context Detection Layer 🟡

#### 2.1: Create `HoverContextBuilder`
**Extract from:** Lines 73-117 (context detection)  
**Lines Reduced:** ~50 lines

```typescript
interface HoverContext {
    word: string;
    wordRange: Range;
    position: Position;
    document: TextDocument;
    line: string;
    tokens: Token[];
    currentScope: Token | null;
    
    // Context flags
    isInMapBlock: boolean;
    isInWindowContext: boolean;
    isInClassBlock: boolean;
    hasLabelBefore: boolean;
    isInOmitBlock: boolean;
    
    // Parsed patterns
    isProcedureCall: boolean;
    isMethodCall: boolean;
    isStructureAccess: boolean;
}

class HoverContextBuilder {
    static build(document: TextDocument, position: Position): HoverContext
}
```

---

### Phase 3: Routing Mechanism 🟡

#### 3.1: Create `HoverRouter`
Clear, testable routing logic to replace nested conditionals

```typescript
class HoverRouter {
    constructor(
        private procedureResolver: ProcedureHoverResolver,
        private methodResolver: MethodHoverResolver,
        private variableResolver: VariableHoverResolver,
        private symbolResolver: SymbolHoverResolver,
        private contextHandler: ContextualHoverHandler
    ) {}
    
    async route(context: HoverContext): Promise<Hover | null> {
        // 1. Structural keywords
        if (this.isStructuralKeyword(context.word)) {
            return this.contextHandler.handle(context);
        }
        
        // 2. Procedure calls
        if (context.isProcedureCall) {
            return this.procedureResolver.resolve(context);
        }
        
        // 3. Methods
        if (this.isMethodContext(context)) {
            return this.methodResolver.resolve(context);
        }
        
        // 4. Symbols (data types & controls)
        const symbolHover = await this.symbolResolver.resolve(context);
        if (symbolHover) return symbolHover;
        
        // 5. Attributes & built-ins
        // ... etc
        
        // 6. Variables
        return this.variableResolver.resolve(context);
    }
}
```

**Result:** Main provider becomes a coordinator, not an implementer

---

### Phase 4: Caching Layer 🟡

#### 4.1: Create `CrossFileCache`
```typescript
class CrossFileCache {
    private documentCache: Map<string, TextDocument> = new Map();
    private tokenCache: Map<string, Token[]> = new Map();
    
    async getOrLoadDocument(filePath: string): Promise<TextDocument>
    getOrParseTokens(document: TextDocument): Token[]
    invalidate(filePath: string): void
    clear(): void
}
```

**Performance gain:** 50-70% reduction in file I/O

---

### Phase 5: Cleanup & Consolidation 🟢

#### 5.1: Remove Duplicate Methods
- ❌ Remove `findGlobalVariable()` from HoverProvider
- ❌ Remove `findModuleLocalVariable()` from HoverProvider  
- ❌ Remove `findLocalVariableInfo()` from HoverProvider
- ✅ Use only `VariableHoverResolver` methods

#### 5.2: Consolidate Formatting
- Move `buildScopeMarkdown()` to `HoverFormatter`
- Move `buildLocationInfo()` to `HoverFormatter`
- Move `buildVariableHover()` to `HoverFormatter`

---

## Target Architecture

```
HoverProvider (100-150 lines)
  ├─ provideHover() → Router
  └─ Constructor (DI setup)

HoverRouter (150-200 lines)
  └─ route() → Delegates to resolvers

Resolvers (each 200-400 lines)
  ├─ ProcedureHoverResolver (NEW)
  ├─ MethodHoverResolver (NEW)
  ├─ VariableHoverResolver (EXISTS, improve usage)
  ├─ SymbolHoverResolver (EXISTS)
  └─ AttributeBuiltinResolver (NEW)

Support
  ├─ HoverContextBuilder (NEW)
  ├─ CrossFileCache (NEW)
  ├─ HoverFormatter (EXISTS, expand)
  └─ ContextualHoverHandler (EXISTS)
```

---

## Metrics Comparison

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Main Provider Lines | 1,857 | 150 | -92% |
| provideHover() Lines | 829 | 50 | -94% |
| Responsibilities | 22 | 1 | -95% |
| Duplicate Code Blocks | 8+ | 0 | -100% |
| File I/O Redundancy | High | Low | ~70% fewer reads |
| Testability | Difficult | Easy | ✅ |
| Cyclomatic Complexity | 50+ | 5-10 | -80% |

---

## Implementation Priority

### High Priority (Do First) 🔴
1. **Fully utilize `VariableHoverResolver`** ⭐ QUICK WIN (methods exist!)
2. **Extract `ProcedureHoverResolver`** - Most duplicated logic
3. **Extract `MethodHoverResolver`** - Second most complex
4. **Create `HoverRouter`** - Simplifies main provider

**Impact:** Reduces HoverProvider from 1,857 → ~500 lines  
**Effort:** 3-5 days

### Medium Priority (Do Next) 🟡  
5. **Create `HoverContextBuilder`** - Centralize context detection
6. **Create `CrossFileCache`** - Performance improvement
7. **Consolidate formatting** - Remove duplication

**Impact:** Further reduces to ~200 lines, improves performance  
**Effort:** 3-4 days

### Low Priority (Nice to Have) 🟢
8. Error handling standardization
9. Logging improvements  
10. Documentation & examples
11. Unit test coverage

**Effort:** 2-3 days

---

## Estimated Effort

**Total:** 8-12 days for complete refactoring

| Phase | Days | Impact |
|-------|------|--------|
| Phase 1 (Extraction) | 3-5 | -700 lines |
| Phase 2 (Context) | 2 | -50 lines |
| Phase 3 (Router) | 1 | -100 lines |
| Phase 4 (Cache) | 1-2 | +Performance |
| Phase 5 (Cleanup) | 1-2 | Quality |

---

## Success Criteria

### Code Quality ✅
- [ ] HoverProvider under 200 lines
- [ ] No methods over 50 lines
- [ ] No duplicate logic
- [ ] Single Responsibility Principle followed
- [ ] Open/Closed Principle followed

### Performance ✅
- [ ] 50% reduction in file I/O operations
- [ ] Sub-100ms hover response time (95th percentile)
- [ ] No memory leaks in cache layer

### Maintainability ✅
- [ ] New hover types can be added without modifying existing resolvers
- [ ] Each resolver independently testable
- [ ] Clear documentation of routing logic

---

## Conclusion

The `HoverProvider` has significant technical debt but a **clear, actionable path forward**:

**Quick Wins (1-2 days):**
1. Fully utilize `VariableHoverResolver` (already exists!)
2. Move formatting helpers to `HoverFormatter`

**Medium Effort (3-5 days):**
3. Extract `ProcedureHoverResolver` and `MethodHoverResolver`
4. Introduce `HoverRouter`

**Polish (2-3 days):**
5. Add `HoverContextBuilder` and `CrossFileCache`

**Payoff:**
- ✅ 90%+ reduction in main provider size
- ✅ Dramatically improved maintainability
- ✅ Better performance
- ✅ Much easier testing
- ✅ Clear path for new features

The existing helper classes show good architectural instincts - we just need to **finish the job** and fully delegate to them!

---

**End of Analysis**
