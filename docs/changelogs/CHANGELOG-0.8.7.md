# Version 0.8.7 - 2026-03-15

[← Back to Changelog](../../CHANGELOG.md)

## 🎯 Overview

This is the largest release since the extension began. It adds **Find All References (Shift+F12)** with comprehensive scope-aware coverage, complete **Clarion INTERFACE language support** (hover, F12, Ctrl+F12, references), deep **chained property navigation** (`SELF.Order.RangeList.Init`), significant **hover display quality improvements**, and dozens of bug fixes throughout navigation, hover, and solution management.

---

## ✨ New Features

### 🔍 Find All References (Shift+F12) — Full Coverage

A comprehensive Find All References provider was built from scratch, covering:

- **SELF/PARENT member access** — scope-aware, resolves through class inheritance chains
- **Class member declarations** — finds all call sites across project files and INCLUDE files
- **Typed variable members** — `st.GetValue()` where `st` is declared as `StringTheory`
- **Chained members** — `SELF.Sort.Thumb`, `SELF.Order.RangeList.Init` (any depth)
- **MAP/MODULE procedures** — searches all project source files and MEMBER files
- **Structure fields** — QUEUE/GROUP fields with PRE:field prefix support
- **LIKE/TypeReference variables** — finds all variables declared with the same type
- **Interface methods** — finds all implementations, call sites, VIRTUAL declarations, and 3-part `Class.Interface.Method` references
- **IMPLEMENTS references** — finds all classes implementing a given interface
- **CLASS type names** — parameter types, variable types always use global scope
- **equates.clw** — treated as implicitly global in all Clarion programs
- **Overload filtering** — matches only the specific overload under the cursor
- **Scope awareness** — parameter/local/routine scope → current procedure only; module/global → all files

### 🔌 Clarion INTERFACE Full Language Support

- **Hover on interface methods** — shows `🔌 Interface method of InterfaceName` with declaration location
- **Hover on IMPLEMENTS(IfaceName)** — navigates to the INTERFACE declaration
- **F12 on interface names** in IMPLEMENTS(), 3-part method lines, and declaration lines
- **Ctrl+F12 on interface method declarations** — jumps to the implementation
- **FAR LibSrc discovery** — finds INTERFACE declarations in LibSrc INC files via redirection parser
- **3-part method support** — `Class.Interface.Method PROCEDURE` hover, F12, Ctrl+F12, and references

### 🔗 Deep Chained Property Navigation

- **Hover, F12, Ctrl+F12** for any depth of `SELF.A.B.C` chains
- Works for CLASS, QUEUE, and GROUP intermediate types
- SELF/PARENT chain extraction on assignment lines (`SELF.A &= SELF.B.Prop`)
- F12 on `SELF.property` with no parentheses (not just method calls)

### 🏷️ Typed Variable Member Navigation

- Hover, F12, Ctrl+F12, and Find All References for `obj.Method()` where `obj` is a typed variable (e.g. `st StringTheory`)

---

## 🎨 Hover Display Improvements

- **Implementation body previews removed** — hover cards now show declaration + location only, matching the style of TypeScript/C#/Rust extensions
- **Class property label** — `🔷 Class property of ClassName` instead of "Global variable"
- **Interface method label** — `🔌 Interface method of InterfaceName` instead of "Global procedure"
- **Method implementation context** — 3-part methods show owning class and interface: `OwnerClass.Interface.Method`
- **Class type hover cleaned up** — shows `ClassName — CLASS, TYPE · 📦 Defined in File at line N` with F12 hint; removed "Missing Constants", "Suggested Values", and "Part of N indexed classes" noise
- **F12 suppressed on declaration line** — no navigation hint shown when already at the declaration
- **Ctrl+F12 suppressed on implementation line** — guard prevents redundant hint on method implementations
- **SELF.X false match fixed** — cursor on RHS variable after `&=` no longer triggers SELF member hover

### 📦 Built-in Function Hovers (25 new)
- START, FILEDIALOG, FILEDIALOGA, trigonometry, logarithm, string, and system utility functions

---

## 🐛 Bug Fixes

### Navigation (F12 / Ctrl+F12)
- **CLASS type names in parameter lists** now navigate correctly via ClassDefinitionIndexer; `mapProcImpl` no longer intercepts type names inside PROCEDURE signatures
- **Ctrl+F12 for dotted method calls** without parentheses now works
- **Typed variable F12 overload resolution** correctly passes `paramCount`
- **Ctrl+F12 typed variable** passes `declarationFile` not `moduleFile`
- **SELF.X false match on RHS** — cursor position guard in `resolveFieldAccess`
- **3-part method class name extraction** — regex fixed to handle `Class.Interface.Method` (was only handling `Class.Method`)
- **MethodImplementation guard** — declaration fallback no longer fires on implementation lines

### Find All References
- CLASS body context checked before plain symbol search — prevents wrong scope detection
- Always includes the declaration in results
- False positive member reference matching eliminated
- Split-chain StructureField tokens matched for 4+ level chains
- MODULE file correctly resolved from CLASS declaration for chain references
- MAP INCLUDE INC file included in procedure references search
- MEMBER file procedures search all project files
- MAP shorthand procedure declarations found correctly
- Overload-specific filtering — matches the exact signature under cursor
- Typed-variable dotted word reconstructed correctly

### Hover
- **OMIT/COMPILE block detection** — terminator lines (`***`) no longer leave blocks unclosed in large files
- **Terminator inside string** — `MESSAGE('***')` no longer false-triggers OMIT terminator
- **`<Key K>` optional parameter syntax** — angle-bracket parameters now recognised in hover, F12, SignatureHelp, SymbolFinderService
- **Class type name in global variable hover** — was showing "UNKNOWN", now shows correct type
- **SELF.Q &= Q** — second Q no longer falsely matched as SELF.Q

### Solution Management
- **Settings persistence** — full settings saved in global history; prompts when re-init is incomplete
- **Workspace switching** — correctly switches workspace when opening a solution in a different folder

---

## 🧪 Testing

- **597 passing**, 22 pending
- New test suites: `OmitCompileDetector`, `ChainedPropertyResolver`, `ReferencesProvider`, `SolutionBased.CrossFileScope`, `HoverProvider.Refactor`, `SymbolFinderService`

---

## 📊 Metrics

- **Commits since last release**: 60+
- **New providers/services**: `ReferencesProvider`, `ChainedPropertyResolver`, `OmitCompileDetector`, `ProcedureCallDetector`
- **Key files changed**: `DefinitionProvider`, `ReferencesProvider`, `HoverProvider`, `HoverFormatter`, `MethodHoverResolver`, `VariableHoverResolver`, `ClassMemberResolver`, `StructureFieldResolver`, `TokenCache`, `SolutionManager`

---

## 🔄 Migration Notes

No breaking changes. Fully backward-compatible.

---

[← Back to Changelog](../../CHANGELOG.md)

