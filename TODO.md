# TODO - Clarion Language Extension

This file tracks all outstanding tasks, bugs, and improvements for the Clarion Language Extension.

---

## 🐛 Critical Bugs

### ~~Fix Method Declaration Parsing in Classes~~ ✅ FIXED (Dec 2024)
**Priority:** ~~HIGH~~ **COMPLETE**  
**Status:** ~~In Progress~~ **RESOLVED**

#### Problem
Method definitions inside CLASS structures were being incorrectly parsed as properties/variables instead of methods.

**Example:**
```clarion
CLASS (StringTheory)
  ! ... other members ...
  Flush  PROCEDURE (StringTheory pStr),long, proc, virtual  ! <-- Was incorrectly parsed
```

#### Solution Implemented
Fixed in 3 commits (a63e88a, ea780ba, 69416e7):
1. **Fixed token type check**: Changed `handleVariableToken` to check `TokenType.Procedure` instead of `TokenType.Keyword`
2. **Fixed pattern matching order**: Moved `Type` before `Function` in pattern matching to prevent `STRING(50)` being tokenized as function call
3. **Fixed procedure name extraction**: Use `token.label` property instead of `prevToken`

#### Results
- ✅ CLASS methods now parse correctly in structure view
- ✅ All 170 tests passing
- ✅ StringTheory.Flush now appears as Method, not Property

---

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
- ✅ **COMPLETE:** Optimized performance bottlenecks (Dec 2024)
  - Eliminated duplicate tokenization in diagnostic validation (50% reduction)
  - Reduced excessive logging overhead (9 high-frequency loggers: info/debug → error)
  - Test suite: 79ms → 65ms (18% faster)
  - Should dramatically improve responsiveness for large files like StringTheory.clw
  - Performance logging enhanced with [PERF] tags for visibility

### Logging
- ✅ **COMPLETE:** Review and standardize logging levels across codebase (Dec 2024)
  - Set all hot-path providers to "error" level only
  - Performance metrics still visible via console.log
  - Eliminates thousands of unnecessary log calls per document change

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
