# ANTLR Grammar Status Report

## Summary (as of 2026-01-17)

**Passing: 4/7 files (57%)** - Real-world test suite

### ✅ Working Features
- Basic program structure (PROGRAM, MEMBER)
- MAP sections with procedure prototypes
- DATA declarations (variables, structures, files)
- CODE sections with statements
- PROCEDURE declarations
- Structures: GROUP, QUEUE, CLASS, FILE, VIEW
- Window declarations with controls
- Period terminators (`.` as END alternative)
- Reference variables (`&Type`)
- LIKE inherited data types
- Qualified field equates (`?P01:PR_ACCOUNT:Prompt`)
- Case-insensitive identifiers and member access
- Line continuation (`|`)
- Control attributes: AT, USE, RIGHT, LEFT, CENTER, DECIMAL, INS, OVR, TRN, etc.
- Nested window controls (SHEET, TAB, etc.)

### ⚠️ Known Limitations

#### 1. **Keywords as Labels at Column 0**
**Issue**: Clarion allows keywords like `Window`, `String`, `Button` to be used as labels when at column 0.
**Current State**: Lexer always matches keywords before checking for labels.
**Impact**: Files using keywords as labels will fail to parse.

**Example that fails:**
```clarion
Window  WINDOW('Test')  ! 'Window' is a label but lexer sees WINDOW keyword
        END
```

**Workaround**: 
- Use non-keyword identifiers: `MyWindow`, `Win1`, etc.
- Add prefix: `App_Window`, `Form_String`

**Proper Fix** (not implemented): Requires lexer modes or semantic predicates to detect column position.

#### 2. **OMIT Compiler Directives**
**Issue**: `OMIT('condition')` blocks not fully supported
**Impact**: 2 files failing due to OMIT

#### 3. **Missing Statement Types**
**Issue**: Some built-in procedures not recognized as statements
**Examples**: ACCEPT (event loop), possibly others
**Impact**: Minimal - most are procedureCall

### 📊 Test File Results

| File | Status | Notes |
|------|--------|-------|
| Main_py1_test.clw | ✅ PASS | |
| StartProc.clw | ✅ PASS | |
| TestUnreachableCode.clw | ✅ PASS | |
| utils.clw | ✅ PASS | |
| UpdatePYAccount_IBSCommon.clw | ❌ FAIL | 35 errors - needs investigation |
| FoldingIssue.clw | ❌ FAIL | `Window` keyword used as label |
| main.clw | ❌ FAIL | OMIT directive issue |

### 🎯 Recommendations

#### For Production Use
1. **Use current regex-based tokenizer** for IDE features (folding, symbols, etc.)
2. **Use ANTLR incrementally** for new features that need AST:
   - Semantic analysis
   - Refactoring
   - Rename symbol (scope-aware)
   - Go to definition (with proper scope resolution)

#### To Complete ANTLR Grammar
1. **High Priority**:
   - Implement OMIT directive support (would fix main.clw)
   - Document keywords-as-labels limitation
   - Investigate UpdatePYAccount errors (might be missing attributes)

2. **Medium Priority**:
   - Add ACCEPT and other statement keywords
   - Implement lexer modes for column-0 label detection
   - Add more comprehensive attribute filtering

3. **Low Priority**:
   - Complete all Clarion built-in functions
   - Add template language support
   - Expression operator precedence refinement

### 💡 Use Cases

**When to use ANTLR parser:**
- Refactoring tools
- Complex code transformations
- Semantic analysis
- Symbol renaming with scope awareness

**When to use regex tokenizer:**
- Syntax highlighting
- Code folding
- Document outline
- Simple goto definition
- Quick error checking

### 📝 Completed Work

1. ✅ Fixed qualified FIELD_EQUATE: `?P01:PR_ACCOUNT:Prompt`
2. ✅ Added justification attributes: LEFT, RIGHT, CENTER, DECIMAL
3. ✅ Added typing mode attributes: INS, OVR
4. ✅ Fixed window END handling (mandatory END for windows)
5. ✅ Made case-insensitive identifiers work correctly
6. ✅ Added period terminator support for structures
7. ✅ Added VIEW with PROJECT support
8. ✅ Added LIKE data type support
9. ✅ Added TRN attribute
10. ✅ Removed MEMBER_ACCESS token, added DOT for member access
11. ✅ Fixed line continuation handling (already working)
12. ✅ Added keywords-as-labels support in parser (partial - doesn't solve lexer issue)

### 🔧 Technical Details

**Lexer Token Priority:**
1. Keywords (imported first)
2. Types
3. Literals
4. Operators
5. Identifiers (imported last)

This means keywords always match before identifiers, which causes the column-0 label issue.

**Parse Tree Structure:**
- compilationUnit → programDeclaration / memberDeclaration
- dataDeclaration → variableDeclaration / structureDeclaration
- structureDeclaration → windowDeclaration / groupDeclaration / etc.
- windowDeclaration → windowControls END
- controlDeclaration → controlType attributes (controlDeclaration)* END?

**Performance:**
- Current tokenizer: ~1-2ms for typical files
- ANTLR parser: ~5-10ms for typical files
- Both fast enough for IDE use

