# Testing Checklist - Unreachable Code Detection Phase 1

## Pre-Testing Setup

### 1. Build the Extension
```bash
npm run compile
```
✅ Expected: No compilation errors

### 2. Verify Branch
```bash
git branch --show-current
```
✅ Expected: `feature/unreachable-code-phase1`

## Manual Testing Steps

### Test 1: Open Test File
1. Open VS Code
2. Open file: `test-programs/unreachable-code/test-all-scenarios.clw`
3. Wait 500ms for decorations to apply

**Expected Results:**
- Lines after `RETURN` in `SimpleReturn` should be dimmed
- Lines in `ConditionalReturn` should NOT be dimmed
- ROUTINE content should NOT be dimmed
- Each test scenario should behave as documented in comments

### Test 2: Real-Time Updates
1. Open a new `.clw` file
2. Type:
   ```clarion
   MyProc PROCEDURE()
     CODE
       RETURN
       MESSAGE('test')
   ```
3. Observe the MESSAGE line

**Expected Results:**
- MESSAGE line should appear dimmed (40% opacity)
- Dimming should apply immediately (within 500ms)

### Test 3: Configuration Toggle
1. Open VS Code Settings (Ctrl+,)
2. Search for "unreachable code"
3. Uncheck "Clarion: Unreachable Code > Enabled"
4. Check the test file

**Expected Results:**
- All dimming should disappear
- Re-enabling should restore dimming

### Test 4: ROUTINE Behavior
1. Create a new file:
   ```clarion
   TestProc PROCEDURE()
     CODE
       RETURN
       MESSAGE('unreachable in proc')

   MyRoutine ROUTINE
     MESSAGE('reachable in routine')
   ```

**Expected Results:**
- First MESSAGE should be dimmed
- Second MESSAGE (in ROUTINE) should NOT be dimmed

### Test 5: Nested Structures
1. Create a new file:
   ```clarion
   TestProc PROCEDURE()
     CODE
       IF x = 1 THEN
         RETURN
       END
       MESSAGE('still reachable')
   ```

**Expected Results:**
- MESSAGE should NOT be dimmed (RETURN was inside IF)

### Test 6: Multiple Terminators
Test with EXIT:
```clarion
TestProc PROCEDURE()
  CODE
    EXIT
    MESSAGE('unreachable')
```

Test with HALT:
```clarion
TestProc PROCEDURE()
  CODE
    HALT
    MESSAGE('unreachable')
```

**Expected Results:**
- Both MESSAGE lines should be dimmed

### Test 7: STOP is NOT a Terminator
```clarion
TestProc PROCEDURE()
  CODE
    STOP('debug')
    MESSAGE('reachable')
```

**Expected Results:**
- MESSAGE should NOT be dimmed

### Test 8: Multiple Procedures
```clarion
Proc1 PROCEDURE()
  CODE
    RETURN
    MESSAGE('unreachable in Proc1')

Proc2 PROCEDURE()
  CODE
    MESSAGE('reachable in Proc2')
```

**Expected Results:**
- First MESSAGE dimmed
- Second MESSAGE NOT dimmed

### Test 9: Method Implementation
```clarion
ThisWindow.Init PROCEDURE()
  CODE
    RETURN
    MESSAGE('unreachable')
```

**Expected Results:**
- MESSAGE should be dimmed

### Test 10: Large File Performance
1. Create a file with 1000+ lines
2. Add RETURN + unreachable code at line 500
3. Observe decoration speed

**Expected Results:**
- Decorations apply within 500ms
- No UI lag or freezing
- CPU usage remains normal

## Automated Tests

### Run Test Suite
```bash
npm test
```

**Expected Results:**
- All 12 tests should pass
- No test failures
- No console errors

## Edge Cases to Verify

### ✅ Comments After Terminator
```clarion
CODE
  RETURN
  ! This comment is unreachable
  MESSAGE('also unreachable')
```
Both comment and code should be dimmed.

### ✅ Blank Lines After Terminator
```clarion
CODE
  RETURN
  
  
  MESSAGE('unreachable')
```
MESSAGE should be dimmed (blank lines ignored).

### ✅ ROUTINE with DATA+CODE
```clarion
CODE
  RETURN

MyRoutine ROUTINE
DATA
  x LONG
CODE
  MESSAGE('reachable')
```
ROUTINE content should NOT be dimmed.

### ✅ Single-Line IF
```clarion
CODE
  IF x = 1 THEN RETURN
  MESSAGE('reachable')
```
MESSAGE should NOT be dimmed (conditional RETURN).

## Negative Testing (Should NOT Dim)

### ❌ Conditional Terminator
```clarion
IF condition THEN
  RETURN
END
MESSAGE('reachable')
```

### ❌ Loop with RETURN
```clarion
LOOP
  IF done THEN
    RETURN
  END
END
MESSAGE('reachable')
```

### ❌ CASE with RETURN
```clarion
CASE x
OF 1
  RETURN
END
MESSAGE('reachable')
```

### ❌ STOP Statement
```clarion
STOP('debug')
MESSAGE('reachable')
```

## Performance Testing

### CPU Usage
1. Open large file (5000+ lines)
2. Make small edits
3. Monitor CPU usage

**Expected:**
- CPU usage < 5% during editing
- No spikes or hangs

### Memory Usage
1. Open 10+ Clarion files
2. Monitor memory usage

**Expected:**
- Memory increase < 50MB total
- No memory leaks

### Responsiveness
1. Type rapidly in a file
2. Observe decoration updates

**Expected:**
- No typing lag
- Decorations update smoothly
- No visual glitches

## Cross-Platform Testing

### Windows
✅ Primary platform

### macOS (if available)
- Test file opening
- Test decoration rendering
- Test configuration

### Linux (if available)
- Test file opening
- Test decoration rendering
- Test configuration

## File Type Testing

Test with all Clarion file extensions:
- ✅ .clw
- ✅ .inc
- ✅ .equ
- ✅ .eq
- ✅ .int
- ✅ .txa
- ✅ .txd

**Expected:**
- Feature works with all file types
- No extension-specific issues

## Configuration Testing

### Enable/Disable
1. Enable: `"clarion.unreachableCode.enabled": true`
2. Verify dimming appears
3. Disable: `"clarion.unreachableCode.enabled": false`
4. Verify dimming disappears

### Workspace Settings
1. Add to workspace settings
2. Verify override works
3. Test different values per workspace

## Integration Testing

### With Other Decorators
1. Enable prefix highlighting
2. Enable comment highlighting
3. Enable unreachable code detection
4. Verify all work together without conflict

### With Language Server
1. Open a file in a solution
2. Verify LSP features still work:
   - Go to Definition
   - Hover
   - Symbol search
3. Verify decorations don't interfere

### With Formatting
1. Format a document (Shift+Alt+F)
2. Verify decorations remain correct after formatting

## Error Handling

### Invalid Clarion Syntax
1. Create file with syntax errors
2. Verify no crashes
3. Verify graceful degradation

### Very Large Files
1. Open 10,000+ line file
2. Verify no timeout errors
3. Verify no stack overflow

### Rapid File Switching
1. Quickly switch between multiple files
2. Verify decorations update correctly
3. No stale decorations

## Regression Testing

### Existing Features
Verify these still work:
- ✅ Code folding
- ✅ Symbol outline
- ✅ Go to definition
- ✅ Hover tooltips
- ✅ Code formatting
- ✅ Syntax highlighting
- ✅ Prefix highlighting
- ✅ Comment highlighting

## Documentation Review

### ✅ Check Documentation
- [ ] IMPLEMENTATION_SUMMARY.md is accurate
- [ ] docs/UNREACHABLE_CODE_PHASE1.md is complete
- [ ] Code comments are clear
- [ ] Examples are correct

## Sign-Off Checklist

- [ ] All automated tests pass
- [ ] All manual tests completed
- [ ] No performance regressions
- [ ] No existing features broken
- [ ] Documentation reviewed
- [ ] Edge cases validated
- [ ] Configuration works
- [ ] Cross-file types tested
- [ ] Error handling verified
- [ ] Integration tested

## Notes for Testers

### Known Limitations (By Design)
- Does not detect unreachable code after conditional RETURN
- Does not analyze loop reachability
- Does not perform constant folding
- These are acceptable for Phase 1

### Visual Appearance
- Dimming is subtle (40% opacity)
- Works with all color themes
- Does not affect editor performance

### Reporting Issues
When reporting issues, include:
1. Code sample that shows the problem
2. Expected behavior
3. Actual behavior
4. VS Code version
5. Extension version
6. Operating system

---

## Test Completion

Date: _________________
Tester: _________________
Result: ☐ Pass  ☐ Fail
Notes: _________________
