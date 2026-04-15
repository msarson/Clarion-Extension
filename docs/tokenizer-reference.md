# Clarion Extension — Token System Reference

> **Purpose:** AI-session reference. Before writing any provider code that searches for symbols, navigates to declarations, or inspects structure, read this document first. The token pipeline already provides most of what you need — avoid re-parsing source text when the answer is in the token tree.

---

## Pipeline Overview

```
Source text
    ↓
ClarionTokenizer.tokenize()
    ↓  Token[]  (type, value, line, start, finishesAt, …)
DocumentStructure.process()
    ↓  mutates tokens in-place:
       • sets subType (GlobalProcedure, MethodImplementation, …)
       • sets parent / children relationships
       • sets executionMarker (CODE token)
       • sets structurePrefix (PRE value)
       • sets label on Structure tokens
       • builds indexes: labelIndex, procedureIndex, tokensByLine, parentIndex
TokenCache (singleton)
    ↓  caches { tokens[], structure, version } per URI
Providers query TokenCache
```

**Key rule:** `DocumentStructure.process()` runs *once* per document version and mutates the token array. By the time any provider receives tokens from `TokenCache`, all parent/child/subType data is already set.

---

## The `Token` Interface — Every Field Explained

```typescript
interface Token {
    type: TokenType;           // Primary classification (see enum below)
    subType?: TokenType;       // Secondary classification (see subtypes section)
    value: string;             // The raw text of the token
    line: number;              // 0-based line number
    start: number;             // 0-based column of the first character
    label?: string;            // For Structure tokens: the label that precedes the structure
                               // e.g. for "MyQueue QUEUE" → token.label = "MyQueue"
                               // For Label tokens: same as value
    finishesAt?: number;       // 0-based line where this structure/procedure ends (at its END)
                               // Set by DocumentStructure. Undefined for single-line tokens.
    parent?: Token;            // Immediate parent in the scope tree (set by DocumentStructure)
    children?: Token[];        // Direct children (set by DocumentStructure)
    executionMarker?: Token;   // The CODE token that starts execution in this proc/routine
    hasLocalData?: boolean;    // True if a DATA section exists before CODE
    inferredCode?: boolean;    // True if CODE is implied (no explicit CODE statement)
    structurePrefix?: string;  // The PRE() value for this structure, e.g. "INV" from PRE(INV)
                               // Also inherited by field tokens inside the structure
    isStructureField?: boolean;// True for Label tokens that are fields inside QUEUE/GROUP/RECORD/FILE
    structureParent?: Token;   // For structure fields: the containing QUEUE/GROUP/RECORD token
    nestedLabel?: string;      // For nested fields: the label of their immediate parent structure
    referencedFile?: string;   // Resolved absolute path for MODULE/INCLUDE/MEMBER/LINK statements
    sourceFile?: string;       // URI this token came from (if loaded from an INCLUDE file)
    sourceContext?: {          // Set when the token originates from an INCLUDE file
        isFromInclude: boolean;
        includeFile: string;   // The .inc file path
        parentFile: string;    // The .clw that has the INCLUDE statement
    };
    implementedInterfaces?: string[]; // CLASS token only: names from IMPLEMENTS() attributes
    maxLabelLength: number;    // Max label width in the containing structure (used for alignment)
    colorParams?: string[];    // For COLOR() attribute tokens
    isSingleLineWithContinuation?: boolean; // Structure spans multiple lines via | continuation
    localVariablesAnalyzed?: boolean; // Perf flag: procedure's local vars already processed
}
```

---

## `TokenType` Enum — Full Reference

| TokenType | What it represents | Notable fields set |
|---|---|---|
| `Label` | A symbol at column 0 in a data section (variable/field declaration) | `label = value`, `isStructureField`, `structureParent`, `structurePrefix`, `nestedLabel` |
| `Procedure` | A `PROCEDURE` or `FUNCTION` keyword — **check subType for role** | `subType`, `label`, `finishesAt`, `parent`, `children`, `executionMarker` |
| `Routine` | A `ROUTINE` keyword | `label`, `finishesAt`, `parent`, `executionMarker` |
| `Structure` | `CLASS`, `INTERFACE`, `MAP`, `MODULE`, `QUEUE`, `GROUP`, `RECORD`, `FILE`, `WINDOW`, `REPORT`, `VIEW`, `APPLICATION`, `SHEET`, `TAB`, `TOOLBAR`, `MENU`, `MENUBAR`, `OLE`, `OPTION` | `label`, `subType`, `finishesAt`, `parent`, `children`, `structurePrefix` |
| `ClarionDocument` | `PROGRAM` or `MEMBER` keyword | `referencedFile` (for MEMBER) |
| `Keyword` | Clarion language keywords (`IF`, `LOOP`, `CASE`, `END`, etc.) | — |
| `EndStatement` | `END` or `.` that closes a structure | — |
| `ExecutionMarker` | `CODE` or `DATA` keywords | — |
| `Variable` | Variable reference in code (not a declaration) | — |
| `Function` | Built-in function call | — |
| `Constant` | Equate/constant value | — |
| `StructureField` | Dot-access field reference (`Queue.Field`) | — |
| `StructurePrefix` | Prefix-notation field reference (`INV:Customer`) | — |
| `FieldEquateLabel` | Field equate (e.g. `FILE{PROP:…}`) | — |
| `TypeReference` | `LIKE(…)` type reference | — |
| `WindowElement` | Window control keywords (`BUTTON`, `LIST`, `ENTRY`, etc.) | — |
| `Interface` | `INTERFACE` structure (as subType on Structure token) | — |
| `Comment` | `!` comment | — |
| `String` | String literal | — |
| `Directive` | Compiler directives (`INCLUDE`, `MEMBER`, `MODULE`, `OMIT`, `COMPILE`) | `referencedFile` |
| `Region` | `!REGION` / `!ENDREGION` | — |

---

## `Procedure` Token — SubTypes

A token with `type === TokenType.Procedure` has one of these subtypes set by `DocumentStructure`:

| subType | What it means | Example |
|---|---|---|
| `GlobalProcedure` | Top-level PROCEDURE with a CODE section (has a body) | `MyProc PROCEDURE(LONG pId)` followed by `CODE` |
| `MethodDeclaration` | PROCEDURE inside a CLASS, MAP, or INTERFACE — declaration only, no CODE | `Init PROCEDURE` inside a `CLASS` block |
| `MethodImplementation` | Dotted PROCEDURE with a CODE section | `MyClass.Init PROCEDURE` followed by `CODE` |
| `MapProcedure` | PROCEDURE inside a standalone MAP (module declaration) | `MyProc PROCEDURE(LONG pId)` inside `MAP` |
| `InterfaceMethod` | PROCEDURE inside an INTERFACE | `GetValue PROCEDURE(*STRING),STRING` inside `INTERFACE` |

### Identifying procedure roles — preferred patterns

```typescript
// Is this a procedure with a body (has CODE)?
const hasBody = token.executionMarker !== undefined;

// Is this a class method declaration (inside CLASS block)?
const isMethodDecl = token.subType === TokenType.MethodDeclaration;

// Is this a class method implementation (e.g. MyClass.Init PROCEDURE)?
const isMethodImpl = token.subType === TokenType.MethodImplementation;

// Is this a top-level procedure?
const isGlobal = token.subType === TokenType.GlobalProcedure;

// The procedure's label (name)
const name = token.label;  // ✅ use token.label, NOT token.value (value = "PROCEDURE")

// The code section start line
const codeLine = token.executionMarker?.line;

// The data section between PROCEDURE and CODE
const hasData = token.hasLocalData;
```

---

## `Structure` Token — SubTypes

`DocumentStructure` sets `subType` on Structure tokens:

| token.value | token.subType |
|---|---|
| `CLASS` | `TokenType.Class` |
| `INTERFACE` | `TokenType.Interface` |
| `QUEUE`, `GROUP`, `RECORD`, `FILE`, `MAP`, `MODULE`, `WINDOW`, `REPORT`, etc. | `TokenType.Structure` |

---

## Parent / Children Relationships

`DocumentStructure` builds a scope tree by setting `token.parent` and `token.children`.

### What gets parented to what

```
GlobalProcedure
  ├── Structure (GROUP/QUEUE/RECORD in data section → children of procedure)
  │     └── Label (field declarations → children of structure)
  ├── Structure (CLASS in data section)
  │     └── MethodDeclaration tokens (children of CLASS)
  └── Routine
        └── (local data, nested structures)

MethodImplementation
  └── Structure (local structures in method body)

MAP
  └── MODULE
        └── MapProcedure declarations

INTERFACE
  └── InterfaceMethod declarations
```

### Traversal patterns

```typescript
// Get all method declarations for a class token
const methods = classToken.children?.filter(
    c => c.subType === TokenType.MethodDeclaration
) ?? [];

// Walk up to find the containing procedure
function getContainingProcedure(token: Token): Token | undefined {
    let t: Token | undefined = token.parent;
    while (t) {
        if (t.subType === TokenType.GlobalProcedure ||
            t.subType === TokenType.MethodImplementation) return t;
        t = t.parent;
    }
    return undefined;
}

// Check if a token is in the data section (before CODE)
function isInDataSection(token: Token, proc: Token): boolean {
    const codeMarker = proc.executionMarker;
    if (!codeMarker) return true; // no CODE = all data
    return token.line < codeMarker.line;
}

// Check if a token is in the execution section (after CODE)
function isInCodeSection(token: Token, proc: Token): boolean {
    const codeMarker = proc.executionMarker;
    if (!codeMarker) return false;
    return token.line > codeMarker.line;
}
```

---

## `DocumentStructure` — Index API

Always obtain `DocumentStructure` via `TokenCache.getInstance().getStructure(document)` — never `new DocumentStructure(tokens)` in providers.

```typescript
const structure = TokenCache.getInstance().getStructure(document);

// O(1): Get tokens on a specific line
const lineTokens: Token[] | undefined = structure.getTokensByLine(lineNumber);

// O(1): Get the immediate parent token
const parent: Token | undefined = structure.getParent(token);

// O(1): Walk up to nearest scope-defining ancestor (procedure/routine/MODULE)
const scope: Token | undefined = structure.getParentScope(token);
```

### Private indexes (accessible from within DocumentStructure methods)

| Index | Type | Key | Use |
|---|---|---|---|
| `labelIndex` | `Map<string, Token>` | `label.toUpperCase()` | Find any Label token by name in O(1) |
| `procedureIndex` | `Map<string, Token>` | procedure name uppercase | Find procedure by name |
| `tokensByLine` | `Map<number, Token[]>` | line number | All tokens on a line |
| `structuresByType` | `Map<string, Token[]>` | structure keyword uppercase | All CLASS tokens, all QUEUE tokens, etc. |
| `parentIndex` | `Map<Token, Token>` | token → parent token | O(1) parent lookup (backs `getParent()`) |

---

## `TokenCache` — Full API

```typescript
const cache = TokenCache.getInstance();

// Get tokens (triggers tokenization if stale; preferred for most providers)
cache.getTokens(document): Token[]

// Get DocumentStructure (cached; preferred over new DocumentStructure())
cache.getStructure(document): DocumentStructure

// Fast path: returns cached tokens without re-tokenizing (use for latency-sensitive features)
cache.getCachedTokens(document): Token[]

// Get tokens by URI string only (returns null if not cached)
cache.getTokensByUri(uri: string): Token[] | null

// All URIs currently in cache (use in ReferencesProvider to avoid disk reads)
cache.getAllCachedUris(): string[]

// Invalidate a document (call in tests teardown or after file writes)
cache.clearTokens(uri: string): void
cache.clearAllTokens(): void
```

---

## Common Lookup Patterns

### Find all procedures in a file

```typescript
const tokens = TokenCache.getInstance().getTokens(document);
const procedures = tokens.filter(t =>
    t.type === TokenType.Procedure &&
    (t.subType === TokenType.GlobalProcedure ||
     t.subType === TokenType.MethodImplementation)
);
```

### Find a specific class by name

```typescript
const classToken = tokens.find(t =>
    t.type === TokenType.Structure &&
    t.subType === TokenType.Class &&
    t.label?.toUpperCase() === 'MYCLASS'
);
```

### Find all method declarations for a class

```typescript
const methods = classToken?.children?.filter(
    c => c.subType === TokenType.MethodDeclaration
) ?? [];
```

### Find the class a MethodImplementation belongs to

For `MyClass.Init PROCEDURE`, the token value is `PROCEDURE` and `token.label` is `MyClass.Init`. Extract the class name:

```typescript
// token.label = "MyClass.Init"
const parts = token.label?.split('.') ?? [];
const className = parts[0]; // "MyClass"
const methodName = parts[parts.length - 1]; // "Init"
// For 3-part: "MyClass.IFace.Method" → className=parts[0], methodName=parts[parts.length-1]
```

### Find a variable declared in a procedure's data section

```typescript
function findLocalVar(tokens: Token[], proc: Token, varName: string): Token | undefined {
    const codeMarker = proc.executionMarker;
    return tokens.find(t =>
        t.type === TokenType.Label &&
        t.value.toUpperCase() === varName.toUpperCase() &&
        t.line > proc.line &&
        (codeMarker === undefined || t.line < codeMarker.line)
    );
}
```

### Find all structure fields of a QUEUE/GROUP

```typescript
// Via children (preferred — O(1) after DocumentStructure)
const fields = queueToken.children?.filter(c => c.isStructureField) ?? [];

// Via prefix
const fieldsWithPrefix = tokens.filter(t =>
    t.isStructureField && t.structureParent === queueToken
);
```

### Find which procedure contains a given line number

```typescript
function getProcedureAtLine(tokens: Token[], line: number): Token | undefined {
    return tokens.filter(t =>
        (t.subType === TokenType.GlobalProcedure ||
         t.subType === TokenType.MethodImplementation) &&
        t.line <= line &&
        (t.finishesAt === undefined || t.finishesAt >= line)
    ).sort((a, b) => b.line - a.line)[0]; // innermost (latest start)
}
```

### Check if a token is inside a ROUTINE (not the parent procedure)

```typescript
function getRoutineAtLine(tokens: Token[], line: number): Token | undefined {
    return tokens.filter(t =>
        t.type === TokenType.Routine &&
        t.line <= line &&
        (t.finishesAt === undefined || t.finishesAt >= line)
    ).sort((a, b) => b.line - a.line)[0];
}
```

### Resolve a file reference (MODULE/INCLUDE/MEMBER)

```typescript
// The token for INCLUDE('myfile.inc') or MODULE('myproc.clw') already has
// the resolved absolute path set by DocumentStructure:
const resolvedPath = directiveToken.referencedFile;
```

---

## Anti-Patterns — Don't Do These

### ❌ Reading file text to find class members

```typescript
// WRONG: reads disk, slow, misses cached edits
const text = fs.readFileSync(filePath, 'utf8');
const match = text.match(/MyClass\s+CLASS/);
```

```typescript
// CORRECT: use cached tokens
const tokens = TokenCache.getInstance().getTokensByUri(uri);
const classToken = tokens?.find(t =>
    t.type === TokenType.Structure &&
    t.label?.toUpperCase() === 'MYCLASS'
);
```

### ❌ Scanning all tokens linearly to find a procedure's end

```typescript
// WRONG: O(n) scan to find where procedure ends
let endLine = tokens.length;
for (let i = procIndex + 1; i < tokens.length; i++) {
    if (tokens[i].type === TokenType.Procedure) { endLine = tokens[i].line; break; }
}
```

```typescript
// CORRECT: finishesAt is already set
const endLine = procToken.finishesAt ?? lastTokenLine;
```

### ❌ Regex-splitting a label to get the class name from a MethodImplementation

```typescript
// WRONG: fragile, breaks on 3-part names
const className = token.value.split('.')[0];
```

```typescript
// CORRECT: token.label holds "MyClass.Init" (or "MyClass.IFace.Method")
const parts = token.label?.split('.') ?? [];
const className = parts[0];
```

### ❌ Looking for the CODE line by scanning for "CODE" text

```typescript
// WRONG
const codeLine = lines.findIndex(l => l.trim() === 'CODE');
```

```typescript
// CORRECT: executionMarker is the CODE token reference
const codeLine = procToken.executionMarker?.line;
```

### ❌ Scanning lines to find structure fields

```typescript
// WRONG: re-parses text to find fields
const fields = [];
for (const line of lines) {
    if (/^\w+\s+(STRING|LONG|SHORT)/.test(line)) fields.push(line);
}
```

```typescript
// CORRECT: already indexed as children
const fields = structureToken.children?.filter(c => c.isStructureField) ?? [];
```

### ❌ Using `indexOf` on the token array to find a token's position

```typescript
// WRONG: O(n) search
const idx = tokens.indexOf(targetToken);
const prevToken = tokens[idx - 1];
```

```typescript
// CORRECT: use tokensByLine
const lineTokens = structure.getTokensByLine(targetToken.line) ?? [];
const idx = lineTokens.indexOf(targetToken);
const prevToken = lineTokens[idx - 1];
```

---

## Structure Prefix (`PRE`) Resolution

When a QUEUE/GROUP/FILE has `PRE(INV)`, the tokenizer sets:
- `structureToken.structurePrefix = "INV"`
- Every field token inside inherits `fieldToken.structurePrefix = "INV"`

So `INV:Customer` prefix-notation references can be matched against `fieldToken.structurePrefix + ':' + fieldToken.value`.

```typescript
// Find the structure that owns prefix "INV"
const owner = tokens.find(t =>
    t.type === TokenType.Structure &&
    t.structurePrefix?.toUpperCase() === 'INV'
);

// Find a specific field by prefix:name
const field = tokens.find(t =>
    t.isStructureField &&
    t.structurePrefix?.toUpperCase() === 'INV' &&
    t.value.toUpperCase() === 'CUSTOMER'
);
```

---

## INCLUDE / Cross-File Tokens

When tokens are loaded from INCLUDE files (via `SolutionManager` / `CrossFileResolver`), they carry:
- `token.sourceFile` — the URI of the `.inc` file they came from
- `token.sourceContext.includeFile` — the `.inc` path
- `token.sourceContext.parentFile` — the `.clw` that has the `INCLUDE` statement

INCLUDE/MODULE/MEMBER directive tokens have:
- `token.referencedFile` — the resolved absolute path of the referenced file

---

## Key Invariants

1. `token.label` on a **Structure token** is the label *before* the structure keyword (e.g. `"MyQueue"` for `MyQueue QUEUE`). `token.value` is always the keyword (`"QUEUE"`).
2. `token.label` on a **Procedure token** is the full dotted name (`"MyClass.Init"`). `token.value` is `"PROCEDURE"`.
3. `token.label` on a **Label token** equals `token.value`.
4. `token.finishesAt` is the line of the `END` (or `.`) that closes the structure — inclusive.
5. `token.executionMarker` is only set on tokens with `subType === GlobalProcedure | MethodImplementation | Routine`.
6. `token.children` is only populated by `DocumentStructure` — it is `undefined` (not `[]`) if empty.
7. All line/column numbers are **0-based** in the token system. LSP uses 0-based too, so no conversion needed.
8. `DocumentStructure.process()` mutates tokens **in-place** — the same token objects in `TokenCache` are updated.
