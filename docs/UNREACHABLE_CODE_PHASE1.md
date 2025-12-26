# Unreachable Code Detection - Phase 1

## Overview
This feature detects and visually dims code that is provably unreachable in Clarion procedure and method implementations.

## Status
✅ **Phase 1 Complete** - Basic detection of unconditional top-level terminators

## Clarion Semantics

### Procedure/Method Execution Flow
- Execution begins at the `CODE` statement
- Execution does **NOT** end at `END`
- Execution ends only when one of the following executes:
  - `RETURN`
  - `EXIT`
  - `HALT`
- OR when:
  - Another PROCEDURE or METHOD implementation begins
  - End of file is reached

### ROUTINE Semantics
- `ROUTINE` is a local subprogram, **NOT** part of linear execution flow
- `ROUTINE` is **ALWAYS reachable** by definition
- Code inside `ROUTINE` is never marked unreachable
- A `RETURN`/`EXIT`/`HALT` in the parent procedure does NOT make a `ROUTINE` unreachable
- `ROUTINE` may contain:
  - Executable statements directly
  - OR a DATA section followed by CODE
- Presence or absence of DATA/CODE in a ROUTINE does NOT affect reachability

### Important Notes
- `STOP` is **NOT** treated as a terminator (user may continue execution)
- `END` or dot (`.`) terminates structures ONLY, not procedure execution
- Only **top-level** terminators create unreachable code (not inside IF/CASE/LOOP)

## What Phase 1 Detects

Code is marked as unreachable ONLY when ALL of the following are true:

1. Code appears AFTER an unconditional terminator (`RETURN`, `EXIT`, or `HALT`)
2. Terminator occurs at TOP execution level (not inside IF/CASE/LOOP)
3. Code is inside a PROCEDURE or METHOD CODE block
4. Code appears BEFORE:
   - A ROUTINE declaration
   - Another PROCEDURE/METHOD
   - End of file

## Examples

### ✅ Detected as Unreachable

```clarion
MyProc PROCEDURE()
  CODE
    RETURN
    MESSAGE('never runs')   ! ← UNREACHABLE (dimmed)
```

### ❌ NOT Detected (False Negatives Acceptable in Phase 1)

```clarion
! Conditional termination
MyProc PROCEDURE()
  CODE
    IF a = 1 THEN
      RETURN
    END
    MESSAGE('reachable')    ! ← NOT marked unreachable

! ROUTINE is always reachable
MyProc PROCEDURE()
  CODE
    RETURN

MyRoutine ROUTINE
  MESSAGE('reachable')      ! ← NOT marked unreachable

! ROUTINE with DATA + CODE is still reachable
MyRoutine ROUTINE
DATA
  x LONG
CODE
  MESSAGE('reachable')      ! ← NOT marked unreachable
```

## Configuration

The feature can be enabled/disabled via settings:

```json
{
  "clarion.unreachableCode.enabled": true
}
```

Default: **enabled**

## Visual Indication

Unreachable code is dimmed with 40% opacity. This provides a subtle visual cue without being intrusive.

## Phase 1 Exclusions (NOT Implemented)

The following are deliberately excluded from Phase 1:

- ❌ STOP as terminator
- ❌ Constant folding (e.g., `IF FALSE`)
- ❌ Boolean evaluation
- ❌ IF/CASE reasoning
- ❌ Loop analysis
- ❌ Call graph analysis
- ❌ Type inference
- ❌ Diagnostics/warnings/errors

## Testing

Test coverage includes:
1. RETURN followed by statement → unreachable
2. Conditional RETURN → no unreachable
3. ROUTINE after RETURN → reachable
4. ROUTINE with DATA + CODE → reachable
5. Multiple procedures in same file
6. EXIT statement as terminator
7. HALT statement as terminator
8. STOP is NOT a terminator
9. Nested structures do not affect terminator
10. Comments after terminator
11. Method implementation syntax
12. LOOP with RETURN at end

Manual test file: `test-programs/unreachable-code/test-all-scenarios.clw`

## Implementation Details

### Architecture
- **Location**: `client/src/UnreachableCodeDecorator.ts`
- **Integration**: `client/src/providers/LanguageFeatureManager.ts`
- **Approach**: Linear scan of document text (no AST)
- **Performance**: O(n) where n = number of lines

### Algorithm
1. Track state per procedure/method:
   - `inProcedure`: Inside a PROCEDURE/METHOD
   - `inCode`: Inside CODE section
   - `terminated`: Hit top-level terminator
   - `structureDepth`: Nesting level (IF/CASE/LOOP)
   - `inRoutine`: Inside a ROUTINE

2. Reset `terminated` when:
   - ROUTINE begins
   - New PROCEDURE/METHOD begins

3. Mark lines as unreachable when:
   - `terminated === true`
   - `inCode === true`
   - `inRoutine === false`

### Constraints Honored
- ✅ No tokenizer modifications
- ✅ No DocumentStructure modifications
- ✅ No FoldingProvider modifications
- ✅ No finishesAt logic changes
- ✅ Linear scan only
- ✅ Per-procedure scope only
- ✅ No performance regressions

## Future Phases (Not in Scope)

Potential future enhancements:
- Phase 2: Conditional flow analysis
- Phase 3: Loop reachability
- Phase 4: Constant folding
- Phase 5: Advanced control flow

## File Changes

### New Files
- `client/src/UnreachableCodeDecorator.ts` - Main implementation
- `client/src/test/UnreachableCodeDecorator.test.ts` - Test suite
- `test-programs/unreachable-code/test-all-scenarios.clw` - Manual test file
- `docs/UNREACHABLE_CODE_PHASE1.md` - This documentation

### Modified Files
- `client/src/providers/LanguageFeatureManager.ts` - Integration
- `package.json` - Configuration setting

## Known Limitations

Phase 1 intentionally has false negatives (cases it doesn't detect):
- Code after conditional terminators
- Code after terminators inside structures
- Complex control flow scenarios

These are acceptable for Phase 1. The goal is **zero false positives**.

## Clarion-Specific Edge Cases

### ROUTINE Behavior
```clarion
! ROUTINE is always reachable, even after RETURN
MyProc PROCEDURE()
  CODE
    RETURN
    MESSAGE('unreachable')  ! ← Dimmed

MyRoutine ROUTINE
  MESSAGE('REACHABLE')      ! ← NOT dimmed
```

### Multiple Procedures
```clarion
! Each procedure analyzed independently
Proc1 PROCEDURE()
  CODE
    RETURN
    x = 1               ! ← Dimmed

Proc2 PROCEDURE()
  CODE
    y = 2               ! ← NOT dimmed (new procedure)
```

### Method Implementations
```clarion
! Methods work same as procedures
ThisWindow.Init PROCEDURE()
  CODE
    RETURN
    MESSAGE('unreachable')  ! ← Dimmed
```
