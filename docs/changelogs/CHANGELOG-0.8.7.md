# Version 0.8.7 - TBD

[← Back to Changelog](../../CHANGELOG.md)

## 🎯 Overview

This release adds 25 new built-in function hover definitions and fixes COMPILE/OMIT directive block folding.

---

## ✨ Features & Improvements

### 🚀 New Features
- **Added 25 new built-in function hover definitions**: Added comprehensive hover documentation for commonly used Clarion built-in functions including:
  - File functions: START, FILEDIALOG, FILEDIALOGA, DIRECTORY, DUPLICATE
  - Math functions: ABS, ACOS, ASIN, ATAN, COS, SIN, TAN, LOG10, LOGE, RANDOM
  - String functions: CENTER, CHANGE, DEFORMAT
  - System functions: ACCEPTED, ALERT, BUFFER, BYTES, DATE, NUMERIC, REJECTCODE
- **COMPILE/OMIT block folding**: COMPILE and OMIT directive blocks now create foldable regions in the editor, making it easier to navigate conditional compilation blocks

### 🐛 Bug Fixes
- Fixed COMPILE directive blocks not creating foldable regions in the editor
- Fixed OMIT directive blocks not creating foldable regions in the editor

### ⚡ Performance Improvements
- Leveraged existing OmitCompileDetector utility for efficient block detection

---

## 🧪 Testing

- **All tests passing**: 498/498
- **Test coverage**: Maintained for all new features

---

## 📊 Metrics

- **Commits**: 8
- **Files changed**: 3
- **New files**: 1 (test-compile-folding.clw test file)
- **Lines added**: ~100
- **Lines removed**: ~2

---

## 🔄 Migration Notes

No breaking changes. This is a fully backward-compatible release.

---

[← Back to Changelog](../../CHANGELOG.md)
