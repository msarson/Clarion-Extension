# Settings Reference

[← Back to Documentation Home](../../README.md)

Complete reference for all Clarion Extension settings, generated from the extension manifest for **v1.0.4**.

Open settings with `Ctrl+,` and search for `clarion`, or edit `settings.json` directly.

> **Managed automatically:** several settings (`clarion.currentSolution`, `clarion.solutions`, `clarion.activeVersion`, `clarion.activePropertiesFile`, `clarion.versionMigrated`, `clarion.solutionVersionMemoryBackfilled`) are written by the extension as you open solutions and pick versions. You rarely need to edit them by hand; the internal one-shot flags should not be edited at all.

---

## Language Features

| Setting | Default | Description |
|---|---|---|
| `clarion.referencesCodeLens.enabled` | `true` | Shows the `N references` CodeLens above each procedure, method implementation, CLASS, and ROUTINE. Each lens runs a scoped Find-All-References in the background for an exact count. Disable if you prefer no lenses. |
| `clarion.unreachableCode.enabled` | `true` | Visually dims unreachable code (after an unconditional `RETURN`, `EXIT`, or `HALT` at top execution level). |
| `clarion.prefixHighlighting.enabled` | `true` | Prefix highlighting for Clarion variables (`PRE:Field` coloring). |
| `clarion.highlighting` | — | Fine-grained highlighting settings for Clarion code elements (object). |
| `clarion.procedurePrototypeStyle` | `"keyword"` | Prototype style when the extension inserts procedure declarations into MAP/MODULE structures: `keyword` (`PROCEDURE(...)`) or `shorthand`. |
| `clarion.maxNumberOfProblems` | `100` | Maximum number of problems the language server reports per file. |

## Diagnostics

Every check can be turned off on its own and reported at the severity you choose. A change takes effect as you make it — no reload.

| Setting | Default | Description |
|---|---|---|
| `clarion.diagnostics.enabled` | `true` | The master switch. Turn it off and nothing is reported, whatever the individual checks say. |
| `clarion.diagnostics.<check>.enabled` | see below | Turns one check off or on. |
| `clarion.diagnostics.<check>.severity` | `"default"` | Reports one check as `error`, `warning`, `information` or `hint`. `default` keeps the check's own level, so a check that is useful but not blocking can be demoted, and one your team treats as a build rule promoted. |

### The checks

`<check>` is one of the 24 ids below — for example `"clarion.diagnostics.undeclaredVariables.severity": "error"`, or `"clarion.diagnostics.unicodeCharacters.enabled": false`.

| Check | Default | What it reports |
|---|---|---|
| `undeclaredVariables` | on | Raises a Warning on a bare identifier used in executable code — an assignment target or an operand in a condition or expression — that cannot be resolved to any declaration in the current file, including a PROGRAM's own main CODE section. |
| `unresolvedProcedureCalls` | **off** | Raises a Warning on a call to a procedure whose name is declared nowhere the extension can see — not in this file's MAP or its MAP includes, not in the MEMBER parent's MAP or the MODULE blocks of the includes those MAPs pull in (the same places Go to Definition looks), and not in the solution's declaration index. |
| `indistinguishablePrototypes` | on | Raises a Warning when two procedure declarations within the same scope (CLASS / INTERFACE / MAP) are indistinguishable to the Clarion compiler — both callable with zero arguments via defaults, identical parameter shapes, or duplicates where `*` is implicit for complex types. |
| `unterminatedStructures` | on | Reports a structure (IF, LOOP, CASE, GROUP, CLASS, WINDOW and the rest) with no closing END or period. |
| `omitCompileBlocks` | on | Reports an OMIT or COMPILE block whose terminator string never appears. |
| `fileDeclarations` | on | Reports a FILE declaration missing its DRIVER attribute or its RECORD section. |
| `caseStructures` | on | Reports an OROF in a CASE that is not preceded by an OF. |
| `executeStructures` | on | Reports an EXECUTE whose expression is a string literal rather than a numeric value. |
| `returnStatements` | on | Reports a procedure declared with a return type that has no RETURN statement, or only empty ones. |
| `classProperties` | on | Reports a QUEUE declared directly as a CLASS property, or nested inside another QUEUE, where a QUEUE reference (&QUEUE) is required. |
| `discardedReturnValues` | on | Reports a call whose return value is discarded when the procedure or method is not declared with the PROC attribute. Covers plain calls and method calls. |
| `cycleBreakOutsideLoop` | on | Reports CYCLE or BREAK outside any LOOP or ACCEPT, and a CYCLE or BREAK label that names no enclosing loop. |
| `reservedKeywordLabels` | on | Reports a label that is a reserved Clarion keyword. |
| `unicodeCharacters` | on | Reports a character that no Windows ANSI code page can represent, which would corrupt the file for the Clarion compiler. |
| `attributeApplicability` | on | Reports an attribute used on a control or structure it does not apply to, for example RESIZE on a BUTTON. |
| `itemizeBlocks` | on | Reports a declaration other than an EQUATE inside an ITEMIZE block. |
| `byRefArguments` | on | Reports a literal passed to a by-reference (*TYPE) parameter. |
| `viewProjectFields` | on | Reports a PROJECT field in a VIEW or JOIN that the projected FILE does not declare. |
| `missingIncludes` | on | Reports a type used in the file whose declaring include file is not included. |
| `missingConstants` | on | Reports a type whose declaring include file needs a project DEFINE constant the project does not set. |
| `missingMapDeclarations` | on | Reports a procedure implementation with no MAP prototype, and a prototype whose signature does not match its implementation. |
| `missingImplementations` | on | Reports a MAP prototype with no implementation. |
| `privateProcedureCalls` | on | Reports a call to a PRIVATE procedure from outside the module that declares it. |
| `interfaceImplementation` | on | Reports a CLASS that implements an INTERFACE but leaves one of its methods unimplemented. |

## Build

| Setting | Default | Description |
|---|---|---|
| `clarion.saveBeforeBuild` | `true` | Save all unsaved files before any build, so the compiler always sees the latest content. |
| `clarion.build.revealOutput` | `"never"` | When to show the build output terminal: `never`, `always`, or `onError`. |
| `clarion.build.showInOutputPanel` | `false` | Also mirror build output into the Output panel (in addition to the Problems panel). |
| `clarion.build.logFilePath` | `""` | Custom path for the build output log. Empty = solution directory. |
| `clarion.build.preserveLogFile` | `false` | Keep `build_output.log` after the build completes. |
| `clarion.startupProject` | `""` | GUID of the project run by **Ctrl+F5** (Run Without Debugging). Unset = the project containing the current file. Usually set via right-click → *Set as Startup Project* in the Solution View. |
| `clarion.configuration` | `""` | Selected build configuration (Debug/Release/custom). Usually set via the status bar or `Clarion: Set Configuration`. |

## Paste as Clarion String

| Setting | Default | Description |
|---|---|---|
| `clarion.pasteAsString.lineTerminator` | `"space"` | How pasted lines are joined: `space`, `crlf` (`<13,10>`), or `none`. |
| `clarion.pasteAsString.trimLeadingWhitespace` | `true` | Strip leading whitespace from each pasted line — recommended when pasting indented code. |

## File Resolution & Quick Open

| Setting | Default | Description |
|---|---|---|
| `clarion.defaultLookupExtensions` | `[".clw", ".inc", ".equ", ".eq"]` | Extensions used for document links and hover previews for files outside any project. |
| `clarion.fileSearchExtensions` | `[".clw", ".inc", ".equ", ".eq"]` | Extensions searched by `Clarion: Quick Open` (redirection-aware Ctrl+P). |

## Solution & Version Management

| Setting | Default | Description |
|---|---|---|
| `clarion.solutionFile` | `""` | Path to the Clarion solution (`.sln`) file. |
| `clarion.currentSolution` | `""` | Path of the currently open solution (managed by the extension). |
| `clarion.solutions` | `[]` | Per-solution settings memory (managed by the extension). |
| `clarion.version` / `clarion.activeVersion` | `""` | Selected Clarion version (e.g. `Clarion 11.1`). `activeVersion` is user-scoped so version-derived state (libsrc paths, redirection, macros) works without an open solution. |
| `clarion.propertiesFile` / `clarion.activePropertiesFile` | `""` | Path to the `ClarionProperties.xml` backing the selected version. |
| `clarion.enableLocalSlnFallback` | `true` | Parse the `.sln` locally as a fast fallback when the language server isn't ready yet. |
| `clarion.firstFetchTimeoutMs` | `2500` | Timeout for the first solution fetch after activation. |

## Snippets

| Setting | Default | Description |
|---|---|---|
| `clarion-extensions.spacing.className` | `4` | Spacing between ClassName and `CLASS` in snippets. |
| `clarion-extensions.spacing.methodName` | `2` | Spacing between MethodName and `PROCEDURE` in snippets. |

## Logging, Tracing & Telemetry

| Setting | Default | Description |
|---|---|---|
| `clarion.log.level` | `"error"` | How much the extension logs: `error` (the default) logs only errors, `warn` adds missing settings and degraded fallbacks, `info` a running trace, `debug` everything. The lines go to the *Clarion Extension (Client)* and *Clarion Language Server* output channels and to `.clarion-debug/client.log` in the workspace. Raise it while reproducing a problem, then set it back; it applies to both processes at once, with no reload. The command **Clarion: Set Log Level** changes it from the palette. |
| `clarion.log.performance.enabled` | `false` | **Support/diagnostic switch.** Emits performance-timing lines (startup phases, index builds, per-validator timings, slow-request attribution) to the *Clarion Language Server* output channel. The instrumentation always runs at negligible cost — flip this on (plus a window reload) to produce a full diagnostic timeline when reporting a performance issue. |
| `clarion.trace.server` | `"off"` | LSP wire tracing: `off`, `messages`, or `verbose`. |
| `clarion.telemetry.enabled` | `true` | Anonymous usage telemetry. No personal information is collected. |

---

## Reporting a performance problem?

1. Set `clarion.log.performance.enabled` to `true`
2. Reload the window (`Ctrl+Shift+P` → *Developer: Reload Window*)
3. Reproduce the slowness
4. Copy the *Clarion Language Server* output channel contents into a [GitHub issue](https://github.com/msarson/Clarion-Extension/issues)

The log contains phase-by-phase timings that usually identify the exact cause.

---

## Related Documentation

- **[All Commands](commands.md)** — command reference
- **[Solution Management](../features/solution-management.md)** — solutions, builds, configurations
- **[Diagnostics](../features/diagnostics.md)** — what each diagnostic checks
