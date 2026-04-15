# Version 0.8.8 - 2026-04-12

[← Back to Changelog](../../CHANGELOG.md)

## 🎯 Overview

A major feature release adding **Rename Symbol (F2)**, **Document Highlight**, and **Workspace Symbol Search (Ctrl+T)**, alongside significant bug fixes for local class instance resolution, `!!!` doc comment hover, overloaded procedure diagnostics, Find All References on CLASS labels, and cross-file `SELF.Method()` hover and navigation.

---

## ✨ New Features

### ✏️ Rename Symbol (F2)
- Rename any user-defined symbol across the entire workspace in one step
- Delegates to the References provider for scope-aware coverage — local/module/global variables, procedures, class members via `SELF`/`PARENT` chains
- `prepareRename` validates the position before the rename dialog opens and rejects Clarion keywords and built-in types
- Library/read-only files are protected — symbols declared in `.inc` files outside the project cannot be renamed

### 🔦 Document Highlight
- Pressing on a symbol highlights all occurrences in the current file

### 🔎 Workspace Symbol Search (Ctrl+T)
- Search for any procedure, class, or label across all files in the solution

---

## 🐛 Bug Fixes

### Hover & Go to Definition for Local Class Instances
- **Hover and Go to Definition for local class instances inside `MethodImplementation` scopes** now correctly resolves variables declared in the parent `GlobalProcedure`'s data section
- In Clarion, local classes declared in a `PROCEDURE`'s data section (e.g. `Kanban CLASS(KanbanWrapperClass)`) have their method implementations tokenized as flat, independent `MethodImplementation` scopes with no parent link — yet at runtime they share the parent procedure's local variable stack
- **Hover** (`SymbolFinderService.findLocalVariable`): when a variable isn't found in the method's own scope, the resolver now also searches all `GlobalProcedure` data sections in the file
- **Go to Definition** (`DefinitionProvider`): same fallback added

### `!!!` Doc Comments in Hover
- `formatVariable` in `HoverFormatter` was not calling `DocCommentReader` at all — doc comments above local declarations were silently ignored
- `DocCommentReader.parseXml` now handles unclosed `<summary>` tags and plain `!!!` text with no XML tags — mirrors Clarion IDE's forgiving behaviour
- The scope label in the hover card now uses a contextual noun derived from the declaration type: `CLASS(...)` → "class", `GROUP` → "group", `QUEUE` → "queue", etc.

### Overloaded Procedure Diagnostics
- Fixed false-positive diagnostic "Procedure returns X but all RETURN statements are empty" for overloaded procedures — the validator now matches implementations by parameter signature, not just name ([#44](https://github.com/msarson/Clarion-Extension/issues/44))

### Find All References on CLASS Labels
- FAR on a CLASS declaration label (e.g. `ThisWindow` in `ThisWindow CLASS(WindowManager)`) was returning the CLASS *keyword* column for every CLASS declaration instead of actual references — caused by `varName` extraction using `split(' ')[0]` on `"CLASS (ThisWindow)"`
- Method implementation headers (`ThisWindow.Init PROCEDURE`, etc.) are now included — token scan expanded to full file when a CLASS label is detected

### Go to Implementation / Hover for `SELF.Method()` Cross-File
- `SELF.Method()` on a method declared in an external `.inc` file and implemented in the corresponding `.clw` file was only finding the declaration
- `ImplementationProvider` now resolves the member declaration first to obtain the declaration file, then uses the `.inc` → `.clw` redirection fallback
- `MethodHoverResolver` derives the `.clw` filename from `memberInfo.file` for cross-file search (fixes both `SELF.Method()` and `PARENT.Method()` hover)
- Hover now also shows the implementation signature as a code snippet alongside the file/line reference

---

[← Back to Changelog](../../CHANGELOG.md)
