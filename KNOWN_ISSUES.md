# Known Issues

## ✅ FIXED in 0.7.5: Symbol Range for Method Implementations

**Status**: FIXED in hotfix-methods-container-range branch

The "Methods" container range is now properly expanded as methods are added, ensuring followCursor works correctly for all methods in a class implementation.

### What was fixed:
- Methods container range now spans from first method start to last method end
- followCursor now works for all methods, not just the first one
- Simple fix with no impact on folding or other features

Date Fixed: 2025-12-08
Version: 0.7.5
