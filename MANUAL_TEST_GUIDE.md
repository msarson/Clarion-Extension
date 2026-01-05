# Semantic Tokens Manual Testing Guide

## Quick Start
1. **Compile**: `npm run compile` ✅ (Already done)
2. **Launch Extension Host**: Press `F5` in VS Code
3. **Open Test File**: `test-programs/scope-test-suite/UpdatePYAccount_IBSCommon.clw`

## What to Verify

### 1. END Keywords and Period Terminators Match Their Structure Colors
Check that each END keyword **and period terminator** has the **same color** as its opening structure keyword:

**Note**: Clarion supports two ways to close structures:
- `END` keyword (e.g., `GROUP ... END`)
- Period `.` terminator (e.g., `GROUP ... .`)

Both should inherit the color of their parent structure.

| Lines | Structure | Expected Behavior |
|-------|-----------|-------------------|
| 30-34 | `GROUP` ... `END` | GROUP and END should be same color |
| 35-37 | `VIEW(IBSDPC)` ... `END` | VIEW and END should be same color |
| 38-41 | `VIEW(BMBankAccount)` ... `END` | VIEW and END should be same color |
| 42-46 | `QUEUE` ... `END` | QUEUE and END should be same color |
| 47-52 | `QUEUE` ... `END` | QUEUE and END should be same color |
| 164-167 | `QUEUE` ... `END` | QUEUE and END should be same color |
| 55-161 | `WINDOW` ... `END` | WINDOW and END should be same color |

### 2. Nested Structures (WINDOW with SHEET/TAB)
Lines 55-161 contain a WINDOW with nested SHEET/TAB structures:
- WINDOW at line 55 should close at line 161
- Each SHEET within should have matching colors for SHEET...END
- Each TAB within should have matching colors for TAB...END
- All structures should fold properly

### 3. Folding Functionality
Click the fold icons (▼) in the gutter and verify:
- ✅ GROUP structures fold (line 30)
- ✅ VIEW structures fold (lines 35, 38)
- ✅ QUEUE structures fold (lines 42, 47, 164)
- ✅ WINDOW structure folds (line 55)
- ✅ SHEET structures fold (within WINDOW)
- ✅ TAB structures fold (within SHEET)

### 4. Test Different Color Themes
Try multiple themes to ensure semantic tokens work universally:
- **Dark+ (default dark)**
- **Light+ (default light)**
- **Monokai**
- **Solarized Dark**

Command: `Ctrl+K Ctrl+T` → Select theme

## Expected Results

### Before (TextMate Grammar Only)
- All END keywords had **same color** (generic keyword color)
- Period terminators had **delimiter color** (different from structures)
- No visual distinction between `END` closing GROUP vs WINDOW vs QUEUE
- Visual inconsistency: `GROUP` is blue, but `END` is generic purple

### After (Semantic Tokens Enabled)
- Each `END` and `.` inherits color from its **parent structure**:
  - `GROUP ... END` or `GROUP ... .` → both GROUP and its terminator same color (e.g., blue)
  - `VIEW ... END` or `VIEW ... .` → both VIEW and its terminator same color (e.g., cyan)
  - `QUEUE ... END` or `QUEUE ... .` → both QUEUE and its terminator same color (e.g., cyan)
  - `WINDOW ... END` or `WINDOW ... .` → both WINDOW and its terminator same color (e.g., magenta)
  - `SHEET ... END` or `SHEET ... .` → both SHEET and its terminator same color (e.g., magenta)
  - `TAB ... END` or `TAB ... .` → both TAB and its terminator same color (e.g., magenta)

## Known Limitations
- Orphaned END keywords (no matching structure) remain generic color
- TextMate grammar still provides base coloring for all other tokens
- Semantic tokens only override when explicitly provided

## Troubleshooting

### If colors don't change:
1. Check Output panel → "Clarion Language Server"
2. Look for semantic token provider initialization
3. Reload window: `Ctrl+Shift+P` → "Developer: Reload Window"

### If folding doesn't work:
1. Check that structures are properly recognized (unit tests passing ✅)
2. Verify DocumentStructure sets `finishesAt` for END tokens
3. Check server logs for tokenization errors

### If performance issues:
1. Semantic token generation should be <5ms
2. Uses cached tokens from incremental tokenization
3. Check CPU usage in VS Code process manager

## Success Criteria
✅ All 11 unit tests passing (7 Structure Parent + 4 Period Terminator tests)
✅ Compilation successful
✅ Visual verification: END and period colors match structure keywords
✅ Folding works for all structure types
✅ No performance degradation
✅ Works across multiple color themes

## Files Modified
- `server/src/providers/ClarionSemanticTokensProvider.ts` (new)
- `server/src/server.ts` (semantic tokens registration)
- `server/src/DocumentStructure.ts` (parent relationship fix)
- `server/src/tokenizer/TokenPatterns.ts` (pattern fixes)
- `server/src/ClarionTokenizer.ts` (structure recognition fix)
- `package.json` (semantic token contributions)

## Next Steps After Verification
1. If successful → Document in CHANGELOG.md
2. Consider merging to main or keeping as experimental branch
3. Gather user feedback on visual appearance
4. Consider extending to other keyword contexts (IF/END, LOOP/END, etc.)
