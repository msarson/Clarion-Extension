# ANTLR TypeScript Setup for Clarion Grammar

## Quick Start

1. **Install dependencies:**
   ```bash
   cd antlr-grammar
   npm install
   ```

2. **Generate TypeScript lexer/parser:**
   ```bash
   npm run generate
   ```
   This generates both lexer and parser from the `.g4` grammar files.

3. **Compile TypeScript:**
   ```bash
   npm run build
   ```
   Compiles the generated TypeScript to JavaScript in `out/` directory.

4. **Test against a Clarion file:**
   ```bash
   npm test <path-to-file.clw>
   # OR
   node out/test-parse.js <path-to-file.clw>
   ```

5. **Clean generated files:**
   ```bash
   npm run clean
   ```

## What's Generated

Output goes to `generated/` directory:
- `ClarionLexer.ts` - Tokenizer
- `ClarionParser.ts` - Parser  
- `ClarionParserListener.ts` - Listener pattern
- `ClarionParserVisitor.ts` - Visitor pattern
- `*.tokens` - Token type definitions
- `*.interp` - Parser interpretation data

Compiled JavaScript goes to `out/` directory.

## Testing

The test harness `test-parse.ts` provides comprehensive output:

```bash
# Single file test
npm test ../test-programs/scope-test.clw

# Output includes:
# - Input file content
# - Token list (type and value)
# - Parse tree structure
# - Syntax errors with line numbers
# - Success/failure indicator (colored)
```

**PowerShell script to test all files:**
```powershell
Get-ChildItem ..\test-programs\*.clw | ForEach-Object { 
    $result = node out\test-parse.js $_.FullName 2>&1 | Select-String "succeeded|failed"
    if ($result -match "succeeded") { 
        Write-Host "✅ $($_.Name)" 
    } else { 
        Write-Host "❌ $($_.Name)" 
    }
}
```

## Development Workflow

1. **Modify grammar files** (`.g4` files in `lexer/` or `parser/`)
2. **Run generation**: `npm run generate`
   - Watch for ANTLR warnings/errors
   - Warning(125): Implicit token definition - means keyword not in lexer
   - Error(119): Left recursion - fix by using precedence climbing pattern
3. **Compile**: `npm run build`
4. **Test**: `npm test <file.clw>`
5. **Debug**: Look at token output to see how text is being tokenized
6. **Iterate**: Fix grammar based on errors

## When Encountering Unknown Syntax

**⚠️ IMPORTANT**: Always check these sources in order:

1. **`ClarionDocs/` folder** - Official Clarion documentation (4,700+ HTML files)
   - Search for keyword/statement name
   - Check syntax examples and rules
   - Verify column positioning requirements

2. **Existing tokenizer** (`server/src/tokenizer/TokenPatterns.ts`)
   - See how current extension tokenizes similar constructs
   - Check regex patterns and token types

3. **Test files** (`test-programs/` and `test-programs/RealWorldTestSuite/`)
   - Find examples of the construct in real code
   - Use passing tests as reference for syntax

4. **Metadata files**:
   - `server/src/data/clarion-controls.json` - Window controls
   - `server/src/data/clarion-attributes.json` - Attributes

## Common Issues & Solutions

### Token Ordering

**Problem**: Keywords being recognized as IDENTIFIER

**Solution**: Import order in `ClarionLexer.g4` matters!
```antlr
import ClarionKeywords, ClarionTypes, ClarionLiterals, 
       ClarionOperators, ClarionIdentifiers;
```
Keywords MUST be imported before Identifiers.

### Left Recursion

**Problem**: Error(119): Mutually left-recursive rules

**Solution**: Use precedence climbing pattern:
```antlr
// WRONG - left recursive
expression: expression '+' expression | ...;

// RIGHT - precedence climbing  
expression: orExpression;
orExpression: andExpression (OR andExpression)*;
andExpression: equalityExpression (AND equalityExpression)*;
// ... continue down precedence levels
```

### Period vs Decimal

**Problem**: Decimal numbers like `3.14` treated as statements with terminators

**Solution**: 
1. `DECIMAL_LITERAL` matches before `TERMINATOR` (longest match wins)
2. `TERMINATOR: '.' [ \t\r\n] | '.' EOF` only matches when followed by whitespace

### Empty String in Closure

**Problem**: Warning/Error about optional block matching empty string

**Solution**: Change `(rule1 | rule2)*` where both are optional to alternatives:
```antlr
// WRONG - both optional, can match empty
(mapSection | globalDataSection)*

// RIGHT - list concrete items
(mapSection | dataDeclaration | codeSection)*
```

## Notes

- This is **exploratory only** - not yet integrated with the VS Code extension
- Generated files are gitignored and excluded from VS Code problems panel
- Uses `antlr4ts` package for TypeScript target
- Focus is on Win32 Clarion (excludes .NET-specific features)
- Grammar aims to be comprehensive - "no point having something that doesn't work"
- When in doubt about Clarion syntax, **check ClarionDocs/ first!**

## Current Status

See [README.md](./README.md) for:
- Detailed feature checklist
- Testing results (11/25 files passing = 44%)
- Known limitations
- Critical Clarion syntax rules discovered
