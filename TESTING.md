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

## Current Test Coverage

- ✅ ClarionTokenizer - 7 tests covering:
  - PROCEDURE tokenization
  - Comments
  - String literals
  - Labels with colons
  - ROUTINE tokenization
  - Structure fields (QUEUE)
  - Empty input handling

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

- **Fast feedback** - Tests run in ~20ms
- **No F5 required** - Run from command line
- **Catch regressions** - Verify changes don't break existing functionality
- **CI/CD ready** - Can be integrated into automated pipelines
- **Focused testing** - Test individual components in isolation
