# TODO - Clarion Language Extension

This file tracks all outstanding tasks, bugs, and improvements for the Clarion Language Extension.

---

## 🐛 Critical Bugs

### Fix Method Declaration Parsing in Classes
**Priority:** HIGH  
**Status:** In Progress

#### Problem
Method definitions inside CLASS structures are being incorrectly parsed as properties/variables instead of methods.

**Example:**
```clarion
CLASS (StringTheory)
  ! ... other members ...
  Flush  PROCEDURE (StringTheory pStr),long, proc, virtual  ! <-- Incorrectly parsed
```

The Structure View shows: `"StringTheory ),long,proc,virtual"` as a **Property** instead of recognizing `Flush` as a **Method**.

#### Root Cause
1. The tokenizer defines `TokenType.MethodDeclaration` (line 44 in ClarionTokenizer.ts) but **never assigns it**
2. PROCEDURE keywords are tokenized as generic `TokenType.Keyword` (line 849)
3. When parsing, `StringTheory` (the parameter type) is recognized as a Type token
4. The `handleVariableToken` method is called, treating it as a variable declaration
5. The check for PROCEDURE on the same line (lines 1454-1475 in ClarionDocumentSymbolProvider.ts) should prevent this, but it's not working correctly

#### Solution
The tokenizer needs logic to:
1. Detect when a PROCEDURE keyword appears inside a CLASS/INTERFACE/MAP structure
2. Set the `subType` to `TokenType.MethodDeclaration` for these cases
3. This will cause the symbol provider to correctly handle it as a method (lines 409-415, 1305-1307)

#### Files to Modify
- `server/src/ClarionTokenizer.ts` - Add logic to assign MethodDeclaration subType
- Possibly `server/src/providers/ClarionDocumentSymbolProvider.ts` - Verify the PROCEDURE check is working

#### Test Case
Line 408 in `C:\Clarion\Clarion11.1\accessory\libsrc\win\StringTheory.inc`:
```clarion
Flush                 Procedure (StringTheory pStr),long, proc, virtual
```

Should appear in Structure View as:
- **Method**: `Flush (StringTheory pStr)`
- Under: `Class (StringTheory)` → ~~Properties~~ → **Methods**

#### Related
- Recent tokenizer changes for inline dot (`.`) terminators may have affected this
- Variable tokenization was working before these changes

---

## 🚀 Features

### Structure View - Follow Cursor
**Priority:** MEDIUM  
**Status:** Complete ✅

Follow cursor functionality has been implemented with:
- Toggle via right-click menu: "Disable Follow Cursor" / "Enable Follow Cursor"
- Automatically reveals the current symbol in the structure view as cursor moves
- Uses `getParent()` method for proper nested tree item resolution

---

## 📋 Enhancements

### Diagnostics - Unterminated Structure Detection
**Priority:** MEDIUM  
**Status:** Complete ✅

Added diagnostic provider that detects:
- IF statements not terminated with END or `.`
- LOOP statements not terminated with END, WHILE, or UNTIL
- Supports inline dot terminators (e.g., `IF A=B THEN C=D.`)
- Properly handles LOOP...WHILE and LOOP...UNTIL variations

---

## 📝 Documentation

### Clarion Language Knowledge Base
**Priority:** HIGH  
**Status:** In Progress

Located at: `docs/clarion-knowledge-base.md`

Current coverage:
- ✅ Source file structure (PROGRAM/MEMBER)
- ✅ Data scope (Global, Module, Local, Routine Local)
- ✅ Statement terminators (END, `.`)
- ✅ Column 0 rules for labels
- ✅ IF/ELSIF/ELSE structure rules
- ✅ LOOP termination rules
- ✅ PROCEDURE/MEMBER/ROUTINE rules
- ✅ MAP structure rules
- ✅ MODULE termination context rules
- ✅ Character encoding (ANSI/ASCII only)

Needs expansion:
- [ ] CASE structure
- [ ] CHOOSE structure
- [ ] EXECUTE structure
- [ ] Class/Interface definitions
- [ ] Property accessors (GET/SET)
- [ ] File declarations and operations
- [ ] Queue/Group/View structures

---

## 🧪 Testing

### Unit Tests for Syntax Validation
**Priority:** MEDIUM  
**Status:** In Progress

Test files created:
- ✅ `docs/clarion-tests/test_clarion_syntax.clw` - Example syntax patterns
- ✅ `docs/clarion-tests/test_clarion_syntax_fixed.clw` - Valid compilation test
- ✅ `server/src/test/diagnostics.test.ts` - Diagnostic provider tests

Needs coverage:
- [ ] More complex nested structures
- [ ] Edge cases with dot terminators
- [ ] Method vs procedure differentiation
- [ ] Class inheritance and interfaces

---

## 🔧 Technical Debt

### Code Organization
- ✅ **COMPLETE:** Separated tokenizer logic into smaller, focused modules
  - Created `server/src/tokenizer/` directory with modular structure:
    - `TokenTypes.ts` - Type definitions
    - `TokenPatterns.ts` - Pattern definitions
    - `PatternMatcher.ts` - Pattern matching logic
    - `StructureProcessor.ts` - Structure processing utilities
  - Reduced main tokenizer file from 837 to 482 lines (~42% reduction)
  - Improved maintainability and testability
- [ ] Add more inline documentation for complex parsing logic
- ✅ **COMPLETE:** Optimized performance bottlenecks in document symbol provider
  - Eliminated duplicate tokenization in diagnostic validation
  - DiagnosticProvider now uses cached tokens (50% reduction in tokenization overhead)
  - Added performance logging to track validation time

### Logging
- [ ] Review and standardize logging levels across codebase
- [ ] Remove or convert excessive debug logging to trace level

---

## 📦 Repository Organization

### Recent Changes
- ✅ Created `docs/clarion-tests/` for test Clarion code
- ✅ Created `docs/clarion-knowledge-base.md` for language reference
- ✅ Consolidated documentation in `docs/` directory

---

## Notes
- Always run tests before committing
- Update CHANGELOG.md with user-facing changes
- Only increment version after merge to main and marketplace publish
- Commit often, push only when requested
