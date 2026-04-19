# Clarion Extension - Copilot Development Instructions

This document provides comprehensive guidance for AI assistants working on the Clarion Extension codebase.

## 1. BUILD, TEST, AND LINT COMMANDS

### Build Commands
- **Development build**: \
pm run compile:dev\ or \
pm run compile\
  - Compiles TypeScript with \	sc -b\ and copies data files
  - Outputs to \./out\ directory
  - Includes source maps for debugging

- **Release build**: \
pm run compile:release\
  - Same as dev but intended for marketplace releases
  
- **Watch mode**: \
pm run watch\
  - Continuous compilation with \	sc -b -w\
  - Useful during development

- **Package for marketplace**: \
pm run package\ or \
pm run package:release\
  - Runs compile and uses vsce to create .vsix file

### Test Commands
- **Run all tests**: \
pm run test:all\
  - Compiles then runs both server and client tests
  
- **Run server tests only**: \
pm test\ or \
pm run test:server\
  - Uses Mocha with TDD UI
  - Config: \.mocharc.json\
  - Timeout: 30 seconds
  - Glob: \out/server/src/test/**/*.test.js\
  - Can run via Mocha Test Explorer in VS Code
  
- **Run client tests only**: \
pm run test:client\
  - Uses Mocha with \.mocharc-client.json\
  - **Requires VS Code Extension Host** to run
  - Some tests excluded (see .mocharc-client.json)
  
### Running Single Tests
To run a single test file during development:
\\\ash
# Compile first
npm run compile:dev

# Run specific server test file with Mocha directly
npx mocha out/server/src/test/ClarionTokenizer.test.js --timeout 30000

# Run specific client test (requires Extension Host)
npm run test:client -- --grep "test name pattern"
\\\

### Linting
- ESLint is configured but no explicit \
pm run lint\ command
- Config: eslint v9.21.0 with @typescript-eslint/parser v8.25.0
- To lint: \
px eslint src/**/*.ts\

### Key NPM Dependencies
- **typescript**: ^4.2.4 (target: ES2019, module: commonjs)
- **mocha**: ^11.0.0 (test framework)
- **vscode-languageserver**: ^7.0.0 (server)
- **vscode-languageclient**: ^7.0.0 (client)
- **xml2js**: ^0.6.2 (parse .sln/.csproj files)

### TypeScript Configuration
- **Base config** (\	sconfig.base.json\):
  - Target: ES2019
  - Module: commonjs
  - Strict mode enabled
  - Source maps enabled
  
- **Monorepo structure**: Uses references in root \	sconfig.json\:
  - \./client\ (tsconfig.json)
  - \./server\ (tsconfig.json)
  
- **Compilation output**: All TypeScript → \./out\ directory
  - Client code: \out/client/src/**/*.js\
  - Server code: \out/server/src/**/*.js\
  - Common code: \out/common/**/*.js\

---

## 2. ARCHITECTURE OVERVIEW

### Project Purpose
**Clarion Extension** is a professional Language Server Protocol (LSP) extension for Visual Studio Code that provides intelligent language support for the **Clarion programming language** (.clw, .inc, .equ, .int files and template files .tpl, .tpw).

Key features:
- Full syntax highlighting and semantic tokens
- IntelliSense with 148+ built-in functions
- Code navigation (F12 goto definition, Ctrl+F12 implementation)
- Signature help with parameter hints
- Code folding for structures/procedures
- Real-time diagnostics
- Solution/project management with build integration
- 50+ code snippets

### Client/Server Architecture

`
┌─ VS Code Extension (Client)              ┌─ Node.js Language Server
│                                          │
│  client/src/extension.ts (entry point)   │  server/src/server.ts (entry point)
│  ├─ Activation & initialization          │  ├─ LSP connection setup
│  ├─ Solution management (open/close)     │  ├─ Document management
│  ├─ UI views & commands                  │  ├─ Providers:
│  ├─ Language features (hover, goto def)  │  │  ├─ DefinitionProvider
│  ├─ File watchers                        │  │  ├─ HoverProvider
│  ├─ Build integration                    │  │  ├─ ImplementationProvider
│  └─ Tree views (solutions, outline)      │  │  ├─ SignatureHelpProvider
│                                          │  │  ├─ DiagnosticProvider
│     Communication:                       │  │  ├─ ClarionDocumentSymbolProvider
│     - LSP protocol over stdio            │  │  ├─ ClarionSemanticTokensProvider
│     - vscode-languageclient              │  │  ├─ ClarionFoldingProvider
│     - Custom request/notification        │  │  └─ ClassConstantsCodeActionProvider
│       handlers                           │  │
│                                          │  └─ Core services:
│                                          │     ├─ ClarionTokenizer
│                                          │     ├─ DocumentStructure
│                                          │     ├─ SolutionManager
│                                          │     └─ TokenCache
└──────────────────────────────────────────┘─┘─────────────────────────────────────┘
`

### Directory Structure

#### Client: \client/src/\
- **extension.ts** - Extension activation, coordination of all features
- **commands/** - Command implementations:
  - NavigationCommands.ts - F12, Ctrl+F12, Quick Open
  - BuildCommands.ts - Build/Run/Generate actions
  - SolutionCommands.ts - Open/close solutions
  - TreeCommands.ts - Solution tree interactions
  - TextEditingCommands.ts - Snippets, string pasting, wizards
  - ClassCreationCommands.ts - Class wizard
  - ImplementationCommands.ts - Add method implementations
  - ClassConstantCommands.ts - Class constant helpers
  - IncludeStatementCommands.ts - Include file operations
  
- **providers/** - Language feature implementations:
  - LocationProvider.ts - Definition/Implementation locations
  - LanguageFeatureManager.ts - Register all language providers with VS Code
  - DocumentLinkProvider.ts - Clickable file references
  - HoverProvider.ts - Hover tooltips (delegates to server)
  - ImplementationProvider.ts - Goto implementation (delegates to server)
  
- **views/** - UI components:
  - ViewManager.ts - Creates tree views
  - SolutionTreeDataProvider.ts - Solution/project tree
  - StructureViewProvider.ts - Document outline/symbol tree
  - StatusViewProvider.ts - Status bar information
  
- **solution/** - Solution file handling:
  - SolutionOpener.ts - Open .sln files
  - SolutionInitializer.ts - Initialize solution metadata
  - SolutionParser.ts - Parse .sln file format
  
- **activation/** - Startup phase management:
  - ActivationManager.ts - Phased initialization logic
  
- **config/** - Configuration management:
  - ConfigurationManager.ts - Handle build configurations
  
- **utils/** - Helper utilities:
  - SolutionScanner.ts - Find solutions in workspace
  - ClarionInstallationDetector.ts - Detect Clarion IDE installation
  - ProjectDependencyResolver.ts - Resolve project dependencies
  - GlobalSolutionHistory.ts - Recent solutions history
  - SettingsStorageManager.ts - User preferences
  - LoggerManager.ts - Logging infrastructure

#### Server: \server/src/\
- **server.ts** - LSP connection, capability registration, handler setup
- **ClarionTokenizer.ts** - **Core tokenizer** - converts Clarion source to tokens
- **DocumentStructure.ts** - Build parent/child relationships, scope hierarchy
- **TokenCache.ts** - In-memory cache of tokenized documents (singleton)

> ⚠️ **Before writing any provider or utility code:** invoke the **`clarion-tokens` skill** (or read `docs/tokenizer-reference.md`). It documents the full `Token` interface, `TokenType` enum, `DocumentStructure` indexes, `TokenCache` API, common lookup patterns, and anti-patterns. Most symbol search, navigation, and structure inspection needs are already solved by the token tree — avoid re-parsing source text.

> 📖 **When you need Clarion language reference** (attribute syntax, built-in functions, PROP: properties, runtime behaviour): invoke the **`clarion-docs` skill** (provides access to the full Clarion 11.1 help documentation, ~2000 topics). Use `clarion_search_docs` to find topics and `clarion_read_doc` to read them. This is the authoritative source — prefer it over guessing.
- **serverSettings.ts** - Server configuration (paths, macros, version info)
- **serverState.ts** - Server-wide state management

- **tokenizer/** - Tokenization pipeline:
  - TokenTypes.ts - Token interface & TokenType enum
  - TokenPatterns.ts - Regex patterns for tokenization
  - PatternMatcher.ts - Compile and cache patterns
  - StructureProcessor.ts - Handle nested structures, prefixes
  
- **providers/** - LSP provider implementations:
  - **DefinitionProvider.ts** - Goto definition (F12)
  - **ImplementationProvider.ts** - Goto implementation (Ctrl+F12)
  - **HoverProvider.ts** - Hover tooltips
  - **SignatureHelpProvider.ts** - Parameter hints
  - **DiagnosticProvider.ts** - Error/warning detection
  - **ClarionDocumentSymbolProvider.ts** - Document outline
  - **ClarionSemanticTokensProvider.ts** - Semantic coloring
  - **ClarionFoldingProvider.ts** - Code folding ranges
  - **ClassConstantsCodeActionProvider.ts** - Quick fixes for constants
  - **UnreachableCodeProvider.ts** - Detect unreachable code
  
  - **hover/** - Hover-specific resolvers:
    - HoverRouter.ts - Route hover request to appropriate resolver
    - VariableHoverResolver.ts - Show variable type/scope info
    - MethodHoverResolver.ts - Show method signatures
    - ProcedureHoverResolver.ts - Show procedure info
    - RoutineHoverResolver.ts - Show routine definitions
    - SymbolHoverResolver.ts - Show symbol info (keywords, etc.)
    - StructureFieldResolver.ts - Show structure field info
    - CrossFileCache.ts - Cache cross-file hover data (performance)
    - HoverFormatter.ts - Format hover text with markdown
    - HoverContextBuilder.ts - Build context for hover

- **utils/** - Core analysis utilities:
  - **ClarionTokenizer.ts** (also in root) - Main tokenizer
  - **TokenHelper.ts** - Token manipulation utilities
  - **ScopeAnalyzer.ts** - Determine scope (global/module/procedure/routine)
  - **ClassMemberResolver.ts** - Resolve class members and methods
  - **MethodOverloadResolver.ts** - Handle method overloads
  - **ProcedureUtils.ts** - Procedure-specific analysis
  - **CrossFileResolver.ts** - Resolve symbols across files
  - **MapProcedureResolver.ts** - Handle MAP declarations
  - **FileDefinitionResolver.ts** - Resolve file references
  - **ClassDefinitionIndexer.ts** - Index all class definitions
  - **ClassConstantParser.ts** - Parse class constants
  - **ProjectConstantsChecker.ts** - Check project-level constants
  - **BuiltinFunctionService.ts** - 148+ Clarion built-in functions metadata
  - **AttributeService.ts** - Clarion attribute keywords
  - **ControlService.ts** - Control/window element definitions
  - **DataTypeService.ts** - Data type definitions
  - **ClarionPatterns.ts** - Regex patterns for Clarion syntax
  - **OmitCompileDetector.ts** - Track \/\ directives
  - **IncludeVerifier.ts** - Validate INCLUDE statements

- **services/** - High-level services:
  - **SymbolFinderService.ts** - Find symbols by name/pattern
  
- **solution/** - Solution/project management:
  - **solutionManager.ts** - Load and cache solution metadata (singleton)
  - **clarionSolutionServer.ts** - Solution data structure
  - **clarionProjectServer.ts** - Project data structure
  - **clarionSourceFileServer.ts** - Source file data structure
  - **redirectionFileParserServer.ts** - Parse Clarion redirection files
  - **buildClarionSolution.ts** - Build solution XML parsing

#### Common: \common/\
- **types.ts** - Shared interfaces:
  - ClarionSolutionInfo - Solution metadata
  - ClarionProjectInfo - Project metadata
  - ClarionSourceFileInfo - Source file info
  - ClarionAppInfo - Application/executable info
  - ClarionSolutionTreeNode - Tree structure
  
- **clarionUtils.ts** - Shared utility functions
- **LoggingConfig.ts** - Logging configuration

#### Test Files
- **server/src/test/*.test.ts** - Server tests (Node.js environment)
  - 439 passing, 33 failing (pre-existing as of 2026-01-05)
  - Test tokenizer, providers, utilities
  
- **client/src/test/*.test.ts** - Client tests (requires VS Code Extension Host)
  - Test extension integration, language features
  - Some tests excluded in .mocharc-client.json (UI-dependent tests)

### Communication Flow: Client ↔ Server

**LSP Protocol via stdio:**
1. Client sends request/notification to server
2. Server processes and sends response/notification back
3. All text documents synchronized incrementally

**Key LSP Handlers:**
- \initialize\ - Advertise server capabilities
- \onDidOpenTextDocument\ - File opened
- \onDidChangeTextDocument\ - File edited
- \onDidCloseTextDocument\ - File closed
- \onDefinition\ - Handle F12 (goto definition)
- \onImplementation\ - Handle Ctrl+F12 (goto implementation)
- \onHover\ - Show hover tooltip
- \onSignatureHelp\ - Show parameter hints
- \onCompletion\ - Autocomplete (PROP:/PROPPRINT: completions via CompletionProvider)
- \publishDiagnostics\ - Send errors/warnings to client

**Custom Requests (if any):**
- Check server.ts for custom request handlers
- Define custom request types in appropriate service classes

---

## 3. KEY CONVENTIONS

### TypeScript Patterns

#### Classes and Interfaces
\\\	ypescript
// Export both class and related interfaces
export interface MyData {
  name: string;
  value: number;
}

export class MyClass {
  private cache: Map<string, MyData> = new Map();
  private static instance: MyClass | null = null;

  // Static singleton pattern
  public static getInstance(): MyClass {
    if (!MyClass.instance) {
      MyClass.instance = new MyClass();
    }
    return MyClass.instance;
  }

  constructor() { }

  // Methods grouped logically, public before private
  public publicMethod(): void { }
  
  private privateHelper(): void { }
}
\\\

#### Logging Pattern
\\\	ypescript
import LoggerManager from '../logger';  // server
// OR
import LoggerManager from '../utils/LoggerManager';  // client

const logger = LoggerManager.getLogger("ModuleName");
logger.setLevel("error");  // Production: only log errors

// Available log levels:
logger.debug("message");   // Low-level debug info
logger.info("message");    // General info
logger.warn("message");    // Warnings
logger.error("message");   // Errors only
logger.perf("message", { metric1: value1, metric2: value2 });  // Performance metrics

// Use emoji prefixes in production logging for easy scanning:
logger.info("✅ Success message");
logger.info("❌ Error message");
logger.info("🔍 Debug info");
logger.info("📊 Metrics: ...");
logger.info("⚠️ Warning");
\\\

#### Error Handling
\\\	ypescript
try {
  // Do work
} catch (error) {
  logger.error(\❌ Error message: \\);
  // Return sensible default or rethrow
  return null;
}
\\\

#### Async/Promise Patterns
\\\	ypescript
// Always use try/catch with async/await
public async someMethod(): Promise<Result> {
  try {
    const result = await this.asyncOperation();
    return result;
  } catch (error) {
    logger.error(\Error: \\);
    throw error; // or return default
  }
}

// For async initialization
public static async create(param: string): Promise<MyClass> {
  const instance = new MyClass();
  await instance.initialize(param);
  return instance;
}
\\\

### Language Feature Implementation Patterns

#### Adding a New Provider (e.g., goto definition)
1. **Server side** (\server/src/providers/\):
   - Create DefinitionProvider class
   - Implement \provideDefinition(document, position): Definition | null\
   - Use TokenCache to get tokenized document
   - Use helper classes (TokenHelper, ScopeAnalyzer, etc.)
   - Return Location or null
   
2. **Server registration** (\server/src/server.ts\):
   - Instantiate provider in initialization
   - Register with \connection.onDefinition(provider.provideDefinition)\
   - Add capability to \InitializeResult.capabilities\
   
3. **Client side** (\client/src/providers/LanguageFeatureManager.ts\):
   - Register provider with VS Code: \languages.registerDefinitionProvider()\

#### Code Folding Pattern
- \ClarionFoldingProvider.computeFoldingRanges()\ returns array of \FoldingRange\
- Handles procedures, structures (QUEUE, GROUP, RECORD), methods, routines, classes
- Supports \/\ comments
- Uses token.finishesAt to determine fold end
- Infers missing fold boundaries when needed

#### Semantic Tokens Pattern
- \ClarionSemanticTokensProvider\ maps token types to semantic token types
- Used for context-aware coloring (e.g., END keywords colored based on what they close)
- Overrides TextMate grammar highlighting
- Encoded as \SemanticTokensBuilder\ (position deltas)

#### Hover Resolution Pattern
- \HoverProvider\ routes to specific resolvers based on context
- \HoverRouter\ determines which resolver to use
- Each resolver handles specific cases:
  - \VariableHoverResolver\ - local/global variables
  - \MethodHoverResolver\ - class methods
  - \RoutineHoverResolver\ - ROUTINE definitions
  - etc.
- Result: \Hover\ object with markdown content

### Configuration and Settings Patterns

#### Server Settings
\\\	ypescript
// server/src/serverSettings.ts
export const serverSettings = {
  redirectionPaths: [] as string[],      // From redirection files
  projectPaths: [] as string[],          // From .sln file
  configuration: "Default",               // Build configuration
  clarionVersion: "0.0",                  // Clarion IDE version
  solutionFilePath: "",                   // Current solution
  macros: {} as Record<string, string>,   // Preprocessor macros
  libsrcPaths: [] as string[],            // Library source paths
  defaultLookupExtensions: [".clw", ".inc", ".equ", ".eq", ".int"],
  
  // Computed getters
  get primaryRedirectionPath(): string { return this.redirectionPaths[0] ?? ""; }
  get primaryProjectPath(): string { return this.projectPaths[0] ?? ""; }
};
\\\

#### Client Settings (VS Code)
- Settings in \package.json\ under \contributes.configuration\
- Access via \workspace.getConfiguration("clarion")\
- Example: Build executable path, debug settings, etc.

### Clarion-Specific Patterns

#### Token Types
\\\	ypescript
enum TokenType {
  // Core types
  Keyword,      // IF, LOOP, PROCEDURE, etc.
  Directive,    // \, \, etc.
  String,       // 'text'
  Comment,      // ! comment
  Variable,     // Variable name
  Function,     // Function call
  Structure,    // QUEUE, GROUP, RECORD, CLASS, WINDOW, etc.
  Operator,     // +, -, *, /, =, etc.
  
  // Subtypes (use subType field)
  Procedure,            // PROCEDURE keyword
  GlobalProcedure,      // PROCEDURE with CODE at global level
  MethodDeclaration,    // PROCEDURE inside CLASS (no CODE)
  MethodImplementation, // This.Method PROCEDURE (with CODE)
  MapProcedure,         // PROCEDURE inside MAP
  InterfaceMethod,      // PROCEDURE inside INTERFACE
  Routine,              // ROUTINE keyword
  Class,                // CLASS keyword
  EndStatement,         // END keyword (type varies by context)
}
\\\

#### Scope Analysis
\\\	ypescript
// Clarion has four scope levels
type ScopeLevel = 'global' | 'module' | 'procedure' | 'routine';

// ScopeAnalyzer determines:
// 1. Is symbol declared globally (outside procedures)?
// 2. Is it module-local (MODULE declaration)?
// 3. Is it procedure-local (inside PROCEDURE)?
// 4. Is it routine-local (inside ROUTINE)?

// Usage:
const scope = scopeAnalyzer.getTokenScope(document, position);
if (scope.type === 'procedure') {
  // In a procedure scope
  const procToken = scope.containingProcedure;
}
\\\

#### Parsing Solution Files (.sln)
- XML format (parsed with xml2js)
- Structure: Solution → Projects → Source Files
- Each project can reference other projects (dependencies)
- Applications declared in projects
- Handled by SolutionManager

#### Parsing Project Files (.cwproj)
- XML format
- Contains source file lists, configurations, build settings
- Parsed by CwprojParser

#### File Resolution
- INCLUDE statements: Find .inc/.clw files in project paths
- Redirection files: Map source paths
- Cross-file navigation requires solution context

### Performance Patterns

#### Caching
\\\	ypescript
// TokenCache - singleton, caches tokenized documents
private tokenCache = TokenCache.getInstance();
const tokens = this.tokenCache.getTokens(document);

// Document-level caching with change tracking
// (AUTOUPDATED when document changes)

// Service-level caching for expensive operations
private cache: Map<string, Result> = new Map();
const cached = this.cache.get(key);
if (cached) return cached;
\\\

#### Performance Metrics Logging
\\\	ypescript
const perfStart = performance.now();
// ... do work ...
const perfTime = performance.now() - perfStart;
logger.perf('Operation name', { 
  time_ms: perfTime.toFixed(2),
  items_processed: count,
  items_per_ms: (count / perfTime).toFixed(1)
});
\\\

#### Optimization Patterns
- Pre-compile regex patterns (PatternMatcher.initializePatterns)
- Filter collections before processing
- Use Set for membership testing instead of Array.includes()
- Cache parent/child relationships during tokenization
- Lazy initialization for expensive services

### Testing Patterns

#### TDD Workflow (Required)
**Always write a failing test before writing or changing any code.** Verify the test fails for the right reason, then implement, then confirm it passes.

1. Write a test that exercises the expected behaviour
2. Run it — confirm it fails (not just errors)
3. Implement the minimum code to make it pass
4. Re-run — confirm it passes
5. Refactor if needed, keeping tests green

#### Disposable Exploratory Tests (Preferred over static analysis)
**Before analysing code by reading files, run a disposable Node.js snippet to observe actual runtime behaviour.** This is faster and avoids wrong assumptions.

Use `node -e "..."` against the compiled output in `./out/`:
\\\ash
# Quick tokenizer probe — no test file needed
node -e "
const { ClarionTokenizer } = require('./out/server/src/ClarionTokenizer');
const { TokenType } = require('./out/server/src/tokenizer/TokenTypes');

const t = new ClarionTokenizer('Behavior  &StandardBehavior,PRIVATE');
t.tokenize().forEach(tok =>
  console.log(tok.type, tok.subType, JSON.stringify(tok.value), 'col', tok.start)
);
"
\\\

Use these probes to answer questions like:
- "What tokens does this line produce?"
- "What value/type does this token have at runtime?"
- "Does this regex match this input?"
- "Which code path runs for input X?"

Only fall back to reading source files when the probe output alone isn't enough to understand context (e.g., to trace where a value is consumed downstream).

#### Server Tests (Mocha TDD)
\\\	ypescript
import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

suite('Feature Name', () => {
  test('should do something', () => {
    const input = 'MyProc PROCEDURE()\\nCODE\\nEND';
    const tokenizer = new ClarionTokenizer(input);
    const tokens = tokenizer.tokenize();
    
    assert.ok(tokens.length > 0, 'Should have tokens');
    const procToken = tokens.find(t => t.subType === TokenType.Procedure);
    assert.ok(procToken, 'Should find PROCEDURE token');
  });
});
\\\

Run a single test file during development:
\\\ash
npm run compile:dev && npx mocha out/server/src/test/MyFeature.test.js --timeout 30000
\\\

#### Client Tests
- Require VS Code Extension Host
- Test VS Code API integration
- Cannot run in normal test runner

### File Organization
- One class per file
- File name matches class name (PascalCase)
- Interfaces defined in same file or separate .d.ts if shared
- Index files for barrel exports when needed
- Test files in \	est/\ subdirectories with \.test.ts\ suffix

### Import Organization
\\\	ypescript
// 1. Node built-ins
import * as fs from 'fs';
import * as path from 'path';

// 2. External packages
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';

// 3. Internal modules (non-relative)
import { TokenCache } from '../TokenCache';

// 4. Relative imports (same package)
import { ScopeAnalyzer } from './ScopeAnalyzer';

// 5. Logger (always last)
import LoggerManager from '../logger';
\\\

### Documentation
- **JSDoc comments** for public APIs:
\\\	ypescript
/**
 * Brief description
 * @param document The text document
 * @param position The position in the document
 * @returns The result or null if not found
 */
public myMethod(document: TextDocument, position: Position): Result | null {
  ...
}
\\\

- **Inline comments** for non-obvious logic:
\\\	ypescript
// 🚀 PERF: Filter collections once before processing
// ✅ This optimization reduces time complexity from O(n²) to O(n)
\\\

- **TODO comments** for future work:
\\\	ypescript
// TODO: Add support for nested templates (issue #123)
\\\

---

## 4. EXISTING AI CONFIGURATIONS

**No existing AI configuration files found** (as of analysis date).

The following would typically be checked:
- .cursorrules
- CLAUDE.md
- .cursor/rules/
- AGENTS.md
- .windsurfrules
- CONVENTIONS.md
- AIDER_CONVENTIONS.md
- .clinerules
- .cline_rules
- .github/copilot-instructions.md

**Recommendation**: This copilot-instructions.md file becomes the primary AI guidance document.

---

## 5. README AND DOCUMENTATION SUMMARY

### Main README.md
**Quick Start:**
- Installation: VS Code extension marketplace, search "Clarion Extensions"
- No workspace file needed, just open a folder containing .sln file
- Extension auto-detects solutions

**Key Features:**
1. **Syntax Highlighting** - .clw, .inc, .equ, .int, .tpl, .tpw files
2. **IntelliSense** - 148+ built-in functions with parameter hints
3. **Code Navigation** - F12 (definition), Ctrl+F12 (implementation), hover
4. **Code Folding** - Structures, procedures, routines, regions
5. **Diagnostics** - Unterminated structures, missing RETURNs, FILE validation
6. **Solution Management** - Auto-detect .sln, dependency-aware build order
7. **Build Integration** - Right-click build from Solution View
8. **Code Snippets** - 50+ templates for common patterns
9. **Productivity Tools** - Paste as string, method wizards, class creation

**Latest Version:** v0.8.8 (development)

**Recent Highlights:**
- v0.8.6: 50-70% faster Ctrl+F12 with CrossFileCache, namespace prefix support, dependency-aware builds
- v0.8.5: Fixed code folding for window definitions
- v0.8.4: Template language support (.tpl, .tpw), 50-60% faster tokenization, scope-aware navigation

### Documentation Structure (\docs/\ folder)
- **guides/** - User guides:
  - quick-start.md - 5-minute setup
  - common-tasks.md - Everyday workflows
  - installation.md - Detailed setup

- **features/** - Feature documentation:
  - code-editing.md - Syntax highlighting, snippets, folding
  - signature-help.md - Parameter hints
  - navigation.md - F12, Ctrl+F12, hover
  - solution-management.md - Solutions, projects, build
  - diagnostics.md - Error detection

- **reference/** - Reference documentation:
  - commands.md - All extension commands
  - settings.md - Configuration options
  - snippets.md - Code snippet reference
  - CLARION_LANGUAGE_REFERENCE.md - Language syntax

- **Developer Docs** (\dev/\ subfolder):
  - Bug fix analyses and refactoring plans
  - Test session summaries
  - Publishing guide and testing procedures
  - Known issues and TODO tracking

### ClarionDocs
- Additional Clarion language documentation and examples

### Key Files
- **CHANGELOG.md** - Complete version history
- **TESTING_INFRASTRUCTURE.md** - How to run tests
- **TESTING_CHECKLIST.md** - Manual testing procedures
- **DOCS_AUDIT.md** - Documentation quality review

### Build-Related Documentation
- **MANUAL_TEST_GUIDE.md** - How to manually test features
- **ClarionDocs/** - Language reference
- **ExampleCode/** - Sample Clarion programs for testing

---

## 6. QUICK REFERENCE CHECKLIST

### Before Making Changes
- [ ] Read the relevant documentation in docs/
- [ ] Understand which component(s) need changes (client/server)
- [ ] Check existing tests to understand expected behavior
- [ ] Review similar implementations for consistency

### Development Workflow
- [ ] Create feature branch from main
- [ ] \
pm install\ (if new dependencies)
- [ ] \
pm run compile:dev\ to build
- [ ] Make changes
- [ ] \
pm run test:server\ to run server tests
- [ ] If client changes: \
pm run test:client\ (requires VS Code)
- [ ] Test manually in VS Code: \
pm run watch\ in one terminal, launch debugger
- [ ] Commit with clear messages
- [ ] Create PR with link to issue

### Common Tasks

**Adding a new LSP provider:**
1. Create \server/src/providers/MyProvider.ts\
2. Implement interface (onMyFeature, provideMyFeature, etc.)
3. Register in \server/src/server.ts\ (onInitialize, connection.onMyFeature)
4. Add capability to InitializeResult
5. Optional: Register client-side wrapper in \client/src/providers/LanguageFeatureManager.ts\
6. Add tests in \server/src/test/MyProvider.test.ts\

**Adding a new command:**
1. Create handler function in \client/src/commands/MyCommands.ts\
2. Register in extension.ts: \commands.registerCommand('clarion.myCommand', handler)\
3. Add to package.json commands (contributes.commands section)
4. Add keybinding if needed (contributes.keybindings)
5. Add tests if needed

**Adding a new configuration setting:**
1. Define in package.json \contributes.configuration.properties\
2. Read in client: \workspace.getConfiguration('clarion').get('setting')\
3. Set default behavior if needed
4. Document in docs/reference/settings.md

**Debugging:**
- Server: Add debugger in VS Code, set breakpoint, run \
pm run watch\
- Client: Use VS Code debug console
- View logs: Debug console or Output panel
- Enable detailed logging: Set logger.setLevel("debug") temporarily

---

## 7. CRITICAL CONTEXT FOR AI MODIFICATIONS

### What NOT to Change Without Deep Analysis
- **TokenType enum** - Adding types requires updating all token processors
- **ClarionTokenizer** - Core tokenization; changes affect everything
- **LSP server.ts** - Changes to initialization/capabilities cascade
- **Token interface** - Adding fields requires nullable/optional handling
- **Solution file parsing** - Changes affect project initialization

### High-Risk Areas
- **Cross-file resolution** - Complex scope and import resolution
- **Semantic tokens** - Requires understanding VS Code theme integration
- **Performance-critical paths** - Tokenization, caching, lookups
- **Integration between client and server** - Protocol mismatches break extension

### Safe Changes
- Adding new command handlers in client/src/commands/
- Adding new test cases
- Improving error messages and logging
- Refactoring utility functions with good test coverage
- Documentation updates

### When Adding New Features
1. Add tests first (TDD)
2. Implement in server (logic layer)
3. Implement in client (UI layer)
4. Update documentation
5. Add example/reference if user-facing
6. Test integration end-to-end

---

## 8. GITHUB ISSUE & RELEASE WORKFLOW

### Fixing a Reported Issue
1. Reproduce by reading the issue on GitHub
2. Search for related existing patterns (e.g. overload handling) before implementing fresh logic
3. Fix the code, add tests (TDD — write failing test first)
4. Update `CHANGELOG.md` — add a `[x.y.z]` entry at the top of **Recent Versions**
5. Commit with message referencing the issue: `fix: description\n\nFixes #NN`
6. Push to the active development branch (`version-x.y.z`)

### After Committing a Fix
1. **Post a comment on the issue** explaining what was fixed and which version will contain it
2. **Create a milestone** named `vX.Y.Z` if it doesn't exist: `gh api repos/msarson/Clarion-Extension/milestones --method POST -f title="vX.Y.Z"`
3. **Attach the issue to the milestone and close it**: `gh api repos/msarson/Clarion-Extension/issues/NN --method PATCH -F milestone=<number> -f state="closed"`

This pattern lets reporters see the issue is resolved (closed) and which version ships the fix (milestone), without any ambiguity about whether the fix is live yet.

### When Publishing a Release
- Close the milestone on GitHub to mark it as shipped
- The Marketplace publish is done via `npm run package` then uploading the `.vsix`

### Overload Resolution Pattern
Clarion supports procedure overloading (same name, different parameter signatures). Several providers handle this:
- **`ProcedureSignatureUtils`** (`server/src/utils/ProcedureSignatureUtils.ts`) — shared utility with `extractParameterTypes()` and `parametersMatch()`. Always use this when comparing signatures, never roll your own.
- **`MapProcedureResolver`**, **`CrossFileResolver`**, **`MethodOverloadResolver`** — all use `ProcedureSignatureUtils` for overload-aware navigation
- **`DiagnosticProvider.validateReturnStatements`** — uses signature matching to avoid false diagnostics on the wrong overload
- When adding any new feature that looks up procedures by name, check for overloads using `ProcedureSignatureUtils`

---

## END OF COPILOT INSTRUCTIONS

For questions about specific components, refer to:
- Architecture Overview (section 2) for module organization
- Key Conventions (section 3) for patterns to follow
- Source code comments for implementation details
- docs/ folder for user-facing feature documentation

Last Updated: 2026-04-19
Analysis Version: Clarion Extension v0.9.3
