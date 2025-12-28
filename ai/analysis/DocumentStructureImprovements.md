# DocumentStructure Improvements - Detailed Analysis

**Date:** 2025-12-28  
**Purpose:** Analyze how providers use DocumentStructure and identify opportunities for improvement

---

## Table of Contents
1. [Current Architecture](#current-architecture)
2. [Usage Patterns](#usage-patterns)
3. [Code Duplication Analysis](#code-duplication-analysis)
4. [Proposed High-Level APIs](#proposed-high-level-apis)
5. [Benefits & Tradeoffs](#benefits--tradeoffs)
6. [Implementation Strategy](#implementation-strategy)

---

## Current Architecture

### DocumentStructure Responsibilities

**Current Role:**
- Tokenizes source code into structured tokens
- Builds parent-child relationships between tokens
- Enriches tokens with metadata:
  - `referencedFile` - for MODULE, MEMBER, INCLUDE, LINK
  - `structurePrefix` - for structures with PRE() attribute
  - `isStructureField` - marks fields within structures
  - `executionMarker` - CODE/DATA markers in procedures
  - `finishesAt` - closing line numbers for scopes

**What it DOESN'T do:**
- File path resolution (delegated to `RedirectionParser` via SolutionManager)
- Cross-file lookups
- Overload resolution
- Provide high-level semantic queries

### Current Token Structure

```typescript
interface Token {
    type: TokenType;
    subType?: TokenType;
    value: string;
    line: number;
    start: number;
    label?: string;
    parent?: Token;
    children?: Token[];
    finishesAt?: number;
    executionMarker?: Token;
    hasLocalData?: boolean;
    maxLabelLength?: number;
    
    // File references (added recently)
    referencedFile?: string;  // Unresolved filename
    
    // Structure metadata
    structurePrefix?: string;
    isStructureField?: boolean;
    structureParent?: Token;
    nestedLabel?: string;
}
```

---

## Usage Patterns

### Pattern 1: Finding CLASS MODULE Files

**Where:** HoverProvider (line 234-244), DefinitionProvider (line 240-250), ImplementationProvider (line 240-250)

**Current Code (HoverProvider example):**
```typescript
// Find MODULE token on the same line as the class (after the CLASS token)
const moduleToken = methodTokens.find(t => 
    t.line === classToken.line &&
    t.start > classToken.start &&  // Must come after CLASS token
    t.referencedFile &&
    t.value.toUpperCase().includes('MODULE')
);

const moduleFile = moduleToken?.referencedFile;
```

**Problems:**
- Duplicated in 3 providers
- Token filtering logic is verbose
- Requires knowledge of token ordering on same line
- No direct API to get "module file for this class"

**Ideal API:**
```typescript
// On DocumentStructure instance
const moduleFile = documentStructure.getClassModuleFile(classToken);
// Returns: string | null
```

---

### Pattern 2: Finding MEMBER Parent Files

**Where:** HoverProvider (line 485, 631), DefinitionProvider (line 611, 1177, 1655)

**Current Code:**
```typescript
const memberToken = tokens.find(t => 
    t.line < 5 && 
    t.value.toUpperCase() === 'MEMBER' &&
    t.referencedFile
);

if (memberToken?.referencedFile) {
    // Then use RedirectionParser to resolve path
    // Then read file, tokenize, search...
}
```

**Problems:**
- Duplicated 5+ times across providers
- Magic number (line < 5) hardcoded everywhere
- Resolution logic repeated (RedirectionParser → read → tokenize)
- Verbose pattern for common operation

**Ideal API:**
```typescript
// On DocumentStructure instance
const parentFile = documentStructure.getMemberParentFile();
// Returns: string | null (unresolved filename)

// Or with resolution:
const parentFile = await documentStructure.getMemberParentFileResolved();
// Returns: { path: string, tokens: Token[] } | null
```

---

### Pattern 3: Finding Global Variables in MEMBER Parent

**Where:** HoverProvider (line 492-539, 638-674), DefinitionProvider (line 1184-1230)

**Current Code Pattern (repeated 3 times):**
```typescript
// 1. Find MEMBER token (as above)
const memberToken = tokens.find(t => t.line < 5 && ...);

// 2. Resolve file path via RedirectionParser
const resolved = redirectionParser.findFile(memberToken.referencedFile);

// 3. Read file contents
const parentContents = await fs.promises.readFile(resolvedPath, 'utf-8');

// 4. Create TextDocument
const parentDoc = TextDocument.create(uri, 'clarion', 1, parentContents);

// 5. Tokenize parent file
const parentTokens = this.tokenCache.getTokens(parentDoc);

// 6. Find first CODE token
const firstCodeToken = parentTokens.find(t => 
    t.type === TokenType.Keyword && 
    t.value.toUpperCase() === 'CODE'
);
const globalScopeEndLine = firstCodeToken ? firstCodeToken.line : Number.MAX_SAFE_INTEGER;

// 7. Search for global variable
const globalVar = parentTokens.find(t =>
    t.type === TokenType.Label &&
    t.start === 0 &&
    t.line < globalScopeEndLine &&
    t.value.toLowerCase() === word.toLowerCase()
);
```

**Problems:**
- ~60 lines of duplicated code (3 occurrences)
- Complex multi-step process
- File I/O, tokenization overhead
- Same global scope logic repeated

**Ideal API:**
```typescript
// Synchronous - just returns token
const globalVar = documentStructure.findGlobalVariableInParent(variableName);
// Returns: { token: Token, parentFile: string } | null

// Or async with full resolution
const globalVar = await documentStructure.findGlobalVariableInParentResolved(variableName);
// Returns: { token: Token, parentFile: string, location: Location } | null
```

---

### Pattern 4: MAP Declaration ↔ Implementation Navigation

**Where:** HoverProvider (line 111-202), DefinitionProvider (line 279-291), MapProcedureResolver (entire file)

**Current Code:**
```typescript
// Finding MAP declaration (in MapProcedureResolver)
const mapStructures = tokens.filter(t => 
    t.type === TokenType.Structure && 
    t.value.toUpperCase() === 'MAP'
);

for (const mapToken of mapStructures) {
    const mapStartLine = mapToken.line;
    const mapEndLine = mapToken.finishesAt;
    
    const tokensInMap = tokens.filter(t =>
        t.line > mapStartLine && t.line < mapEndLine
    );
    
    for (const t of tokensInMap) {
        const isMatch = (t.subType === TokenType.MapProcedure && 
                         t.label?.toLowerCase() === procName.toLowerCase()) ||
                        (t.type === TokenType.Function && 
                         t.value.toLowerCase() === procName.toLowerCase());
        // ... more logic
    }
}
```

**Problems:**
- Complex nested loops
- Token filtering across multiple structures
- Overload resolution mixed with navigation logic
- Not easily testable as a unit

**Ideal API:**
```typescript
// On DocumentStructure instance
const mapDeclarations = documentStructure.findMapDeclarations(procName);
// Returns: Token[] (all overloads)

const mapImplementations = documentStructure.findMapImplementations(procName);
// Returns: Token[] (all overloads)
```

---

### Pattern 5: Method Implementation Cross-File Search

**Where:** HoverProvider (line 783-840), ImplementationProvider (line 449-605)

**Current Code Pattern:**
```typescript
// 1. If moduleFile hint exists, resolve it
if (moduleFile) {
    const solutionManager = SolutionManager.getInstance();
    for (const project of solutionManager.solution.projects) {
        const redirectionParser = project.getRedirectionParser();
        const resolved = redirectionParser.findFile(moduleFile);
        if (resolved && resolved.path && fs.existsSync(resolved.path)) {
            const implLine = this.searchFileForImplementation(resolved.path, ...);
            if (implLine !== null) {
                return `${fileUri}:${implLine}`;
            }
        }
    }
}

// 2. Fallback: Search all solution files
for (const project of solutionManager.solution.projects) {
    for (const sourceFile of project.sourceFiles) {
        const fullPath = path.join(project.path, sourceFile.relativePath);
        const implLine = this.searchFileForImplementation(fullPath, ...);
        // ...
    }
}
```

**Problems:**
- ~80 lines duplicated between HoverProvider and ImplementationProvider
- File I/O and tokenization logic mixed with search logic
- No caching of resolved paths or tokens
- SolutionManager directly accessed (tight coupling)

**Ideal API:**
```typescript
// This is more of a cross-file service, but could be coordinated through DocumentStructure
const implLocation = await documentStructure.findMethodImplementation(
    className, 
    methodName, 
    { paramCount, moduleFileHint }
);
// Returns: { file: string, line: number, token: Token } | null
```

---

### Pattern 6: Finding MAP Declaration in MEMBER Parent File

**Where:** HoverProvider (line 127-202), DefinitionProvider (line 620-717)

**Current Code Pattern (~90 lines duplicated):**
```typescript
// 1. Find MEMBER token
const memberToken = tokens.find(t => 
    t.line < 5 && 
    t.value.toUpperCase() === 'MEMBER' &&
    t.referencedFile
);

// 2. Resolve MEMBER file path
const solutionManager = SolutionManager.getInstance();
let resolvedPath: string | null = null;

if (solutionManager && solutionManager.solution) {
    for (const project of solutionManager.solution.projects) {
        const redirectionParser = project.getRedirectionParser();
        const resolved = redirectionParser.findFile(memberFile);
        if (resolved && resolved.path && fs.existsSync(resolved.path)) {
            resolvedPath = resolved.path;
            break;
        }
    }
}

// 3. Read and tokenize parent file
const content = fs.readFileSync(resolvedPath, 'utf8');
const tokenizer = new ClarionTokenizer(content);
const parentTokens = tokenizer.tokenize();

// 4. Find MAP blocks
const mapBlocks = parentTokens.filter(t =>
    t.type === TokenType.Structure &&
    t.value.toUpperCase() === 'MAP'
);

// 5. Search each MAP for MODULE pointing back to current file
const currentFileName = path.basename(document.uri);
for (const mapBlock of mapBlocks) {
    const moduleBlocks = parentTokens.filter(t =>
        t.type === TokenType.Structure &&
        t.value.toUpperCase() === 'MODULE' &&
        t.line > mapStart && t.line < mapEnd
    );
    
    for (const moduleBlock of moduleBlocks) {
        const moduleToken = parentTokens.find(t =>
            t.line === moduleBlock.line &&
            t.value.toUpperCase() === 'MODULE' &&
            t.referencedFile
        );
        
        if (moduleToken?.referencedFile && 
            path.basename(moduleToken.referencedFile).toLowerCase() === currentFileName.toLowerCase()) {
            // Found it! Now search for procedure declaration...
        }
    }
}
```

**Problems:**
- ~90 lines of nearly identical code in 2 places
- Complex nested logic (MAP → MODULE → check filename → find procedure)
- File I/O and tokenization overhead
- Difficult to test in isolation
- Overload resolution logic embedded within

**Ideal API:**
```typescript
// Simple case: just find the declaration
const mapDecl = await documentStructure.findMapDeclarationInParent(procName);
// Returns: { token: Token, file: string, line: number } | null

// With overload resolution
const mapDecl = await documentStructure.findMapDeclarationInParent(
    procName, 
    { signature: implementationSignature }
);
```

---

## Code Duplication Analysis

### Total Lines of Duplicated Code

| Pattern | Occurrences | Lines Each | Total |
|---------|-------------|------------|-------|
| Find CLASS MODULE file | 3 | ~10 lines | ~30 lines |
| Find MEMBER parent file | 5 | ~10 lines | ~50 lines |
| Find global variable in MEMBER parent | 3 | ~60 lines | ~180 lines |
| Find MAP declaration in MEMBER parent | 2 | ~90 lines | ~180 lines |
| Method implementation cross-file search | 2 | ~80 lines | ~160 lines |
| MAP procedure implementation search | 3 | ~40 lines | ~120 lines |

**Total Estimated Duplication: ~720 lines**

### Most Critical Duplications (by impact)

1. **MEMBER parent file lookup (230 lines total)**
   - Used for: global variables, MAP declarations, file resolution
   - Complex: file I/O, tokenization, path resolution
   - High impact: affects 5+ code paths

2. **MAP declaration in MEMBER parent (180 lines total)**
   - Used for: reverse navigation from implementation to declaration
   - Complex: nested structure search (MAP → MODULE → procedure)
   - Includes overload resolution logic

3. **Method implementation cross-file (160 lines total)**
   - Used for: CLASS method navigation
   - Complex: solution-wide search, MODULE file hints
   - Performance critical

---

## Proposed High-Level APIs

### API Design Philosophy

**Principles:**
1. **Single Responsibility** - Each API does one thing well
2. **Layered Approach** - Low-level (token access) + High-level (semantic queries)
3. **Caching** - Expensive operations cached at DocumentStructure level
4. **Async-Friendly** - File I/O operations return promises
5. **Testable** - Each API independently testable

### Proposed API Categories

#### Category 1: File Reference APIs

```typescript
class DocumentStructure {
    /**
     * Gets the MODULE file referenced by a CLASS token
     * @param classToken The CLASS structure token
     * @returns Unresolved filename or null
     */
    getClassModuleFile(classToken: Token): string | null;
    
    /**
     * Gets the MEMBER parent file (if this file is a MEMBER of another)
     * @returns Unresolved filename or null
     */
    getMemberParentFile(): string | null;
    
    /**
     * Gets all INCLUDE files referenced in this document
     * @returns Array of unresolved filenames
     */
    getIncludeFiles(): string[];
    
    /**
     * Gets all MODULE files referenced in MAP blocks
     * @returns Map of module filename to MAP token
     */
    getMapModuleFiles(): Map<string, Token>;
}
```

**Rationale:**
- These are pure data retrieval operations
- No file I/O or resolution (that's SolutionManager's job)
- Simple, cacheable results
- Foundation for higher-level operations

---

#### Category 2: Scope & Navigation APIs

```typescript
class DocumentStructure {
    /**
     * Gets all MAP structure tokens
     * @returns Array of MAP tokens
     */
    getMapBlocks(): Token[];
    
    /**
     * Gets all MAP procedure declarations (all overloads)
     * @param procName Procedure name
     * @returns Array of matching tokens
     */
    findMapDeclarations(procName: string): Token[];
    
    /**
     * Gets all procedure implementations (global, not in MAP)
     * @param procName Procedure name
     * @returns Array of matching tokens
     */
    findProcedureImplementations(procName: string): Token[];
    
    /**
     * Gets all CLASS structure tokens
     * @returns Array of CLASS tokens
     */
    getClasses(): Token[];
    
    /**
     * Finds all method declarations in a class
     * @param className Class name
     * @param methodName Method name (optional)
     * @returns Array of matching method tokens
     */
    findMethodDeclarations(className: string, methodName?: string): Token[];
    
    /**
     * Gets the MODULE block containing a given line (if any)
     * Used to determine if position is inside a MAP MODULE block
     * @param line Line number
     * @returns MODULE token or null
     */
    getModuleBlockAtLine(line: number): Token | null;
    
    /**
     * Checks if a line is inside a MAP block
     * @param line Line number
     * @returns true if inside MAP
     */
    isInMapBlock(line: number): boolean;
}
```

**Rationale:**
- Common queries that require filtering tokens
- Reduce repetitive token.filter() patterns
- Return tokens (not locations) for flexibility
- Can be cached at DocumentStructure level

---

#### Category 3: Global Scope APIs

```typescript
class DocumentStructure {
    /**
     * Gets all global variables (labels at column 0, before first CODE)
     * @returns Array of global variable tokens
     */
    getGlobalVariables(): Token[];
    
    /**
     * Gets the first CODE marker token (global scope boundary)
     * @returns CODE token or null
     */
    getFirstCodeMarker(): Token | null;
    
    /**
     * Checks if a label/variable is in global scope
     * @param token Token to check
     * @returns true if in global scope
     */
    isInGlobalScope(token: Token): boolean;
}
```

**Rationale:**
- Global scope is a well-defined concept in Clarion
- Currently calculated on-demand in multiple places
- Can be computed once during structure processing

---

#### Category 4: Cross-File Resolution APIs (Optional)

**Note:** These involve file I/O and should probably be in a separate service class, but included here for completeness.

```typescript
class DocumentStructure {
    /**
     * Finds a global variable in the MEMBER parent file
     * @param variableName Variable name to find
     * @returns Token and file info, or null
     */
    async findGlobalVariableInParent(
        variableName: string
    ): Promise<{ token: Token; file: string; line: number } | null>;
    
    /**
     * Finds MAP declaration in MEMBER parent file
     * Handles reverse lookup: implementation file -> parent file's MAP
     * @param procName Procedure name
     * @param signature Optional signature for overload resolution
     * @returns Token and file info, or null
     */
    async findMapDeclarationInParent(
        procName: string,
        signature?: string
    ): Promise<{ token: Token; file: string; line: number } | null>;
    
    /**
     * Resolves a referencedFile to an absolute path
     * Uses SolutionManager's RedirectionParser
     * @param filename Unresolved filename
     * @returns Resolved path or null
     */
    async resolveFile(filename: string): Promise<string | null>;
}
```

**Alternative:** Create a separate `CrossFileResolver` service class:

```typescript
class CrossFileResolver {
    constructor(
        private documentStructure: DocumentStructure,
        private solutionManager: SolutionManager
    ) {}
    
    async findGlobalVariableInParent(variableName: string): Promise<...>;
    async findMapDeclarationInParent(procName: string): Promise<...>;
    async findMethodImplementation(className: string, methodName: string): Promise<...>;
    // etc.
}
```

**Recommendation:** Use separate `CrossFileResolver` service
- Keeps DocumentStructure focused on single-file analysis
- Easier to test (mock file I/O)
- Clear separation: DocumentStructure = structure, CrossFileResolver = cross-file queries

---

## Benefits & Tradeoffs

### Benefits

#### 1. **Massive Code Reduction**
- **~720 lines** of duplicated code eliminated
- Providers become simpler, more readable
- Easier to maintain (change once, affect all)

#### 2. **Better Testability**
- Each API can be tested independently
- Mock file I/O at service boundaries
- Unit tests for token queries don't need real files

#### 3. **Performance Opportunities**
- Cache expensive queries (MAP blocks, global variables)
- Index tokens by type for O(1) lookups (already partially done)
- Memoize cross-file resolutions

#### 4. **Clearer Architecture**
- Separation of concerns:
  - DocumentStructure = single-file structure
  - CrossFileResolver = cross-file queries
  - Providers = UI logic (hover, definition, etc.)
- Easier to understand flow

#### 5. **Easier Debugging**
- Centralized logging for structure queries
- Single place to add debug information
- Easier to trace issues

### Tradeoffs

#### 1. **Increased Complexity of DocumentStructure**
- More methods, more responsibility
- Larger class (though better organized)
- **Mitigation:** Split into categories, clear naming, good docs

#### 2. **API Design Decisions**
- What should return tokens vs locations?
- Sync vs async boundaries?
- How much caching?
- **Mitigation:** Follow consistent patterns, document decisions

#### 3. **Migration Effort**
- Need to update all providers
- Risk of introducing bugs
- **Mitigation:** Incremental migration, extensive testing

#### 4. **Potential Over-Engineering**
- Risk of creating APIs that are too specific
- May need to refactor APIs as usage patterns emerge
- **Mitigation:** Start with most common patterns, iterate

---

## Implementation Strategy

### Phase 1: Foundation (No Breaking Changes)

**Goal:** Add new APIs alongside existing token access, prove value

**Tasks:**
1. Add simple getter APIs (no file I/O):
   - `getClassModuleFile(classToken)`
   - `getMemberParentFile()`
   - `getMapBlocks()`
   - `getClasses()`
   - `isInMapBlock(line)`

2. Add token-based search APIs:
   - `findMapDeclarations(procName)`
   - `findProcedureImplementations(procName)`
   - `findMethodDeclarations(className, methodName?)`

3. Add global scope APIs:
   - `getGlobalVariables()`
   - `getFirstCodeMarker()`
   - `isInGlobalScope(token)`

4. Update ONE provider (pick simplest: maybe ImplementationProvider) to use new APIs
5. Verify correctness, measure impact

**Success Criteria:**
- New APIs work correctly
- No regression in existing functionality
- Provider code is simpler, easier to read
- Test coverage for new APIs

---

### Phase 2: Cross-File Service (New Class)

**Goal:** Extract cross-file logic into dedicated service

**Tasks:**
1. Create `CrossFileResolver` class:
   ```typescript
   class CrossFileResolver {
       constructor(
           private documentStructure: DocumentStructure,
           private document: TextDocument,
           private solutionManager: SolutionManager
       ) {}
       
       async findGlobalVariableInParent(name: string): Promise<...>;
       async findMapDeclarationInParent(procName: string, sig?: string): Promise<...>;
       async findMethodImplementationCrossFile(...): Promise<...>;
       async resolveFile(filename: string): Promise<...>;
   }
   ```

2. Implement each method by consolidating duplicated code
3. Add caching layer for:
   - Resolved file paths
   - Tokenized parent files
   - Global variable lookups

4. Update HoverProvider to use CrossFileResolver
5. Update DefinitionProvider to use CrossFileResolver

**Success Criteria:**
- ~500 lines of duplication eliminated
- Cross-file queries are faster (due to caching)
- Providers are significantly simpler
- All tests pass

---

### Phase 3: Optimization & Polish

**Goal:** Improve performance, add missing features

**Tasks:**
1. Add performance profiling
2. Optimize hot paths:
   - Token indexing (by type, by name)
   - Lazy evaluation of expensive queries
3. Add convenience APIs based on usage patterns
4. Update documentation
5. Add integration tests

**Success Criteria:**
- Hover/definition performance is same or better
- Code coverage > 80%
- All existing features work correctly
- Documentation is up-to-date

---

### Phase 4: Refine & Iterate

**Goal:** Learn from usage, adjust APIs

**Tasks:**
1. Gather feedback from team
2. Identify pain points in updated code
3. Refactor APIs as needed
4. Consider additional abstractions

**Success Criteria:**
- Team is happy with new architecture
- New features are easier to add
- Bug reports decrease

---

## Current State Summary

### What Works Well

1. **Token Enrichment**
   - `referencedFile` metadata is a great foundation
   - Parent-child relationships are solid
   - Structure prefixes working well

2. **Tokenization**
   - Fast, reliable
   - Good test coverage
   - Handles complex Clarion syntax

3. **Indexes**
   - `labelIndex`, `procedureIndex` already provide O(1) lookups
   - `tokensByLine` speeds up line-based queries

### What Needs Improvement

1. **High-Level Queries**
   - Providers manually filter tokens repeatedly
   - Complex queries buried in provider code
   - No semantic layer above tokens

2. **Cross-File Logic**
   - Scattered across providers
   - No caching, repeated file I/O
   - Overload resolution mixed with navigation

3. **Code Organization**
   - Large providers (1600+ lines)
   - Duplication (~720 lines)
   - Hard to find relevant code

---

## Recommendations

### Priority 1: Add Semantic APIs (Phase 1)

**Why:** Low risk, high impact
- No breaking changes
- Immediate code reduction
- Proves architecture direction

**Start With:**
```typescript
// DocumentStructure additions
getMapBlocks(): Token[]
findMapDeclarations(procName: string): Token[]
isInMapBlock(line: number): boolean
getClassModuleFile(classToken: Token): string | null
getMemberParentFile(): string | null
```

**Update:** ImplementationProvider to use these APIs first

---

### Priority 2: Extract CrossFileResolver (Phase 2)

**Why:** Addresses biggest duplication
- ~500 lines of duplicated code eliminated
- Clear architecture separation
- Enables caching strategy

**Focus On:**
```typescript
class CrossFileResolver {
    async findGlobalVariableInParent(name: string)
    async findMapDeclarationInParent(procName: string, sig?: string)
    async resolveFile(filename: string)
}
```

**Update:** HoverProvider and DefinitionProvider

---

### Priority 3: Optimize Performance (Phase 3)

**Why:** Future-proofing
- Large codebases need fast navigation
- Caching prevents repeated I/O
- Better user experience

**Focus On:**
- Token indexing by type/name
- File path resolution cache
- Memoized parent file tokens

---

## Open Questions

1. **Should DocumentStructure know about SolutionManager?**
   - Pro: Can resolve file paths directly
   - Con: Tight coupling, harder to test
   - **Recommendation:** No - use CrossFileResolver as intermediary

2. **How to handle caching invalidation?**
   - When should cached tokens be refreshed?
   - File watcher integration?
   - **Recommendation:** Start simple (no caching), add later

3. **Should APIs return tokens or locations?**
   - Tokens = more flexible, providers can format
   - Locations = simpler for providers, less flexibility
   - **Recommendation:** Return tokens, let providers create locations

4. **How to handle overload resolution?**
   - Should DocumentStructure know about parameter types?
   - Or is that a provider concern?
   - **Recommendation:** Keep in separate utilities (ProcedureSignatureUtils)

---

## Conclusion

DocumentStructure is currently a solid tokenization layer with basic metadata enrichment. The next evolution should add **semantic query APIs** that reduce duplication and improve maintainability.

**Key Insights:**
1. ~720 lines of duplicated code can be eliminated
2. Two-layer approach works: DocumentStructure (single-file) + CrossFileResolver (cross-file)
3. Incremental migration is safest: add APIs, update providers one by one
4. Caching and indexing will be important for performance

**Next Step:**
Start with Phase 1 - add simple semantic APIs and update ImplementationProvider as proof of concept.
