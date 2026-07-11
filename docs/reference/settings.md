# Settings Reference

[← Back to Documentation Home](../../README.md)

Complete reference for all Clarion Extension settings, generated from the extension manifest for **v1.0.0**.

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

| Setting | Default | Description |
|---|---|---|
| `clarion.diagnostics.undeclaredVariables.enabled` | `true` | Warns when an identifier in executable code resolves to no declaration through the full scope model (cross-file aware; automatically suppressed until a solution is loaded). |
| `clarion.diagnostics.indistinguishablePrototypes.enabled` | `true` | Warns when two procedure declarations in the same scope (CLASS / INTERFACE / MAP) are indistinguishable to the compiler. |

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
