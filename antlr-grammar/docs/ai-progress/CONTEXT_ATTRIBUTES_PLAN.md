# Context-Specific Attributes Implementation Plan

## Current State
- All attribute rules use generic `attribute` rule
- No context enforcement (any attribute can be used anywhere)
- 140+ attributes defined in clarion-attributes.json

## Categories from JSON Analysis

### Window Structures (28 attributes)
**WINDOW-only:** CENTER, MODAL, MDI, RESIZE, DOUBLE, NOFRAME, ALRT, TIMER, WALLPAPER, MAXIMIZE, ICONIZE, FULL, TOOLBOX, DOCK, DOCKED
**Shared with CONTROL:** AT, USE, COLOR, FONT, GRAY, HSCROLL, VSCROLL, HVSCROLL, HLP, etc.

### Controls (23 core attributes)  
**CONTROL-only:** HIDE, DISABLE, IMM, READONLY, REQ, AUTO, SKIP, RANGE, TIP, KEY
**Shared:** AT, USE, COLOR, FONT, etc.

### Data Structures (10 attributes)
**DATA_TYPE:** PRE, DIM, OVER, EXTERNAL, STATIC, THREAD, LIKE, NAME, DLL

### File/Queue/Group (6-8 each)
**FILE:** CREATE, RECLAIM, OWNER, ENCRYPT, DRIVER, etc.
**QUEUE:** PRE, DIM, TYPE, BINDABLE, etc.
**GROUP:** PRE, DIM, OVER, etc.

## Implementation Strategy

### Phase 1: Core Context Rules (DO FIRST)

1. **Create base attribute categories:**
   - `positionAttribute` - AT (shared by many)
   - `displayAttribute` - COLOR, FONT, ICON (shared)
   - `scrollAttribute` - HSCROLL, VSCROLL, HVSCROLL (shared)
   - `alignmentAttribute` - LEFT, RIGHT, CENTER, DECIMAL (exclusive)

2. **Create context-specific rules:**
   - `windowAttribute` - Window-specific + shared
   - `controlAttribute` - Control-specific + shared  
   - `dataAttribute` - Data/variable declarations
   - `structureAttribute` - GROUP, QUEUE, FILE, CLASS

3. **Replace existing generic rules:**
   - Keep `attribute` as fallback for unknown/generic
   - Use specific rules in declarations

### Phase 2: Specialized Controls (DO SECOND)

Create specific rules for controls with special structure:

1. **sheetControl** - MUST have TABs:
   ```antlr
   sheetControl
       : label? SHEET (LPAREN expression RPAREN)? (COMMA sheetAttributes)?
         tabControl+
         END
       ;
   ```

2. **optionControl** - Has child RADIO controls:
   ```antlr
   optionControl
       : label? OPTION (LPAREN expression RPAREN)? (COMMA controlAttribute)*
         controlDeclaration+
         END
       ;
   ```

3. **groupControl** - Nested controls:
   ```antlr
   groupControl
       : label? GROUP (COMMA controlAttribute)*
         controlDeclaration*
         END
       ;
   ```

4. **oleControl** - Optional MENUBAR:
   ```antlr
   oleControl
       : label? OLE (COMMA controlAttribute)*
         menubarDeclaration?
         END
       ;
   ```

### Phase 3: Alignment Rules (OPTIONAL - COMPLEX)

The other grammar enforces "only one alignment attribute per control":
- Can't have both LEFT and RIGHT
- Can't have LEFT and CENTER
- Can't have DECIMAL and RIGHT

This requires:
```antlr
controlAttrsWithAlign
    : alignmentAttribute (COMMA nonAlignAttribute)*
    ;

controlAttrsNoAlign
    : nonAlignAttribute (COMMA nonAlignAttribute)*
    ;
```

**Decision:** Skip this for now - too complex, adds limited value

## Recommended Approach

**Start with Phase 1 only:**
1. Create 4-5 core attribute categories  
2. Replace generic rules with specific ones
3. Test on real files

**Benefits:**
- More accurate parse trees
- Better error messages
- Foundation for semantic analysis

**Risks:**
- May break some edge cases
- Increases grammar complexity
- Parser file grows larger

**Alternative:**  
Keep parser permissive (current), do validation in semantic analyzer. This is actually the LSP best practice.

## Recommendation

**HYBRID APPROACH:**
1. **Do Phase 1** - Split into context-specific attributes (moderate improvement)
2. **Do Phase 2** - Add specialized control rules (significant structural improvement)
3. **Skip Phase 3** - Alignment exclusivity (low value, high complexity)

This gives us 80% of the benefit with 30% of the complexity.
