# Clarion Extension – Copilot Instructions

VS Code Language Server Protocol (LSP) extension providing language support for the **Clarion programming language** (`.clw`, `.inc`, `.equ`, `.int`, `.tpl`, `.tpw`).

---

## Build, Test, and Lint

```bash
# Development build (outputs to ./out/)
npm run compile           # alias for compile:dev
npm run watch             # continuous rebuild

# Release / packaging
npm run compile:release
npm run package           # builds .vsix

# Tests
npm test                  # server tests only (default)
npm run test:server       # server tests – runs in Node.js, no VS Code needed
npm run test:client       # client tests – REQUIRES VS Code Extension Host
npm run test:all          # compile + both suites

# Run a single server test file
npm run compile:dev && npx mocha out/server/src/test/ClarionTokenizer.test.js --timeout 30000
```

> **Client tests cannot run in the Mocha Test Explorer** — they import `vscode` which is only available inside the Extension Host. Use `npm run test:client` or F5 → Run Tests.

Server tests: ~439 passing, ~33 pre-existing failures (as of v0.8.7).

TypeScript: ES2019 target, `commonjs` modules, strict mode. Monorepo with `tsconfig.json` references to `./client` and `./server`. ESLint v9.21 with `@typescript-eslint/parser`.

---

## Architecture

```
client/src/               VS Code extension side
  extension.ts            Entry point – phased activation
  activation/             Startup logic (ActivationManager)
  commands/               All VS Code command handlers
  providers/              Client-side language feature wrappers
  views/                  Tree views (solution tree, structure outline)
  solution/               .sln opener and parser
  utils/                  LoggerManager, scanners, helpers

server/src/               Language Server (Node.js process, LSP over stdio)
  server.ts               Entry point – capabilities, handler registration
  ClarionTokenizer.ts     Core tokenizer → Token[]
  DocumentStructure.ts    Builds parent/child scope hierarchy from tokens
  TokenCache.ts           Singleton – caches tokenized documents per URI
  serverSettings.ts       Mutable server config (paths, macros, version)
  tokenizer/              TokenTypes, TokenPatterns, PatternMatcher, StructureProcessor
  providers/              LSP handlers: Definition, Hover, Implementation,
                          SignatureHelp, Diagnostics, SemanticTokens, Folding, etc.
  providers/hover/        Hover subsystem: HoverRouter → specialized resolvers
  utils/                  ScopeAnalyzer, ClassMemberResolver, CrossFileResolver,
                          BuiltinFunctionService, ClarionPatterns, and more
  solution/               SolutionManager singleton, .sln/.cwproj XML parsers,
                          redirection file parser
  services/               SymbolFinderService

common/                   Shared between client and server
  types.ts                ClarionSolutionInfo, ClarionProjectInfo, etc.
  LoggingConfig.ts        Release vs. dev log level detection
  clarionUtils.ts         Shared utilities
```

**Data flow:** `ClarionTokenizer` → `Token[]` → `DocumentStructure` (scope/parent index) → `TokenCache` (cached per URI) → providers query the cache on every LSP request.

`SolutionManager` (singleton) holds parsed `.sln`/`.cwproj` data; providers use it for cross-file resolution.

Client and server communicate only via LSP protocol over stdio (`vscode-languageclient` ↔ `vscode-languageserver`). There are no direct shared-memory references.

---

## Key Conventions

### Logging

```typescript
// Server
import LoggerManager from '../logger';
// Client
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("ModuleName");
logger.setLevel("error"); // every module sets this explicitly for production

logger.debug / .info / .warn / .error(message);
logger.perf("Operation", { time_ms: elapsed.toFixed(2), items: count }); // perf metrics

// Emoji prefixes used throughout for easy console scanning:
// ✅ success  ❌ error  ⚠️ warning  🔍 debug  📊 metrics  🚀 performance
```

`LoggingConfig` auto-detects release mode (no `.ts` source files present) and defaults to `"error"` level; dev defaults to `"debug"`. Set `LoggingConfig.PERF_TEST_MODE = true` to capture perf logs.

### Singletons

```typescript
export class MyService {
    private static instance: MyService;
    private constructor() {}
    public static getInstance(): MyService {
        if (!MyService.instance) MyService.instance = new MyService();
        return MyService.instance;
    }
}
```

`TokenCache`, `SolutionManager`, and several services use this pattern.

### Token Types

`TokenType` enum (in `server/src/tokenizer/TokenTypes.ts`) is central — every provider pattern-matches on it. The `Token.subType` field further classifies:

- `Procedure` subtypes: `GlobalProcedure`, `MethodDeclaration`, `MethodImplementation`, `MapProcedure`, `InterfaceMethod`
- `Structure` covers `QUEUE`, `GROUP`, `RECORD`, `CLASS`, `WINDOW`, `VIEW`, etc.
- `token.finishesAt` holds the line number where the structure ends (used by folding)
- `token.parent` / `token.children` form the scope tree

### Performance Patterns

```typescript
// Always pre-compile patterns once
PatternMatcher.initializePatterns();

// Prefer Set over Array.includes() for hot-path membership tests
const keywordSet = new Set(["PROCEDURE", "ROUTINE", "END"]);
if (keywordSet.has(value)) { ... }

// Perf measurement in hot paths
const perfStart = performance.now();
// ...
logger.perf("Tokenize", { time_ms: (performance.now() - perfStart).toFixed(2) });
```

`DocumentStructure` builds O(1) indexes (`labelIndex`, `procedureIndex`, `tokensByLine`, `parentIndex`) at construction time.

### Tests (Mocha TDD)

```typescript
import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';

suite('Feature Name', () => {
    test('should do something', () => {
        const tokenizer = new ClarionTokenizer('MyProc PROCEDURE()\nCODE\nEND');
        const tokens = tokenizer.tokenize();
        assert.ok(tokens.length > 0);
    });
});
```

Use `assert` (Node built-in), not Chai. Server test files live in `server/src/test/`, compiled to `out/server/src/test/`.

### File Organisation

- One class per file; filename matches class name (PascalCase)
- Import order: Node built-ins → external packages → internal (`TokenCache`) → relative → logger (last)
- JSDoc on all public methods; inline `// ✅` or `// 🚀 PERF:` comments for non-obvious logic

### Adding a New LSP Provider

1. Create `server/src/providers/MyProvider.ts`; use `TokenCache.getInstance()` to get tokens
2. Register in `server/src/server.ts`: add capability in `onInitialize`, wire `connection.onMyFeature`
3. Optionally register client-side wrapper in `client/src/providers/LanguageFeatureManager.ts`
4. Add tests in `server/src/test/MyProvider.test.ts`

### Adding a New Command

1. Create handler in `client/src/commands/MyCommands.ts`
2. Export a `registerMyCommands(context)` function; call it from `extension.ts`
3. Declare in `package.json` → `contributes.commands` (and `contributes.keybindings` if needed)

---

## High-Risk Areas (Change Carefully)

| Area | Why |
|---|---|
| `TokenType` enum | Every provider and test pattern-matches on it; additions cascade everywhere |
| `ClarionTokenizer` | Core of the entire pipeline; bugs surface in all providers |
| `Token` interface | New fields need `optional` handling across all token consumers |
| `server.ts` `onInitialize` | Capability mismatches silently break client features |
| Cross-file resolution (`CrossFileResolver`, `ScopeAnalyzer`) | Complex interdependencies; perf-sensitive |

---

## Clarion Language Notes

- Clarion uses `!` for line comments
- Structure keywords: `PROCEDURE`, `ROUTINE`, `CLASS`, `QUEUE`, `GROUP`, `RECORD`, `WINDOW`, `VIEW`, `REPORT`
- Structures end with `END` (or `.` as shorthand in some contexts)
- `INCLUDE` / `MODULE` / `MEMBER` statements drive cross-file navigation
- Redirection files (`.red`) map logical paths to physical source directories; parsed by `RedirectionFileParserServer`
- Solution files (`.sln`) are XML; project files (`.cwproj`) are XML — both parsed with `xml2js`
- Default file extensions for lookup: `.clw`, `.inc`, `.equ`, `.eq`, `.int`
