# TODO - Clarion Language Extension

This file tracks all outstanding tasks, bugs, and improvements for the Clarion Language Extension.

---

## 🐛 Critical Bugs

### Build Error Diagnostics Not Showing Correct File Location (Dec 2024)
**Priority:** HIGH  
**Status:** Not Started

#### Problem
When building a Clarion solution/project with compile errors, the errors appear in the Problems pane but point to the wrong file location.

**Expected Behavior:**
- Errors should link to the actual source file where the error occurred
- Clicking the error should navigate to the correct file and line number
- Error should be clickable and actionable

**Current Behavior:**
- Error points to temporary build output log: `C:/Users/msars/AppData/Local/Programs/Microsoft VS Code/BuildOutput.log`
- Error location shows line 1, column 1 (incorrect)
- Error message shows project file path in brackets: `[f:\\Playground\\ArrayInteger\\ArrayInteger.cwproj]`

**Example Problem Output:**
```json
{
  "resource": "/C:/Users/msars/AppData/Local/Programs/Microsoft VS Code/BuildOutput.log",
  "owner": "clarion0",
  "severity": 8,
  "message": "Clarion error: Unknown procedure label [f:\\Playground\\ArrayInteger\\ArrayInteger.cwproj]",
  "source": "Clarion",
  "startLineNumber": 1,
  "startColumn": 1,
  "endLineNumber": 1,
  "endColumn": 51,
  "origin": "extHost1"
}
```

#### Analysis Needed
1. Locate build output parser code
2. Identify how Clarion compiler reports errors (format, file paths, line numbers)
3. Parse compiler output to extract:
   - Actual source file path
   - Line number where error occurred
   - Column number (if available)
   - Error message
4. Create diagnostic with correct file URI and location
5. Test with various error types and project structures

#### Files to Investigate
- Build task provider
- Compiler output parser
- Diagnostic collection logic
- Problem matcher configuration

---

### Structure View - Method Implementation Issues (Dec 2024)
**Priority:** HIGH  
**Status:** Partially Fixed - Needs More Work

#### What Was Fixed (Session Dec 2, 2024)
- ✅ Method implementations now detected (StringTheory._Method pattern)
- ✅ Class hierarchy created (StringTheory (Implementation) → Methods)
- ✅ Variable scoping fixed (procedures don't inherit each other's variables)
- ✅ CODE filtering works (items after CODE don't appear in structure)
- ✅ Fixed spurious variable symbols for class name labels
- ✅ Tests: 188 passing (was 185), 5 failing (was 9)

#### What Was Fixed (Session Dec 3, 2024)
- ✅ Variable type display now shows correct types in outline (e.g., `x long` shows as "long" not "STRING")
- ✅ String initializers shown in type (e.g., `string('ABC...')` displays properly)
- ✅ Fixed hard-coded attribute keywords - now using tokenizer definitions
- ✅ Removed SIGNED/UNSIGNED from attributes (they are data types, not attributes)
- ✅ Added SIZE as special case (function that can be used in declarations)
- ✅ Created comprehensive test suite for variable type extraction
- ✅ Created utility module for attribute keyword detection (`AttributeKeywords.ts`)
- ✅ **FIXED: Unlabeled GROUP structures now nest correctly**
  - Example: `GROUP,OVER(bits),PRE()` without a label
  - Fields `triplet1`, `triplet2`, `triplet3` now correctly appear as children of the GROUP
  - Fixed symbol builder to properly handle unlabeled groups and their END terminators
  - Group fields no longer appear as siblings of the GROUP
- ✅ **FIXED: Method implementation hover now shows correct overload**
  - Hovering over `StringTheory.Instring Procedure(...)` now uses parameter count to find matching declaration
  - Uses same overload resolution logic as method call hover (e.g., `self.Instring(...)`)
  - Searches both current file and INCLUDE files for best matching overload
  - Returns exact match when parameter counts match, or closest match otherwise

#### Remaining Issues - Complete! ✅
- ✅ **F12 (Go to Definition) uses same overload resolution as hover** (Dec 3, 2024)
  - ✅ Pressing F12 on a method implementation (e.g., `StringTheory.Instring Procedure(...)`) now finds the correct overload
  - ✅ Uses parameter matching to find the correct overload, same as hover provider
  - ✅ Handles omittable parameters `<Long SomeVar>` and default values `Long SomeVar=1`
  - ✅ Created shared `MethodOverloadResolver` utility used by both HoverProvider and DefinitionProvider
  - ✅ Removed duplicate overload resolution code (~300 lines)
  - ✅ Searches both current file and INCLUDE files for best matching overload
  - ✅ Returns exact match when parameter counts match, or closest match otherwise

**Test files created:**
- `server/src/test/MethodImplementation.test.ts` - TDD tests for method structure
- `server/src/test-tokenizer-debug.ts` - Debug script for tokenization

**Key files involved:**
- `server/src/providers/ClarionDocumentSymbolProvider.ts` - Main symbol provider
- `server/src/DocumentStructure.ts` - Handles procedure/method detection (lines 605-640)
- `server/src/ClarionTokenizer.ts` - Tokenization logic

**Important Notes:**
- CODE statements MUST be indented, not at column 0
- Dot (`.`) used for: structure field access (Class.Method) AND structure terminator
- Label + Variable + PROCEDURE pattern = method implementation
- Need to respect Clarion's column 0 rules for labels

#### Next Steps
1. Review actual user workflow with method implementations
2. Check real-world StringTheory.clw structure view
3. Identify specific navigation/usability issues
4. Fix symbol hierarchy organization
5. Improve method display names
6. Test with actual Clarion projects

---

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

### ~~Diagnostics - Unterminated Structure Detection~~ ✅ COMPLETE (Dec 2024)
**Priority:** ~~MEDIUM~~ **COMPLETE**  
**Status:** Complete ✅

Added diagnostic provider that detects:
- ✅ IF statements not terminated with END or `.`
- ✅ LOOP statements not terminated with END, WHILE, or UNTIL
- ✅ Supports inline dot terminators (e.g., `IF A=B THEN C=D.`)
- ✅ Properly handles LOOP...WHILE and LOOP...UNTIL variations
- ✅ OMIT/COMPILE blocks not terminated with matching terminator string
- ✅ Fixed parser state corruption in large files (Dec 2024)

### Performance Optimizations ✅ COMPLETE (Dec 2024)
**Priority:** HIGH  
**Status:** Complete ✅

Major performance improvements for large files:
- ✅ **Symbol caching**: Document symbols cached during editing, only recomputed on debounce
- ✅ **Folding range caching**: Folding ranges cached during editing, only recomputed on debounce  
- ✅ **Result**: ~1.5 second delay eliminated on every keystroke in large files (e.g., StringTheory.clw with 14K lines)
- ✅ Smooth editing experience - no more freezing while typing

**Before optimization:**
- Each keystroke triggered 1.5s full re-tokenization for symbol/folding updates
- Editing large files was extremely sluggish

**After optimization:**
- Symbols: `⚡ Document being edited, returning cached symbols`
- Folding: `⚡ Document being edited, returning cached folding ranges`
- Re-tokenization only happens once after 500ms of no edits (debounce)

---

## 📝 Documentation

### Clarion Language Knowledge Base
**Priority:** HIGH  
**Status:** ✅ Complete (Dec 2024)

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
- ✅ OMIT/COMPILE conditional compilation directives (Dec 2024)
- ✅ CASE structure (Dec 2024)
- ✅ CHOOSE function (Dec 2024)
- ✅ EXECUTE structure (Dec 2024)
- ✅ GET statement - FILE/QUEUE operations (Dec 2024)
- ✅ SET statement - FILE/VIEW operations (Dec 2024)
- ✅ FILE declaration structure (Dec 2024)
- ✅ QUEUE structure (Dec 2024)
- ✅ GROUP structure (Dec 2024)
- ✅ VIEW structure (Dec 2024)
- ✅ CLASS and INTERFACE definitions (Dec 2024)

**Knowledge base is now comprehensive!**

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

### Documentation Structure ✅ COMPLETE (Dec 2024)
**Status:** Complete ✅

Reorganized documentation with clear separation:
- ✅ User-facing docs remain in `docs/` root
- ✅ Developer/technical docs moved to `docs/dev/`
- ✅ Created `docs/README.md` as user-facing index
- ✅ Created `docs/dev/README.md` as developer guide
- ✅ "What Goes Where" guidelines for future docs

**User docs** (`docs/`):
- CheatSheet.md, BuildSettings.md (guides)
- clarion-knowledge-base.md, CLARION_LANGUAGE_REFERENCE.md (language ref)
- RELEASE_NOTES_*.md (user release notes)
- clarion-tests/ (example code)

**Developer docs** (`docs/dev/`):
- Bug fix analyses (FIX_*.md, HOTFIX_*.md)
- Feature development (DIAGNOSTIC_*.md, SYMBOL_PROVIDER_*.md)
- Test summaries (TDD_SESSION_*.md, TEST_*.md)
- Technical fixes (TOKENIZER_BUG_*.md, UNICODE_FIX.md)

### Recent Changes
- ✅ Created `docs/clarion-tests/` for test Clarion code
- ✅ Created `docs/clarion-knowledge-base.md` for language reference
- ✅ Consolidated documentation in `docs/` directory
- ✅ Separated user and developer documentation (Dec 2024)

---

## Notes
- Always run tests before committing
- Update CHANGELOG.md with user-facing changes
- Only increment version after merge to main and marketplace publish
- Commit often, push only when requested
