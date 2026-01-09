# Version 0.8.5 - 2026-01-09

[← Back to Changelog](../../CHANGELOG.md)

## 🎯 Overview

Critical hotfix release addressing folding provider issues with APPLICATION and nested MENU structures. This release ensures proper code folding for window definitions with complex nested UI controls.

---

## 🐛 Bug Fixes

### Folding Provider Fixes

**Fixed APPLICATION structure recognition**
- APPLICATION keyword was not recognized as a structure type
- Added APPLICATION and MENUBAR to `isDeclarationStructure` check in tokenizer
- APPLICATION structures now fold correctly from declaration to END statement

**Fixed nested MENU structure folding**
- Nested MENU structures inside WINDOW/APPLICATION were not being recognized
- Removed arbitrary 50-column indentation limit that prevented deep nesting
- Nested structures now fold correctly at any indentation level
- Only restriction: labels must be at column 0 (per Clarion specification)

**Impact:**
- Window definitions with complex menu hierarchies now fold properly
- Improved code navigation in large window/application definitions
- Better support for template-generated code with deep indentation

---

## 🧪 Testing

- **New Tests**: 77 lines of comprehensive folding tests added
- Added test cases for WINDOW/APPLICATION with nested MENU structures
- Test files added: `window-folding-test.clw`, `simple-window-test.clw`, `nested-menu-test.clw`
- **All tests passing**: 495/495

---

## 📊 Metrics

- **Commits**: 2 (hotfix commits)
- **Files changed**: 5
- **Lines added**: 173
- **Lines removed**: 10
- **Test coverage**: Maintained at 100% for folding provider

---

## 🔧 Technical Details

### Changes in ClarionTokenizer.ts
1. Added `APPLICATION` to structure keyword recognition list
2. Added `MENUBAR` to structure keyword recognition list  
3. Removed `if (column > 50)` restriction that blocked deeply nested structures

### Breaking Changes
- None

### Migration Notes
- No migration needed - existing code works better automatically

---

[← Back to Changelog](../../CHANGELOG.md)
