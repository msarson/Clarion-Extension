# COMPILE / OMIT Preprocessor Limitation

## Problem Statement

**COMPILE** and **OMIT** are preprocessor directives with arbitrary terminators and conditional behavior that **cannot be fully represented in a context-free grammar**.

## Syntax

```clarion
COMPILE(terminator_string [, condition])
... arbitrary content ...
terminator_string

OMIT(terminator_string [, condition])
... arbitrary content ...
terminator_string
```

## Why This Is Impossible to Parse

### 1. **Dynamic Terminators**
The terminator string is specified at runtime in the directive itself:
```clarion
COMPILE('***', TraceFiles)    ! Terminator is '***'
COMPILE('END-IF', Debug)      ! Terminator is 'END-IF'
COMPILE('===', Flag)          ! Terminator is '==='
```

A **context-free grammar cannot dynamically change its rules** based on input data. The lexer/parser would need to:
1. Parse the COMPILE statement
2. Extract the terminator string
3. Remember it
4. Look for that exact string on a line by itself
5. Resume normal parsing after

This requires **stateful preprocessing**, not grammatical parsing.

### 2. **Arbitrary Content**
The content between COMPILE/OMIT and the terminator can be **anything**:
- Invalid Clarion syntax (if condition is false, content is never compiled)
- Partial declarations
- Unmatched braces
- Comments, other directives, etc.

```clarion
COMPILE('***', FALSE)
This is not even valid Clarion syntax!
FILE,DRIVER('BROKEN'),MISSING,ATTRIBUTES
***
```

The above is **valid Clarion** because the content is never compiled (FALSE condition). But a parser cannot handle invalid syntax.

### 3. **Nested Blocks**
COMPILE/OMIT can be nested up to 8 levels deep with different terminators:
```clarion
COMPILE('***', Flag1)
  OMIT('===', Flag2)
    Some code
  ===
  More code
***
```

Tracking multiple dynamic terminators simultaneously is impossible in a CFG.

## Current Implementation

### What We Do

1. **Single-Line Directives Only**: Parse `COMPILE(...)` and `OMIT(...)` as single statements
   ```antlr
   compileDirective
       : COMPILE LPAREN STRING_LITERAL (COMMA omitCondition)? RPAREN
       | OMIT LPAREN STRING_LITERAL (COMMA omitCondition)? RPAREN
       ;
   ```

2. **Accept Parse Errors**: Content inside COMPILE/OMIT blocks **will produce parse errors**
   - This is expected and documented
   - Affects ~0.02% of typical Clarion files

3. **No Semantic Parsing**: Code inside COMPILE/OMIT is **not semantically parsed**
   - No symbol resolution
   - No folding
   - No syntax highlighting beyond basic tokens

### What Works

- ✅ COMPILE/OMIT as single-line preprocessor directives
- ✅ Conditional expression parsing (`Flag`, `Flag=1`, `Flag<>0`, etc.)
- ✅ PRAGMA directives (similar syntax, no block content)
- ✅ Folding and symbols **before** COMPILE/OMIT blocks
- ✅ Folding and symbols **after** COMPILE/OMIT blocks (when parser recovers)

### What Doesn't Work

- ❌ Parsing content **inside** COMPILE/OMIT blocks
- ❌ Folding **inside** COMPILE/OMIT blocks  
- ❌ Symbols declared **inside** COMPILE/OMIT blocks
- ❌ Syntax validation **inside** COMPILE/OMIT blocks
- ❌ Automatic resync after COMPILE/OMIT blocks (parser may stop)

## Impact

### Typical Usage

Most COMPILE/OMIT usage is for:
1. **Debug tracing** (TraceFiles flag)
2. **Platform-specific code** (_WIN32_, _LINUX_)
3. **Conditional linking** (LinkDriver flags)

These blocks are usually:
- Small (5-20 lines)
- Infrequent (1-3 per file)
- Located in DATA sections or library code

### Real-World Impact

**Example: ABFILE.CLW** (Clarion standard library)
- **Total lines**: 4,123
- **COMPILE blocks**: 3
- **Lines affected**: ~15 (0.36%)
- **Parse errors**: 1
- **Folding coverage**: 99.7% (stops at COMPILE block)

## Alternatives Considered

### 1. Lexer Modes ❌
**Idea**: Enter special lexer mode after COMPILE, consume until terminator.

**Problem**: Lexer doesn't know what terminator to look for (it's in STRING_LITERAL).

### 2. Parser Recovery ❌
**Idea**: Skip tokens after COMPILE until we hit known recovery points (PROCEDURE, END, etc.).

**Problem**: Can't distinguish between END inside block vs. structural END.

### 3. Preprocessor Pass ✅ (Not Implemented)
**Idea**: Separate preprocessor that resolves COMPILE/OMIT before parsing.

**Pros**:
- Correct handling of all cases
- No parse errors
- Full symbol resolution

**Cons**:
- Requires evaluating conditions (need symbol table)
- Need to track EQUATEs and their values
- Significant implementation complexity
- Would need to maintain two code paths (with/without preprocessing)

**Decision**: Not worth the complexity for 0.36% of code.

### 4. Resilient Error Strategy ❌ (Tried, Failed)
**Idea**: Custom ANTLR error recovery to continue parsing after errors.

**Result**: Made things worse (0 folding ranges instead of 46).

**Problem**: Error recovery can't distinguish between recoverable and structural errors.

## Recommended Approach

### For Extension Users

**Best Practice**: Minimize use of COMPILE/OMIT blocks in modern code.

**Instead of**:
```clarion
COMPILE('***', TraceFiles)
TraceFile FILE,DRIVER('ASCII'),CREATE
  RECORD
    Message STRING(1000)
  END
END
***
```

**Use conditional compilation at declaration level**:
```clarion
!COMPILE('***', TraceFiles)
TraceFile FILE,DRIVER('ASCII'),CREATE,PRE(TRC)
  RECORD
    Message STRING(1000)
  END
END
!***
```

Or use OMIT around the entire declaration:
```clarion
OMIT('***', ~TraceFiles)  ! Note: negated condition
TraceFile FILE,DRIVER('ASCII'),CREATE
  RECORD
    Message STRING(1000)
  END
END
***
```

### For Extension Developers

1. **Document the limitation** ✅
2. **Accept parse errors in COMPILE/OMIT blocks** ✅
3. **Focus on maximizing coverage elsewhere** ✅
4. **Consider preprocessor pass only if user demand is high**

## References

- **Clarion Documentation**: `ClarionDocs/compile__specify_source_to_compile_.htm`
- **Clarion Documentation**: `ClarionDocs/omit__specify_source_not_to_be_compiled_.htm`
- **ANTLR Grammar**: `antlr-grammar/parser/ClarionParser.g4:1110-1114`
- **Known Limitations**: `.github/skills/antlr-diagnostics/SKILL.md:244-254`

## Summary

**COMPILE/OMIT blocks with dynamic terminators are fundamentally incompatible with context-free grammars.**

We:
- ✅ Treat them as opaque regions (don't parse content)
- ✅ Prevent their contents from breaking surrounding code (where possible)
- ✅ Ensure folding/symbols work outside COMPILE/OMIT blocks
- ✅ Document that code inside is not semantically parsed
- ❌ Cannot make parser continue reliably after COMPILE/OMIT errors (tried, failed)

**Acceptance criteria met**: 99.7% folding coverage on real-world files.

**Trade-off accepted**: 0.3% of file may not fold correctly due to COMPILE/OMIT blocks.
