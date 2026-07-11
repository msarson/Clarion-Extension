# File-finding audit — redirection-parser routing (8c874d32)

**Branch:** `audit/file-finding-redirection-parser-8c874d32`
**Base:** `version-0.9.7@215ae8f` (post-bd7e4a29)
**Auditor:** Eve (2026-05-09)
**Trigger:** completion of the redirection-parser bug stack (01d635ef + b8b2d748 + cfaa7584 + bd7e4a29). The parser now correctly implements the 3-layer chain (RED entries → project dir → libsrc) plus build-config filtering. This audit sweeps the codebase to confirm callers route through it.

## Categorization rubric

- **CAT 1 — FINDING:** "given a name like `Other.clw`, where is it on disk?" — must go through `redirectionParser.findFile` / `findFileAsync`. Anything bypassing breaks for projects whose file lives in libsrc, custom RED paths, or an inactive build configuration.
- **CAT 2 — ENUMERATION:** "list all `.inc` files in libsrc for indexing" — directory walks for index/scan purposes are legitimate. Walking `serverSettings.libsrcPaths` directly is fine.
- **CAT 3 — EXISTENCE CHECK on a fully-resolved path:** `fs.existsSync(absolutePathAlreadyKnown)` is legitimate post-resolution. Not finding.

## Methodology

Parallel discovery greps:
- `findFile` / `findFileAsync` callers (CAT 1 sanity list)
- Direct `serverSettings.libsrcPaths` / `redirectionPaths` access (potential CAT 1 hand-rolls)
- `fs.existsSync` / `fs.readFileSync` / `fs.promises.access|readFile` / `fs.statSync` (broad fs hits)
- Constructed paths near fs ops (`path.join` / `path.resolve` correlation)
- Client: `vscode.workspace.openTextDocument` / `findFiles` / `vscode.Uri.file`

Per-hit ±10-line context read; categorized against the rubric. Borderline cases escalated to "Open questions" rather than guessed.

## CAT 1 sites — correctly routed (sanity list)

The following call `findFile` / `findFileAsync` (or `solutionManager.findFileWithExtension`, which wraps it). All are correctly routed post-bd7e4a29.

### server/src/utils/

| File:line | Note |
|---|---|
| `MapProcedureResolver.ts:654` | MODULE file resolution |
| `MapProcedureResolver.ts:760` | CLW file walk for procedures |
| `MapProcedureResolver.ts:844` | nested MODULE resolution |
| `MapProcedureResolver.ts:991` | MODULE token resolution |
| `ScopeAnalyzer.ts:535` | cross-file scope (passes sourceFilePath) |
| `ScopeAnalyzer.ts:589` | cross-file scope (passes sourceFilePath) |
| `ClassMemberResolver.ts:419` | INCLUDE file resolution |
| `ClassMemberResolver.ts:732` | INCLUDE file resolution |
| `ClassMemberResolver.ts:1034` | implementation CLW resolution (passes currentPath) |
| `IncludeVerifier.ts:165` | INCLUDE diagnostic resolution |
| `IncludeVerifier.ts:385` | member-token-referenced file resolution |
| `MethodOverloadResolver.ts:169` | INCLUDE file resolution |
| `MethodOverloadResolver.ts:259` | INCLUDE file resolution |
| `CrossFileResolver.ts:60` | cross-file dependency resolution |
| `FileDefinitionResolver.ts:122` | go-to-definition file resolution |
| `FileDefinitionResolver.ts:185` | INCLUDE go-to-definition |
| `FileDefinitionResolver.ts:245` | member go-to-definition |

### server/src/providers/

| File:line | Note |
|---|---|
| `DefinitionProvider.ts:1749` | INCLUDE go-to-definition |
| `DefinitionProvider.ts:1773` | member go-to-definition |
| `DefinitionProvider.ts:2098` | member-token resolution |
| `DefinitionProvider.ts:2147` | INCLUDE resolution |
| `HoverProvider.ts:891` | INCLUDE hover resolution |
| `ImplementationProvider.ts:734` | MODULE file (passes currentPath) |
| `ImplementationProvider.ts:856` | implementation CLW (passes currentPath) |
| `MapDeclarationCodeActionProvider.ts:47` | code action resolution |
| `RenameProvider.ts:201` | `resolvesViaRedirection` helper (b2be6028 — closed obsolete) |
| `SignatureHelpProvider.ts:489` | INCLUDE resolution for signatures |
| `MapDeclarationDiagnostics.ts:26` (under `providers/diagnostics/`) | bare-filename resolution |
| `hover/MethodHoverResolver.ts:450` | MODULE file (passes currentPath) |
| `hover/StructureFieldResolver.ts:315` | INCLUDE resolution |
| `hover/StructureFieldResolver.ts:405` | INCLUDE resolution |

### server/src/services/

| File:line | Note |
|---|---|
| `MemberLocatorService.ts:734` | filename resolution |

### server/src/solution/

| File:line | Note |
|---|---|
| `clarionProjectServer.ts:434, 457` | sync `findFileInProjectPaths` wrapper (also tries with default extensions) |
| `clarionProjectServer.ts:491, 527` | async `findFileInProjectPathsAsync` wrapper |
| `solutionManager.ts:358` | `getEquatesTokens` — equates.clw via redirection (then falls into a CAT 1 hand-roll, see follow-up #1) |
| `solutionManager.ts:471` | `findFileWithExtension` — primary resolution path used by the LSP `clarion/findFile` request handler |

### server/src/

| File:line | Note |
|---|---|
| `FileRelationshipGraph.ts:479` | central `resolveFile(filename, fromFile)` helper used by graph builder for MEMBER / INCLUDE / MODULE / IMPLICIT_INCLUDE edges (BUILTINS.CLW, EQUATES.CLW). All graph edge construction routes through this helper. |
| `server.ts:1359` | `connection.onRequest('clarion/findFile')` LSP handler — wraps `solutionManager.findFileWithExtension`. The client-side findFile entry point. |

## CAT 1 sites — NOT routed (follow-up tasks filed)

### Follow-up A — `solutionManager.ts:364-370` (getEquatesTokens libsrc fallback now redundant)

**Site:** `server/src/solution/solutionManager.ts:364-370`
**Pattern:** after a `findFile('equates.clw')` miss, hand-rolls a walk over `serverSettings.libsrcPaths` checking `path.join(libPath, 'equates.clw')`.
**Why CAT 1:** finding equates.clw on disk.
**Why obsolete:** b8b2d748 made `findFile` walk `libsrcPaths` as Tier 3. The hand-rolled fallback now duplicates parser behavior — if the parser miss is genuine, the duplicate walk will also miss; if the duplicate walk would find it, the parser already did.
**Recommended fix:** delete lines 364-370. Single `findFile('equates.clw')` call covers all 3 layers.
**Risk:** none (post-fix behavior strictly subset of current — same paths checked, just fewer times). Worth a single-test pin to confirm equates resolution still works under both project-local-RED and global-RED scenarios.

### Follow-up B — `client/src/commands/IncludeStatementCommands.ts:85-101` (MEMBER file resolution sibling-only)

**Site:** `client/src/commands/IncludeStatementCommands.ts:85-101`
**Pattern:** when adding an INCLUDE to a MEMBER target, computes `path.join(currentDir, targetFile)` and checks `fs.existsSync`. No redirection consultation. If the MEMBER's CLW lives in a custom RED path or libsrc, the command throws "MEMBER file not found".
**Why CAT 1:** finding the MEMBER('parent.clw') file on disk.
**Recommended fix:** route through the LSP `clarion/findFile` request (handler exists at `server.ts:1359`). Pattern already used by `MapModuleCommands.ts:221-224` (`clarion/resolveModuleClwPath`).
**Risk:** low — well-scoped client command. TDD pin can construct a workspace where MEMBER's CLW lives only in a non-sibling dir reachable via .red.

### Follow-up C — `FileRelationshipGraph.ts:483-491` (resolveFile manual fallbacks)

**Site:** `server/src/FileRelationshipGraph.ts:472-494` (`resolveFile`)
**Pattern:** after `project.getRedirectionParser().findFile(filename)` (no sourceFilePath), falls back to `path.join(project.path, filename)` (project-dir membership), then `path.join(path.dirname(fromFile), filename)` (sibling).
**Why CAT 1:** filename resolution for graph edges.
**Why partly redundant:**
- Project-dir fallback: covered by parser's Layer 2 synthetic `*.* = ['.']` catch-all (post-01d635ef).
- Sibling-dir fallback: covered by parser's `sourceFilePath` sibling probe at `redirectionFileParserServer.ts:525-541` — but ONLY when the caller passes `sourceFilePath`. This caller doesn't.
**Recommended fix:** pass `sourceFilePath = fromFile` into the `findFile` call; drop both manual fallbacks. Two-line change.
**Risk:** medium — `resolveFile` is hot during graph builds. Ordering subtleties (parser fallback order vs current 3-step) may surface differences in edge cases. Recommend a TDD pin that exercises a project where the graph picks up a file via sibling fallback today, confirms parser-via-sourceFilePath produces same edge.

### Follow-up D — `ClassMemberResolver.ts:1042-1046` (sibling-dir fallback after findFile)

**Site:** `server/src/utils/ClassMemberResolver.ts:1042-1046`
**Pattern:** after `findFile(implFileName, currentPath)` returns null, falls back to `path.join(path.dirname(declPath), implFileName)`. The `findFile` already engages its sourceFilePath sibling probe against `currentPath`, but the manual fallback uses `declPath`'s dir — which may differ from `currentPath` when the declaration lives in a different file from the active editor.
**Why borderline CAT 1:** the dir target differs (`declPath` dir vs the path passed into findFile). Not strictly redundant.
**Recommended action:** investigate whether the difference is meaningful. If yes, route the second probe through the parser too (call findFile a second time with sourceFilePath = declPath). If no, drop the fallback.
**Risk:** low. Listed as a "tighten" candidate, not a definite bug.

## CAT 2 sites — enumeration (confirmed legitimate, with one flag)

### server/src/utils/StructureDeclarationIndexer.ts:279-285

**Pattern:** after extracting search paths from RED entries, also walks `serverSettings.libsrcPaths` and adds existing dirs to the search list. Then `fs.readdirSync` on each to enumerate `.inc` / `.equ` files for indexing.
**Verdict:** CAT 2, scope correct (RED-derived + libsrc — both relevant for "all places .inc files might live").

### server/src/providers/ReferencesProvider.ts:354-389 ⚠️ flag

**Pattern:** for FAR (Find All References) on interface methods, builds a dir set of `(current file's dir) ∪ (libsrcPaths)`, then `fs.readdirSync` each for `.inc` files, regex-scans for `IMPLEMENTS(ifaceName)` and interface declarations, then resolves discovered MODULE references via `resolveModuleFile` (which routes through the parser).
**Verdict:** CAT 2 (enumeration of `.inc` files for FAR), but enumeration scope **may be incomplete** — does not include project-RED-derived `.inc` directories (e.g., a project with `[Common]\n*.inc = .\classes` would have `.inc` files in `<projDir>/classes/` that this scan misses).
**See open question 1.**

### server/src/utils/ClassMemberResolver.ts:1049-1058

**Pattern:** enumerates `project.sourceFiles` to scan all known `.clw` files for an implementation. Not finding by name; scanning a known set.
**Verdict:** CAT 2, legitimate.

### client/src/commands/ClassConstantCommands.ts:94

**Pattern:** `vscode.workspace.findFiles(new vscode.RelativePattern(projectPath, '*.cwproj'), null, 1)` — scoped enumeration to find the project file. Project-aware via the explicit RelativePattern.
**Verdict:** CAT 2, legitimate.

### server/src/solution/solutionManager.ts:626, 725, 1023, 1084

**Pattern:** extension-filter array literals (`['.clw', '.inc', ...]`) — pure data, not finding.
**Verdict:** out-of-scope (not finding ops).

## CAT 3 sites — existence checks on resolved paths (sample, not exhaustive)

These are post-resolution `fs.existsSync` checks, not finding ops. Listed for completeness; not actionable.

- `server/src/providers/RenameProvider.ts:222-226` — `getLibsrcRejectionReason` does a string-prefix membership test of an already-resolved path against libsrc dirs. CAT 3-ish (path-set membership, not finding).
- Most `fs.existsSync` calls immediately after a `findFile()` return.
- `client/src/PathUtils.ts:*` — generic existence helpers (not Clarion-source-finding).
- `client/src/buildTasks.ts:*`, `client/src/SolutionParser.ts:*`, `client/src/SolutionTreeDataProvider.ts:*`, `client/src/globals.ts:*` — generic existence checks on absolute paths or solution/project file paths (not Clarion source files).

## Open questions / judgment calls for Mark

### 1. ReferencesProvider LibSrc INC scan — should enumeration scope include project RED-derived dirs?

`ReferencesProvider.ts:355-358` builds the dir set as `{current file's dir} ∪ libsrcPaths`. For projects whose `.red` declares `[Common]\n*.inc = .\classes` (or similar custom `.inc` paths), `.inc` files in those custom dirs are not scanned for IMPLEMENTS / INTERFACE matches. Could surface as missing FAR results.

**Question:** Should this be widened to include directories from RED entries? Or is the current scope (sibling dir + libsrc) the intended coverage?

If yes-to-widen: not trivial — needs extracting the project's RED-derived directories the same way `StructureDeclarationIndexer` does. Worth a separate task.

### 2. Client-side IncludeStatementCommands.ts MEMBER resolution — preferred fix shape

Two routes:
- (a) Send LSP `clarion/findFile` request (handler exists, easy).
- (b) Use the existing client-side `RedirectionService` (in `client/src/paths/RedirectionService.ts` — not yet inspected). If client already has a redirection-aware resolver, use it instead of round-tripping through LSP.

**Question:** which route do you prefer? Will inspect `RedirectionService.ts` if you want option (b).

### 3. ClassMemberResolver.ts sibling fallback — keep or drop?

`ClassMemberResolver.ts:1042-1046` does a second-chance probe against `path.dirname(declPath)`, distinct from the `currentPath` passed into the parser. Could be either:
- (a) intentional — declaration lives in a different file from the active editor, both dirs worth probing
- (b) cargo-cult — predates the parser's sibling-probe and never got cleaned up

**Question:** want this investigated as a separate task, or leave as-is?

### 4. CwprojParser.ts:323-339 — `.cwproj` include resolution priority

`client/src/project/CwprojParser.ts:318-340` resolves `.cwproj` <ItemGroup> include paths in the order: absolute → project-dir join → `resolveWithRedirection` callback. This means a file present in project-dir wins over redirection — even though redirection might steer the build to a different copy under the active config. Probably out of scope for this audit (it's parsing `.cwproj`, not Clarion source), but flagging in case it matters for `.cwproj` references that should honor build config.

**Question:** worth a follow-up task, or out of scope?

## Summary

| Bucket | Count |
|---|---|
| CAT 1 routed correctly | 36 sites |
| CAT 1 NOT routed (follow-ups) | 4 sites (A, B, C, D) |
| CAT 2 enumeration | 5 (1 flagged for scope review) |
| CAT 3 / out-of-scope | many (sampled) |
| Open questions for Mark | 4 |

The redirection-parser surface is overwhelmingly correctly routed. The shipped 4-bug stack closes the parser's correctness gap, and ~36 callers benefit immediately. Four CAT 1 sites need follow-ups (one is a clear-cut redundancy removal post-b8b2d748; one is a clear-cut bypass on the client; two are tightening candidates). Four open questions need Mark's input before filing additional follow-ups.

**No production-code changes were made in this audit.**
