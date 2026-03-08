# Version 0.8.7 - TBD

[← Back to Changelog](../../CHANGELOG.md)

## 🎯 Overview

This release adds deep class navigation — hover, F12, and Ctrl+F12 now work for chained property and method access like `SELF.Order.RangeList.Init`, resolves properties and methods from CLASS, QUEUE, and GROUP types, fixes OMIT/COMPILE block detection that was breaking hover in large files, and handles optional `<Type Param>` parameter syntax throughout.

---

## ✨ Features & Improvements

### 🚀 New Features

- **Chained property & method navigation** (`SELF.Order.RangeList.Init`):
  - **Hover** shows declaration and implementation preview for any depth of chain
  - **F12** navigates to the class member declaration
  - **Ctrl+F12** navigates to the method implementation, using the redirection parser to find the correct `.CLW` file
  - Works for CLASS, QUEUE, and GROUP intermediate types
- **F12 on `SELF.property`** (no-parens properties now navigate correctly, not just method calls)
- **SELF/PARENT chain extraction** — assignment lines like `SELF.A &= SELF.B.Prop` correctly resolve the right-hand chain only

### 🐛 Bug Fixes

- **OMIT/COMPILE block detection** (`OmitCompileDetector`): terminator lines like `***` produced no tokens and left blocks unclosed, causing everything after to be treated as omitted — breaking hover in large real-world files (e.g. `ABFILE.CLW`)
- **Terminator inside string** — `MESSAGE('***') !***` no longer false-triggers OMIT/COMPILE terminator; string literals are stripped before terminator check
- **`<Key K>` optional parameter syntax** — angle-bracket parameters were not recognised in hover, F12, or signature help; now stripped before parsing in all four locations (hover, F12, SignatureHelp, SymbolFinderService)
- **Ctrl+F12 pattern ordering** — chained resolution now runs before Pattern 1 (which was intercepting `RangeList.Init(` and returning early)
- **2-level chain** (`SELF.Order.Field`) — regex was requiring content between SELF and the first dot; now any chain depth ≥ 2 is handled

### 📦 New Built-in Function Hovers (carried from earlier in 0.8.7)
- Added 25 built-in function hover definitions (START, FILEDIALOG, math, string, system functions)
- COMPILE/OMIT block folding support

---

## 🧪 Testing

- **All tests passing**: 535/535
- New test file: `OmitCompileDetector.test.ts` — 8 tests covering terminator edge cases
- New test file: `ChainedPropertyResolver.test.ts` — 16 tests for `extractClassName`

---

## 📊 Metrics

- **Commits since last release**: 15+
- **New files**: `ChainedPropertyResolver.ts`, `OmitCompileDetector.test.ts`, `ChainedPropertyResolver.test.ts`
- **Key files changed**: `ClassDefinitionIndexer`, `ClassMemberResolver`, `StructureFieldResolver`, `DefinitionProvider`, `ImplementationProvider`, `MethodHoverResolver`, `SignatureHelpProvider`, `SymbolFinderService`

---

## 🔄 Migration Notes

No breaking changes. Fully backward-compatible.

---

[← Back to Changelog](../../CHANGELOG.md)

