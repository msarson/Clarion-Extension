# Version 0.8.6 - 2026-01-12

[← Back to Changelog](../../CHANGELOG.md)

## 🎯 Overview

This release focuses on **cross-project navigation performance**, **routine support improvements**, and **solution view enhancements**. Major highlights include 50-70% faster Ctrl+F12 navigation, full support for routines with namespace prefixes, and comprehensive solution build management.

---

## ✨ Major Features

### 🚀 Cross-Project Navigation Performance
- **CrossFileCache implementation** - 50-70% faster Ctrl+F12 navigation
  - First navigation: 2-4 seconds (reads + caches)
  - Subsequent navigations: **<100ms** (cache hits)
  - Automatic cache invalidation on file edits
- Cache shared between HoverProvider and ImplementationProvider
- Applied to MapProcedureResolver for MODULE file lookups

### 🎯 Routine Support Enhancements
- **Full support for namespace prefixes** (`:` and `::`)
  - `DO DumpQue::SaveQState` - hover and Ctrl+F12 now work
  - `DO Namespace:RoutineName` - fully supported
- **New RoutineHoverResolver** - Dedicated routine hover with code preview
- Routine preview stops at next routine/procedure (matches procedure behavior)
- Added `DO_ROUTINE` and `ROUTINE_LABEL` patterns to ClarionPatterns

### 🔧 Navigation Fixes
- **FUNCTION declarations** - Ctrl+F12 now works for cross-project FUNCTION procedures
- **Procedures without parameters** - Hover correctly identifies `PROCEDURE,DLL` vs methods
- **MAP procedure declarations** - Regex now handles procedures with and without parentheses

### 🎨 Hover Improvements
- **Method hover priority** - Methods named like keywords (e.g., `MESSAGE`) now show method info instead of keyword help
- **Routine hover** - Shows full routine name including namespace prefix
- **Consistent previews** - All previews (procedures/methods/routines) stop at next declaration

### 🏗️ Solution View Enhancements
- **Dependency-aware build order** - Topological sort ensures projects build in correct dependency order
- **Application sort toggle** - Switch between Solution Order and Build Order
- **Build progress indicators**:
  - Spinning sync icon for currently building project
  - Build counter on solution node (e.g., "Building 2/5")
  - Building icon on applications
- **Batch UpperPark commands**:
  - Import All Applications
  - Export All Applications
  - Show All Differences
- **New context menu commands**:
  - Build Project
  - Generate + Build Project
  - Copy Path
  - Open Containing Folder
  - Open in Clarion IDE
- **Generate All/Build All** - Build multiple applications in dependency order
- Auto-sort applications in build order before building

### 🐛 Bug Fixes
- Fixed folding for WINDOW structures (no longer includes next routine)
- Fixed structure keywords followed by colon not being tokenized as structures
- Fixed Ctrl+P scanning wrong workspace directories
- Fixed redirection path resolution with URL-encoded characters
- Fixed commented INCLUDE/MODULE statements generating links
- Removed automatic parent directory from search paths
- Fixed project name display in build completion messages

### ⚡ Performance Improvements
- Document opening is now instant (link resolution doesn't block)
- Reduced file I/O through CrossFileCache implementation
- Eliminated duplicate code paths in cross-file resolution

---

## 🧪 Testing

- **All tests passing**: 498/498
- **Test coverage**: Maintained for all new features
- Comprehensive testing of namespace prefix support
- Cross-project navigation verified with DLL references

---

## 📊 Metrics

- **Commits**: 47
- **Files changed**: 11
- **New files**: 1 (RoutineHoverResolver.ts)
- **Lines added**: 293
- **Lines removed**: 110
- **Performance**: 50-70% improvement in cross-project navigation

---

## 🔄 Migration Notes

No breaking changes. All features are backward compatible.

---

[← Back to Changelog](../../CHANGELOG.md)
