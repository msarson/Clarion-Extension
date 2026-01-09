# Test Infrastructure Setup

## Test Organization

The Clarion extension has two types of tests:

### 1. Server Tests (Node.js)
- Location: `server/src/test/**/*.test.ts`
- Run without VS Code Extension Host
- Can be run via Mocha Test Explorer
- Config: `.mocharc.json` (default)

### 2. Client Tests (VS Code API)
- Location: `client/src/test/**/*.test.ts`
- **REQUIRE** VS Code Extension Host to run
- Cannot be run via Mocha Test Explorer (need VS Code API)
- Config: `.mocharc-client.json`

## Running Tests

### Via NPM Scripts

```bash
# Run server tests only (default for Mocha Test Explorer)
npm run test:server

# Run client tests (requires VS Code Extension Host)
npm run test:client

# Run both server and client tests
npm run test:all

# Quick default test (server only)
npm test
```

### Via Mocha Test Explorer Extension

The Mocha Test Explorer by Holger Benl will automatically discover server tests using `.mocharc.json`.

**Important**: The test explorer can only run server tests because client tests require the VS Code API which is not available in the test explorer context.

#### Setup
1. Install: **Mocha Test Adapter** by Holger Benl
2. The extension will read `.mocharc.json` automatically
3. **Workspace Settings**: `.vscode/settings.json` should contain:
   ```json
   {
     "mochaExplorer.files": [
       "out/server/src/test/**/*.test.js"
     ],
     "mochaExplorer.watch": [
       "out/server/src/**/*.js"
     ]
   }
   ```
4. Only server tests will appear in the test explorer UI

#### Configuration Files

- **`.mocharc.json`** - Main config (server tests only)
  ```json
  {
    "ui": "tdd",
    "timeout": 30000,
    "spec": ["out/server/src/test/**/*.test.js"]
  }
  ```

- **`.mocharc-client.json`** - Client tests (used by npm script)
  ```json
  {
    "ui": "tdd",
    "timeout": 30000,
    "spec": ["out/client/src/test/**/*.test.js"],
    "exclude": [
      "out/client/src/test/UnreachableCodeDecorator.test.js",
      "out/client/src/test/TextEditingCommands.test.js"
    ]
  }
  ```

## Why This Split?

**Client tests** import the `vscode` module which is only available when running inside VS Code's Extension Host:

```typescript
import * as vscode from 'vscode';  // Only works in Extension Host!
```

**Server tests** run in pure Node.js and don't need VS Code:

```typescript
import { ClarionTokenizer } from '../ClarionTokenizer';  // Pure Node.js
```

## Test Counts

As of 2026-01-05:
- **Server tests**: 439 passing, 33 failing (pre-existing)
  - Includes 11 semantic token tests (all passing)
- **Client tests**: Run via Extension Host only

## Troubleshooting

### "Cannot find module 'vscode'" Error

This means the Mocha Test Explorer is trying to load client tests. Solution:
1. Verify `.mocharc.json` only includes server tests
2. **Check `.vscode/settings.json`** - ensure `mochaExplorer.files` only includes server tests:
   ```json
   {
     "mochaExplorer.files": [
       "out/server/src/test/**/*.test.js"
     ]
   }
   ```
3. Reload VS Code window
4. Refresh test explorer

### Client Tests Not Running

Client tests **must** be run via:
1. VS Code's Extension Host (F5 → Run Tests)
2. `npm run test:client` (if Extension Host is available)

They **cannot** be run via Mocha Test Explorer.

## Semantic Token Tests

The semantic token implementation includes comprehensive tests:

### Structure Parent Relationship Tests (7 tests)
- `server/src/test/StructureParentRelationship.test.ts`
- Tests: GROUP, VIEW, QUEUE, WINDOW, nested SHEET/TAB, line continuations

### Period Terminator Tests (4 tests)
- `server/src/test/SemanticTokensPeriod.test.ts`
- Tests: Period terminators inherit parent structure colors

All 11 semantic token tests are **passing** ✅
