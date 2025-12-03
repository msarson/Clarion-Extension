# Testing Guide

This extension includes automated unit tests that can be run without launching VS Code.

## Running Tests

```bash
npm test
```

This will:
1. Compile TypeScript (`tsc -b`)
2. Run all test files in `server/src/test/**/*.test.ts`

Tests run in **Node.js with Mocha** - no VS Code instance required.

## Test Structure

Tests are located in `server/src/test/` and use Mocha's TDD interface:

```typescript
import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

suite('ClarionTokenizer Tests', () => {
    test('Should tokenize a simple PROCEDURE', () => {
        const code = 'MyProc PROCEDURE()\nCODE\nEND';
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        
        assert.ok(tokens.length > 0);
    });
});
```

## What Can Be Tested

### ✅ Easily Testable (Unit tests, fast)
- **ClarionTokenizer** - Parse text into tokens
- **ClarionFoldingProvider** - Convert tokens to folding ranges
- **DocumentStructure** - Structure analysis
- **ClassMemberResolver** - Find class methods
- **TokenHelper** - Word range utilities
- **SolutionParser** - Parse .sln/.cwproj files
- **PathUtils** - Path manipulation

### ⚠️ Testable with Mocks (Integration tests)
- **DefinitionProvider** - Requires TextDocument (can mock with `vscode-languageserver-textdocument`)
- **HoverProvider** - Requires TextDocument
- **DocumentSymbolProvider** - Returns DocumentSymbol[]

### ❌ Requires VS Code (F5 testing)
- **Decorations** (ClarionDecorator, ClarionPrefixDecorator)
- **TreeViews** (StructureViewProvider, SolutionTreeDataProvider)
- **Commands** (ClarionExtensionCommands)
- **Full integration testing**

## Configuration

- **Mocha config**: `.mocharc.json`
- **Test files**: `server/src/test/**/*.test.ts`
- **Compiled output**: `out/server/src/test/**/*.test.js`
- **TypeScript config**: `server/tsconfig.json` (includes Mocha types)
- **Visual test runner**: VS Code Testing panel (beaker icon)

## Current Test Coverage

### ClarionTokenizer Tests (7 tests)
- PROCEDURE tokenization
- Comments and string literals
- Labels with colons
- ROUTINE tokenization
- Structure fields (QUEUE)
- Empty input handling

### TokenHelper Tests (16 tests)
- getWordRangeAtPosition: Clarion prefix notation (LOC:Field, Cust:Name)
- Dot notation with position awareness (MyGroup.MyField)
- Method calls (self.SaveFile())
- Multiple colons (File:Record:Field)
- Edge cases: empty positions, word boundaries
- getInnermostScopeAtLine: Procedure and routine scope detection
- getParentScopeOfRoutine: Parent scope resolution

### ClarionFoldingProvider Tests (16 tests)
- Procedure folding: simple, with DATA section, multiple procedures
- Nested ROUTINE within PROCEDURE
- Structure folding: QUEUE, GROUP, CLASS
- !REGION comment folding: single, multiple, nested regions
- Method implementations (ThisWindow.Init)
- Edge cases: empty code, comments only, missing END, complex nesting

### DefinitionProvider Behavior Tests (16 tests)
- Word extraction patterns for navigation (self.Method, LOC:Field, etc.)
- Symbol detection in token streams (variables, procedures, routines, classes)
- Scope detection for definition searches
- Pattern matching utilities (method implementations, self calls)

### Clarion Legacy Syntax Tests (31 tests)
**Dot-as-END Terminator (16 tests)**
- Single-line IF with dot: `IF a=b THEN c=d.`
- Multi-line IF with dot on various lines
- LOOP with dot terminators
- CASE structures with dots
- IF-ELSE with dots
- Mixed dot and END syntax
- Edge cases: decimals, function calls, nested structures

**Semicolon for Multi-statement Lines (10 tests)**
- Two/three statements on one line with semicolons
- Statements without semicolons on separate lines (valid)
- IF-THEN with multiple statements and semicolon
- LOOP with semicolon-separated statements
- Function calls with semicolons
- Mixed semicolons and newlines
- Semicolons in string literals
- Semicolons with dot terminators
- Trailing semicolon edge cases

**Invalid Syntax Tests (5 tests)**
- IF without THEN (should be invalid)
- LOOP inline statement variations
- Dot in expressions (decimal numbers)

**Note:** Some tests marked as "invalid" currently pass because the tokenizer
is lenient and doesn't throw errors on bad syntax. This is intentional for
IDE extension behavior - allows navigation/features to work on incomplete code.

## Test File for Clarion Compiler Verification

`TEST_CLARION_SYNTAX.clw` contains 30 isolated test procedures that can be 
compiled with the actual Clarion compiler to verify syntax behavior. This helps
ensure our tokenizer matches real Clarion compiler behavior.

## Adding New Tests

1. Create a new `.test.ts` file in `server/src/test/`
2. Import what you need to test
3. Use `suite()` and `test()` from Mocha TDD interface
4. Use `assert` from Node.js for assertions
5. Run `npm test` to verify

Example:
```typescript
import * as assert from 'assert';
import { MyModule } from '../MyModule';

suite('MyModule Tests', () => {
    test('Should do something', () => {
        const result = MyModule.doSomething();
        assert.strictEqual(result, 'expected');
    });
});
```

## Benefits of Unit Testing

- **Fast feedback** - Tests run in ~35ms
- **No F5 required** - Run from command line
- **Catch regressions** - Verify changes don't break existing functionality
- **CI/CD ready** - Can be integrated into automated pipelines
- **Focused testing** - Test individual components in isolation
- **Documentation** - Tests document expected behavior and edge cases

## Test Philosophy

Tests should verify **behavior**, not **implementation**:
- ✅ Good: "F12 on `self.Method()` should find the method definition"
- ❌ Bad: "Should call `tokenizer.splitLines()` with these parameters"

Tests should be resilient to refactoring - they should only fail when 
actual user-visible behavior changes, not when internal implementation changes.
