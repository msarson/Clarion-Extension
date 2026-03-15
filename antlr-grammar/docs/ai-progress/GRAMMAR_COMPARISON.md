# Comparison: Our Grammar vs. Another Clarion User's Grammar

## Key Differences

### 1. **Case Insensitivity Approach** 🔥 MAJOR DIFFERENCE

**Theirs:**
```antlr
options { caseInsensitive = true; }
```
- Uses built-in ANTLR4 feature (requires ANTLR 4.11+)
- Simpler, cleaner approach
- Keywords just: `WINDOW : 'WINDOW';`

**Ours:**
```antlr
fragment W : [Ww];
WINDOW : W I N D O W ;
```
- Manual case-insensitive fragments
- More verbose but works on older ANTLR versions
- Explicit control over each character

**Winner: Theirs** - Much cleaner if you have ANTLR 4.11+

---

### 2. **Attribute Handling** 🔥 MAJOR DIFFERENCE

**Theirs:**
```antlr
windowAttr
    : ATKW LPAREN atArgs RPAREN
    | FONTKW LPAREN fontArgList RPAREN
    | ... (30+ specific attributes)
    ;

controlAttr
    : alignAttr  // LEFT/RIGHT/DECIMAL
    | nonAlignAttr
    ;

// Enforces: only ONE alignAttr per control
controlAttrs
    : controlAttrsNoAlign
    | controlAttrsWithAlign  // Exactly one align
    ;
```

**Ours:**
```antlr
attribute
    : (IDENTIFIER | ALRT | AT | ... | VSCROLL | INDEX)
      (LPAREN expression? (COMMA expression?)* RPAREN)?
    ;

controlAttributes: attribute (COMMA attribute)*;
windowAttributes: attribute (COMMA attribute)*;
dataAttributes: attribute*;
```

**Winner: Theirs** - Context-specific, enforces semantic rules (e.g., only one LEFT/RIGHT per control)

---

### 3. **Control Specialization** 🔥 MAJOR DIFFERENCE

**Theirs:**
```antlr
windowControlDecl
    : oleControlDecl       // OLE with MENUBAR
    | optionControlDecl    // OPTION with children
    | groupControlDecl     // GROUP with children
    | sheetControlDecl     // SHEET with TABs
    | listControlDecl      // LIST special attrs
    | ... generic controls
    ;

sheetControlDecl
    : ID? SHEETKW sheetControlAttrs lineEnd
      sheetTabDecl+        // MUST have TABs
      (END | DOT)
    ;
```

**Ours:**
```antlr
controlDeclaration
    : label? controlType 
      (LPAREN expression? (COMMA expression?)* RPAREN)? 
      (COMMA controlAttributes)?
      (controlDeclaration)*  // Generic nesting
      (END)?
    ;
```

**Winner: Theirs** - Specialized rules match Clarion's actual structure better

---

### 4. **Implicit Type Variables** 🎯 CLEVER DIFFERENCE

**Theirs:**
```antlr
ID: QUESTION? ID_START ID_PART* ('#' | '$' | '"')?
```
- Single token handles: `?Field`, `Var$`, `Num#`, `Quoted"`
- Simpler lexer

**Ours:**
```antlr
FIELD_EQUATE: '?' [A-Za-z_] [A-Za-z0-9_]*;
IMPLICIT_STRING: [A-Za-z_][A-Za-z0-9_]* '$';
IMPLICIT_NUMERIC: [A-Za-z_][A-Za-z0-9_]* '#';
```
- Separate tokens for each type
- More explicit, easier to reason about in parser

**Winner: Tie** - Both approaches work, depends on preference

---

### 5. **Line Endings & Semicolons**

**Theirs:**
```antlr
lineEnd: EOL | NEWLINE;
NEWLINE: ';';  // Clarion supports semicolons!
```

**Ours:**
```antlr
// No semicolon support
```

**Winner: Theirs** - More complete Clarion support

---

### 6. **Column 0 Labels** ⚠️ NEITHER SOLVES THIS

**Theirs:** Uses `ID` everywhere, keywords still match first
**Ours:** Added keywords to `label` rule, but doesn't solve lexer priority

**Winner: Tie** - Both have the same limitation

---

### 7. **MODULE Placement**

**Theirs:**
```antlr
mapSection
    : MAP lineEnd*
      (mapEntry lineEnd*)*
      (END | DOT)
    ;

mapEntry
    : moduleDecl   // MODULE in MAP
    | prototypeDecl
    ;
```

**Ours:**
```antlr
// Removed MODULE from top-level
// Added as MAP moduleReference
```

**Winner: Theirs** - More accurate to actual Clarion

---

### 8. **LIKE Handling**

**Theirs:**
```antlr
dataLikeOrType
    : LIKE LPAREN fieldRef RPAREN
    | STRINGKW stringTypeArgs?
    | typeSpec typeArgs?
    ;
```

**Ours:**
```antlr
dataType
    : ... 
    | LIKE LPAREN (IDENTIFIER | QUALIFIED_IDENTIFIER) RPAREN
    | ...
    ;
```

**Winner: Theirs** - Uses `fieldRef` (dot-qualified), more flexible

---

### 9. **Expression Operators**

**Theirs:**
```antlr
LTE: '<=';
GTE: '>=';
NEQ: '<>';
AMP_EQUAL: '&=';
DEEP_ASSIGN: ':=:';  // Deep assignment!
STAR_EQUAL: '*=';
PLUS_EQUAL: '+=';
DIV_EQUAL: '/=';
```

**Ours:**
```antlr
LE: '<=';
GE: '>=';
NE: '<>';
NE_ALT: '!=';
// Missing: &=, :=:, *=, /=
```

**Winner: Theirs** - More complete operator set

---

### 10. **Keyword Coverage**

**Theirs:** 150+ keywords explicitly defined
**Ours:** ~100 keywords

**Examples they have that we don't:**
- BFLOAT4, BFLOAT8 (new float types)
- VARIANT, USTRING, BOOL
- PARTIAL, BINDABLE, COMPATIBILITY
- ANGLE, DRAGID, PEN, STYLE
- WIZARD, SPREAD, NOSHEET
- Many report-specific keywords

**Winner: Theirs** - More comprehensive

---

### 11. **Structure & Organization**

**Theirs:**
- ~2000 lines, single file
- Clear section comments
- Specialized rules for each construct
- Attribute args separated (atArgs, fontArgList, bevelArgs)

**Ours:**
- ~550 lines parser + ~500 lines lexer (split)
- Modular (separate lexer files)
- Generic rules with parameters
- Simpler but less precise

**Winner: Depends** - Theirs is more complete, ours is more maintainable

---

## What We Can Learn From Theirs

### ✅ Should Adopt:

1. **`options { caseInsensitive = true; }`** if using ANTLR 4.11+
2. **Semicolon support** as line terminator
3. **Context-specific attribute rules** (windowAttr vs controlAttr)
4. **Deep assignment operator** `:=:`
5. **More operators**: `&=`, `*=`, `/=`
6. **Specialized control rules** (sheetControlDecl, optionControlDecl)
7. **New data types**: BFLOAT4, BFLOAT8, VARIANT, BOOL, USTRING

### ⚠️ Trade-offs:

1. **Single ID token** vs separate FIELD_EQUATE/IMPLICIT_* tokens
   - Theirs: Simpler lexer, harder to distinguish in parser
   - Ours: More tokens, clearer semantics

2. **Generic vs specialized rules**
   - Theirs: More accurate, harder to maintain
   - Ours: Simpler, less precise

### ❌ Doesn't Help With:

1. **Column 0 label detection** - Neither solves this
2. **OMIT directive** - Neither has comprehensive support
3. **Template language** - Neither covers this

---

## Summary Table

| Feature | Theirs | Ours | Better |
|---------|--------|------|--------|
| Case insensitivity | Built-in | Manual | Theirs |
| Attribute handling | Context-specific | Generic | Theirs |
| Control specialization | Specialized rules | Generic | Theirs |
| Keyword coverage | 150+ | 100 | Theirs |
| Operator coverage | Complete | Missing some | Theirs |
| Code organization | Single file | Modular | Ours |
| Maintainability | Complex | Simpler | Ours |
| Line continuation | Works | Works | Tie |
| Column 0 labels | ❌ | ❌ | Tie |
| MODULE placement | In MAP | Removed | Theirs |
| Semicolon support | ✅ | ❌ | Theirs |

---

## Recommendation

**If starting fresh**: Use their approach as a foundation:
1. Use `caseInsensitive` option
2. Adopt their control specialization
3. Use their attribute categorization
4. Add our qualified FIELD_EQUATE fix
5. Add our period terminator support

**For our existing grammar**: Incremental improvements:
1. Switch to `caseInsensitive` option (if ANTLR 4.11+)
2. Add missing operators (&=, :=:, *=, /=)
3. Add semicolon support
4. Consider splitting attributes by context
5. Add new data types (BFLOAT4/8, VARIANT, etc.)

**Bottom line**: Their grammar is more complete and production-ready. However, neither solves the column-0 label issue, which requires custom lexer logic or lexer modes that neither has implemented.
