# `ClassMemberResolver` sibling-dir fallback investigation (6253f9d5)

**Branch:** `chore/classmemberresolver-sibling-dir-investigation-6253f9d5`
**Base:** `version-0.9.7@e6bf1ae` (post-671d7cd8)
**Investigator:** Eve (2026-05-10)
**Origin:** Open Question #3 of `docs/audits/file-finding-audit-2026-05-09.md` (task `8c874d32`)
**Disposition ask:** Mark, via Bob — sign off on the recommendation below before Phase B.

## Executive summary

**Recommendation: KEEP** the sibling-dir fallback at `ClassMemberResolver.ts:1041-1046`. It is **load-bearing** for two real production cases:

1. **No-solution-open mode** — user opens a single `.clw` without loading the workspace as a Clarion solution. `SolutionManager.solution` is null and `FileRelationshipGraph.isBuilt` is false; both upstream blocks (FRG class-module index, RedirectionParser) bail early, leaving the sibling-dir fallback as the only working resolution path for `findImplementationCrossFile`.
2. **Cross-directory `.inc` / `.clw` siblings outside the project's `.red` search paths** — declaration file lives in a directory the project's redirection chain doesn't enumerate, but the impl `.clw` sits next to the `.inc` on disk. The parser's own Layer-2 sibling-probe (`incDirsScope.ts`) keys on the *active editor's* directory, not the declaration file's directory — different surface; the fallback covers what the parser's sibling-probe misses.

**Not** cargo-cult. **Not** test-fixture-only. **Not** fully subsumed by the canonical chain. **DO NOT DROP** in current `version-0.9.7` state.

Two follow-up actions identified — see "Follow-ups" below.

## Step 1 — Source location, invocation conditions, return semantics, callers

### Location

`server/src/utils/ClassMemberResolver.ts:1041-1046`, inside `findImplementationCrossFile(className, methodName, memberInfo, document)` (public async, line 997+).

### The fallback (verbatim)

```ts
// 2. Try CLW with same base name as the declaration file (via redirection)
if (memberInfo.file) {
    let declPath = memberInfo.file;
    if (declPath.startsWith('file:///')) { /* normalise to fs path */ }
    const implFileName = path.basename(declPath, path.extname(declPath)) + '.clw';

    if (sm?.solution) {
        for (const project of sm.solution.projects) {
            const resolved = project.getRedirectionParser().findFile(implFileName);
            if (resolved?.path && fs.existsSync(resolved.path)) { /* found via parser */ }
        }
    }
    // Fallback: same directory as the declaration file
    const directPath = path.join(path.dirname(declPath), implFileName);
    if (fs.existsSync(directPath)) {
        const loc = this.findImplementationInFile(directPath, className, methodName, declarationSig);
        if (loc) return loc;
    }
}
```

### Invocation conditions (when the fallback fires)

The fallback runs when **block 1 (FRG) returned nothing** AND **block 2 (RedirectionParser) returned nothing OR `sm?.solution` is falsy** AND **`memberInfo.file` is set**.

Concretely:
- `graph.isBuilt === false` (no project loaded yet, or no-solution-open mode), OR
- `graph.getEdgesForClass(className)` returned an empty list (class has no `MODULE('file.clw')` attribute — common Clarion convention skips this, see Step 3), OR
- FRG returned candidates but `findImplementationInFile` didn't find the specific impl in any of them, AND
- `sm?.solution` is null (no-solution-open), OR
- Redirection didn't find `implFileName` (decl's directory not in `.red` search paths), OR
- Redirection found a file but `findImplementationInFile` didn't find the specific impl

### Return semantics

Returns `Location | null` — same shape as the function's other branches. On success, returns the resolved impl location; on miss, falls through to block 4 (full project CLW scan) which returns `null` if nothing matches.

### Callers

Two consumers, both user-facing:

| File:line | Feature |
|---|---|
| `server/src/providers/ImplementationProvider.ts:444` | Go-to-Implementation (Ctrl+F12) on typed-variable method calls (e.g. `inst.Method()` where `inst` is a typed instance) |
| `server/src/providers/hover/MethodHoverResolver.ts:344` | Hover on chained property method calls — populates the impl-location string in the hover formatter |

Both features are part of the everyday Clarion authoring loop. Breaking either in no-solution-open mode is a user-visible regression.

### Test coverage

Zero direct or indirect tests of `findImplementationCrossFile` — `MemberLocatorService.test.ts`, `CompletionProvider.test.ts`, `ChainedPropertyResolver.test.ts` import only the standalone helpers (`scanClassBodyForMember`, `selectBestMemberOverload`) from `ClassMemberResolver`, never the class instance. `ImplementationProvider.Refactor.test.ts` uses `test://` in-memory URIs that fail `fs.existsSync` and don't reach the disk-keyed fallback.

This zero-coverage state is itself a finding — see Follow-up #2.

## Step 2 — Real-world usage survey

The fallback fires in two production scenarios:

### Scenario A — No-solution-open mode

Mark's 2026-05-09 observation, captured in task `0075728c`'s plan field:

> "The client-side `RedirectionService` may be load-bearing for features that work without a loaded Clarion solution. Single-file editing — user opens a `.clw` directly without loading the workspace as a Clarion solution — is a real workflow."

In this mode:
- `SolutionManager.getInstance().solution` is null
- `FileRelationshipGraph.isBuilt` returns false (no solution to index)
- Block 1 (FRG) bails at `if (graph.isBuilt) {` — skipped entirely
- Block 2 (RedirectionParser) bails at `if (sm?.solution) {` — skipped entirely
- **Block 3 (sibling-dir) is the only block that can fire.** `path.dirname` and `fs.existsSync` work without any solution context.

Without this fallback, Go-to-Implementation and Hover-on-method-call would return null in no-solution-open mode for the canonical `.inc` + `.clw` sibling layout — and that layout is overwhelmingly the most common in real-world Clarion codebases.

### Scenario B — Cross-directory `.inc` / `.clw` siblings outside `.red` search paths

When the active editor is `app.clw` (in `src/`) and includes `MyClass.inc` (in `lib/classes/`), and `lib/classes/` is not in the project's `.red` search paths:
- Block 2 (RedirectionParser) calls `findFile('MyClass.clw')` against the project's `.red`-derived paths. Doesn't find `lib/classes/MyClass.clw`.
- Block 3 (sibling-dir) computes `path.dirname('lib/classes/MyClass.inc')` + `'MyClass.clw'` → `lib/classes/MyClass.clw`. **Catches it.**

The parser's own Layer-2 sibling-probe (`incDirsScope.ts`, "Layer 2 — sibling of currently-open file") keys on the *active editor's* directory (`src/`), not the declaration file's directory (`lib/classes/`) — different surface. The fallback covers a distinct case.

This is uncommon for newly-written projects (Clarion convention puts everything in the project's source dir, which is in `.red`) but appears in libraries, ABC-derived code, and any project that vendor-vendors `.inc`/`.clw` pairs in non-default subdirectories.

### Symmetry sanity-check — companion sites with identical pattern

The sibling-dir fallback is **not** a one-off. It's a deliberate convention repeated across the codebase, with consistent comment phrasing:

| File:line | Comment |
|---|---|
| `ImplementationProvider.ts:867-876` | "// No solution / redirection failed — fall back to same directory as declaration" |
| `ClassMemberResolver.ts:1041-1046` | "// Fallback: same directory as the declaration file" |
| `MapDeclarationDiagnostics.ts:145` | "// Try same directory as current CLW first (most common), then redirection" |
| `MapDeclarationCodeActionProvider.ts:36-60` | `resolveClwPath(... siblingFilePath?)` with explicit "Fall back: try same directory as sibling file" |

Four sites, same pattern, same purpose. `ImplementationProvider.ts:867`'s comment is the smoking gun — "No solution" is the explicit motivation. Dropping `ClassMemberResolver`'s fallback in isolation while leaving the other three would create silent-asymmetry inside the codebase itself: same scenario, four resolvers, three of them work in no-solution mode and one returns null.

## Step 3 — Coverage map vs canonical resolution chain

### Canonical chain (today)

1. **FRG `getEdgesForClass(className)`** — returns CLASS_MODULE edges only. CLASS_MODULE is defined as "MODULE('file.clw') attribute on a CLASS declaration". When a class is declared without the explicit `MODULE` attribute (common in user code; the `.inc`/`.clw` sibling convention is implicit), FRG returns nothing. Requires `graph.isBuilt`.
2. **RedirectionParser `findFile(implFileName)`** — searches the project's `.red`-derived paths. Requires `sm?.solution` to obtain the project's parser instance.

### Sibling-dir fallback coverage

Covers cases neither block reaches:

| Scenario | FRG | RedirectionParser | Sibling-dir |
|---|---|---|---|
| Class with explicit `MODULE` attr, solution loaded | ✓ | ✓ | (not reached) |
| Class without `MODULE` attr, sibling layout, solution loaded, decl-dir in `.red` | ✗ | ✓ | (not reached) |
| Class without `MODULE` attr, sibling layout, solution loaded, decl-dir NOT in `.red` | ✗ | ✗ | **✓** |
| Class without `MODULE` attr, sibling layout, **no-solution-open mode** | ✗ | ✗ | **✓** |
| Class with `MODULE` attr pointing at non-existent file, solution loaded | ✗ (returns stale edge whose findImplementationInFile fails) | depends | sometimes ✓ as last-chance |

The fallback is a **strict superset** in the no-solution-open scenario (both upstream blocks bail) and a **disjoint surface** in the cross-directory siblings scenario (different directory than the parser's own sibling-probe).

### Coverage relationship summary

- **Subset of canonical chain?** No. Covers cases the canonical chain explicitly cannot reach today.
- **Superset?** No — canonical chain handles the explicit-MODULE case the fallback doesn't probe.
- **Different surface?** Yes — the no-solution-open and cross-directory-non-`.red` cases are uniquely fallback-covered.

## Step 4 — Recommendation

### KEEP

Two real production scenarios depend on this fallback. Dropping it in the current `version-0.9.7` state would silently regress Go-to-Implementation and method-call hover for a non-trivial subset of users.

### Recommended actions in Phase B

**B1 — Document the load-bearing role.** Add a comment block at `ClassMemberResolver.ts:1041` referencing:
- The no-solution-open scenario (`SolutionManager.solution` null + `FRG.isBuilt` false)
- The cross-directory siblings scenario (decl directory not in `.red`)
- Cross-link to the companion sites (`ImplementationProvider.ts:867`, `MapDeclarationDiagnostics.ts:145`, `MapDeclarationCodeActionProvider.ts:resolveClwPath`)
- The 0075728c follow-up that may eventually subsume it

**B2 — File a follow-up** tracking the sibling-dir-fallback cluster as a unit. When `0075728c` lands (server-side `clarion/findFile` extended to handle no-solution-open mode via a "standalone resolver"), revisit ALL four sites in unison. The right outcome at that point may be:
- DROP all four — canonical chain (post-0075728c) covers no-solution mode
- ROUTE THROUGH PARSER — consolidate via the new server-side standalone resolver, eliminating the four parallel implementations

Either outcome benefits from being decided once across all four sites rather than per-site, to avoid drift.

## Silent-asymmetry probe (per dispatcher direction)

Bob's dispatch flagged: "if your survey finds the fallback only fires in test fixtures, ALSO check whether production code paths SHOULD be hitting it but aren't." The inverse holds here — the fallback fires in real production, and the question becomes: **are there other producer/consumer pairs in this codebase that LACK an equivalent fallback and silently break in no-solution-open mode?**

Quick scan flags two candidates worth investigation:

- **ReferencesProvider's `getLocalClassSearchFiles`** (line 1419+) widens FAR scope via FRG MEMBER siblings + reverse-includes. Requires `graph.isBuilt`. In no-solution-open mode, this widening returns nothing — FAR may silently miss cross-procedure callers when no solution is loaded. Out-of-scope for this task; flagging for follow-up.

- **`DefinitionProvider`** for cross-file class-method `F12` — uses `StructureDeclarationIndexer` which depends on solution-aware caching. In no-solution-open mode, may silently fail. Did not deep-dive. Flagging.

Both candidates suggest no-solution-open mode has a **broader systemic gap** than the four sibling-dir-fallback sites address. Worth scoping in tandem with the 0075728c migration — the test surface for "does X work in no-solution mode" should be built once, then run against every cross-file resolver.

This is the inverse-shape match to `feedback_substrate_symmetry_check` Pattern A: instead of "matching-loop and entry-point both consume new substrate", it's "old substrate (sibling-dir fallback) is still load-bearing in modes the new substrate doesn't reach". Same family of silent-asymmetry; same dispatcher discipline applies.

## Follow-ups

| ID (suggested) | Title | Owner | Trigger |
|---|---|---|---|
| FOLLOWUP-1 | Sibling-dir fallback cluster cleanup — revisit ClassMemberResolver/ImplementationProvider/MapDeclaration sites in unison post-0075728c | Bob to assign | 0075728c lands |
| FOLLOWUP-2 | Test coverage for `findImplementationCrossFile` (zero coverage today) — author Mocha tests against in-memory + disk fixtures | Eve/Alice | Independent; can land any time |
| FOLLOWUP-3 (silent-asymmetry probe) | No-solution-open systemic gap audit — verify FAR / Definition / Hover / Go-to-Impl / completion all work without a loaded solution | Eve | Independent; high value |

## Branch / artefact

This report is the Phase A deliverable, committed as a doc artefact on `chore/classmemberresolver-sibling-dir-investigation-6253f9d5`.

No production-code changes were made.
