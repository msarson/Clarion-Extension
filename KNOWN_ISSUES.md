# Known Issues

## ⚠️ FILE RECORD fields in procedures

When a FILE with RECORD is declared inside a PROCEDURE, the RECORD fields appear as siblings of RECORD instead of children.

### Example:
```clarion
MyProc PROCEDURE()
MyFile FILE,DRIVER('DOS')
  RECORD
buffer  STRING(32768)
  END
END
```

**Current tree:**
- MyProc
  - FILE (MyFile)
    - RECORD
  - buffer STRING(32768)  ← Should be child of RECORD

**Expected tree:**
- MyProc
  - FILE (MyFile)
    - RECORD
      - buffer STRING(32768)

### Status
Pre-existing issue, not introduced in 0.7.5. Fields are navigable, just not properly nested in tree view.

### Workaround
Fields are still accessible and navigable, just not visually nested under RECORD in outline.

---

## ✅ FIXED in 0.7.5: Symbol Range for Method Implementations

**Status**: FIXED in hotfix-methods-container-range branch

The "Methods" container range is now properly expanded as methods are added, ensuring followCursor works correctly for all methods in a class implementation.

### What was fixed:
- Methods container range now spans from first method start to last method end
- followCursor now works for all methods, not just the first one
- Simple fix with no impact on folding or other features

Date Fixed: 2025-12-08
Version: 0.7.5
