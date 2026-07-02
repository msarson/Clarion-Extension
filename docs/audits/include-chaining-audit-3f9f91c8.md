# `{include}` chaining audit — ordering / macros / section merging (3f9f91c8)

**Branch:** `chore/include-chaining-audit-3f9f91c8`
**Base:** `version-0.9.7@c21a822` (post-`a3c341cf` case-insensitive section names + `6253f9d5` Phase B sibling-dir docstrings)
**Investigator:** Eve (2026-05-10)
**Origin:** Surfaced 2026-05-09 by Mark while reviewing a real-world `.red` example.
**Disposition ask:** Mark, via Bob — sign off on per-aspect verdicts and Phase B routing.

## Executive summary

Three aspects audited; **one substantive bug found**, one conceptually-misframed-but-correct, one correct.

| Aspect | Sync verdict | Async verdict | Phase B impact |
|---|---|---|---|
| 1. Ordering | **CORRECT** (interleaved at include position) | **INCORRECT** (non-deterministic per-include parallelism, all child entries land AFTER parent's last entry) | Substantive fix to async path; sync path docstring-only |
| 2. Macro expansion | **CORRECT-but-misframed** — `.red` files do NOT define macros (only consume from `serverSettings.macros`), so the "cross-file macro reference" trap doesn't exist | (same) | Docstring + plan-field correction |
| 3. Section merging | **CORRECT** post-`a3c341cf` — sections are flat-list tags, case-insensitive equality at consumer time | (same) | Docstring-only |

**Plus** a meaningful **silent-asymmetry finding** in the client-side `RedirectionService.ts` parser: section information is dropped entirely, and the `3161ea89`-removed synthetic `*.* = .` is reintroduced. Both inform task `0075728c`'s scope (client-side parser deletion).

## Step 1 — Source flow

Two parallel implementations in `server/src/solution/redirectionFileParserServer.ts`:

- **`parseRedFileRecursive`** (line 229+) — sync version. Used by `server.ts:1601` (LSP `clarion/findFile` handler), `clarionProjectServer.ts:578/711/819` (3 sites). Production-hot path.
- **`parseRedFileRecursiveAsync`** (line 340+) — async version. Used by `StructureDeclarationIndexer.ts:276` (1 site).

Both branch on `if (trimmed.startsWith("{include"))`, parse the path with `this.resolveMacro`, then recurse into the included file. The recursion shares the parent's `entries` array; entries push during recursion.

### Key state

- `this.macros: Record<string, string>` — instance state, set ONCE in constructor from `serverSettings.macros` (line 74). Constant for the parser instance's lifetime.
- `RedirectionFileParserServer.includeCache` — static; caches per-include-file entries by mtime-keyed cache key. Cached entries have macros pre-resolved at first parse time.
- `RedirectionFileParserServer.redFileCache` — static; caches per-top-level-file entries.

### Existing test coverage of `{include}` chaining

**Zero end-to-end empirical tests.** Of the 8 `RedirectionParser.*.test.ts` files, none construct multi-file fixtures with `{include}` directives and verify the merged flat-list output. `GetSearchPaths.AnchorResolution.test.ts` mentions "include mode" semantically (test 3) but constructs entries directly and bypasses the parser.

**This is itself a finding.** The parser's `{include}` chaining behaviour is unverified by automated tests — a substrate-symmetry concern (per `feedback_substrate_symmetry_check` Pattern B: "deferred test coverage often correlates with un-examined production code").

## Step 2 — Ordering probe (Aspect 1)

### Sync path — INTERLEAVED at include position

`parseRedFileRecursive` at line 280-289:

```ts
if (trimmed.startsWith("{include")) {
    const includeMatch = trimmed.match(/\{include\s+([^}]+)\}/i);
    if (includeMatch && includeMatch[1]) {
        let includePath = this.resolveMacro(includeMatch[1]);
        includePath = path.isAbsolute(includePath) ? includePath : path.resolve(redPath, includePath);
        this.parseRedFileRecursive(includePath, entries, false);  // ← shared `entries`, recursive call BEFORE continuing
    }
    continue;
}
```

The recursive call runs synchronously to completion before the parent loop's next iteration. Child entries push into the shared `entries` array at the include directive's position. Result for fixture `parent: A, {include}, B; child: X, Y` → flat list `[A, X, Y, B]`. **Interleaved at include position.** Verdict: **CORRECT.**

**Counterfactual sentinel** (per `feedback_non_x_regression_sentinel`): the verdict above asserts INTERLEAVED. To discriminate against APPENDED, the regression test must include parent entries AFTER the include directive (B in the example) and assert they appear at the END of the flat list — not nestled before child entries.

### Async path — NON-DETERMINISTIC, ALL CHILD ENTRIES AFTER PARENT

`parseRedFileRecursiveAsync` at line 399-411:

```ts
if (trimmed.startsWith("{include")) {
    // ...
    const includePromise = this.parseRedFileRecursiveAsync(includePath, entries, false)
      .then(() => {});
    includePromises.push(includePromise);  // ← queued, not awaited per-include
}
continue;
```

Then at line 450 (AFTER the parent loop ends): `await Promise.all(includePromises)`.

The parent loop body has no awaits, so it runs to completion synchronously, pushing **all** parent entries (in source order, including post-include lines) into the shared `entries` array first. Each include's `parseRedFileRecursiveAsync` call yields at its first `await fs.promises.access` (line 348) and returns a pending promise. Includes only resume after the parent loop completes.

Result for fixture `parent: A, {include}, B; child: X, Y` → async flat list `[A, B, X, Y]` (child entries appended). For multiple includes (`parent: A, {include1}, B, {include2}, C; child1: X; child2: Z`) → `[A, B, C, X, Z]` OR `[A, B, C, Z, X]` (non-deterministic depending on fs read timing — both includes resolve concurrently via `Promise.all`).

Verdict: **INCORRECT.** Sync and async produce different orderings. For the same `.red` file:
- Sync: `[A, X, Y, B]`
- Async: `[A, B, X, Y]` (deterministic for single include) OR non-deterministic for multiple includes

### Production impact of the async divergence

Production callers of `parseRedFileAsync`: 1 site (`StructureDeclarationIndexer.ts:276`). The Indexer consumes the flat list to find `.inc` files for class/structure indexing; downstream consumers (lookup, FAR widening) read by extension/section, not by index position. **In typical production paths the divergence is silent — the lookup is order-tolerant for distinct extensions.**

**The divergence becomes user-visible when:**
- Two `.red` files in the chain define the same extension key (e.g. parent `*.inc = ./local`, child `*.inc = ./global`). First-match-wins lookup returns different paths via sync vs async.
- A consumer iterates the flat list expecting source-ordering for build-config layering (parent overrides child or vice versa).

The async path's `Promise.all` parallelism makes ordering of multiple-include cases non-deterministic — even for the same input, two consecutive parses can return different flat-list orderings. **This is the most concerning finding** because it makes async behaviour test-flaky and operationally unpredictable.

## Step 3 — Macro expansion probe (Aspect 2)

### Finding: `.red` files do not define macros

`resolveMacro` (line 465+) reads exclusively from `this.macros`, which is populated ONCE in the constructor from `serverSettings.macros` (line 74). Plus two hardcoded fallbacks (`%bin%` → `serverSettings.primaryRedirectionPath`, `%redname%` → basename of the redirection file).

**`.red` files have no syntax for defining macros.** They only consume macros injected externally (config-driven `serverSettings.macros` or hardcoded fallbacks).

### Implications

The task plan field's framing of Aspect 2:

> "If the included file references a macro defined in the including file, does it resolve? (If parse-time-per-file: no; if lookup-time or merged-context: yes.) Symmetric: if the including file references a macro defined in the included file, does that resolve?"

**This question is conceptually misframed.** No `.red` file defines macros. Cross-file macro definition is not a feature.

What IS true:
- All `.red` files (parent + included) share the SAME macro context — `serverSettings.macros` + hardcoded fallbacks. A macro defined in config is available everywhere.
- Macros are expanded at PARSE TIME (line 303 / 426). Lookup-time consumers see pre-resolved paths.
- The `includeCache` (line 63) holds entries with macros pre-resolved at first-parse time. If `serverSettings.macros` mutates after first parse but before second use of an included file, the second use returns the first-parse macro-resolved values. **Possible stale-cache concern** if config-reload is supported, but bounded — config-reloads typically invalidate caches.

### Verdict

**CORRECT-but-misframed.** Phase B for Aspect 2 should:
1. Add a docstring at the parser entry point documenting that `.red` files cannot define macros — only consume from `serverSettings.macros` + hardcoded fallbacks.
2. Update the task plan / continuation notes to retire the "cross-file macro reference" framing — it's a non-issue.

## Step 4 — Section merging probe (Aspect 3)

### Finding: sections are NOT merged at parse time — they're flat-list tags

`parseRedFileRecursive` line 309: `const entry = { redFile, section: currentSection, extension, paths }`. Each entry carries its source section name as a tag, case preserved as-written.

There is **no parse-time merging** of `[Debug]` (parent) + `[debug]` (child) into a single section structure. Both entries land in the flat list with their as-written `section` values.

**Section semantics live at consumer time.** Line 56-57:

```ts
const sectionLower = entry.section.toLowerCase();
return sectionLower === 'common' || sectionLower === configuration.toLowerCase();
```

This is the post-`a3c341cf` case-insensitive comparison (commit `20f7838` — confirmed via git log). Consumers filtering by configuration (e.g. "give me all entries for Debug build") iterate the flat list and use case-insensitive equality. `[Debug]` parent + `[debug]` child both match.

### Same-extension key conflicts

If parent has `*.inc = ./local` in `[Common]` and child has `*.inc = ./global` in `[Common]`:
- Both push to flat list with same `section = "Common"` and same `extension = "*.inc"`.
- Sync ordering: parent's entry first (pre-include), then child's at the include position. (For my fixture in Step 2: `[A, X, Y, B]` shape — parent's `*.inc` entry is at A's position, child's at X's position.)
- Lookup behaviour depends on the consumer. `findFile` iterates entries and returns first-match-wins. Order-sensitive.

There is **no concatenation** of paths across same-extension entries. Each entry stays distinct in the flat list.

### Verdict

**CORRECT.** The `a3c341cf` case-insensitive comparison correctly pairs case-mismatched sections at consumer time. No parse-time section merging is needed because the architecture uses flat-list tags.

Phase B for Aspect 3: docstring at the consumer-side comparison site (line 56-57) referencing `a3c341cf` and explaining that "section merging" in this parser is a flat-list-+-case-insensitive-tag-equality pattern, not a structural merge.

## Silent-asymmetry probe — client-side `RedirectionService.ts`

Per dispatcher direction + `feedback_substrate_symmetry_check` Pattern A. The grep found `client/src/paths/RedirectionService.ts` has its own `{include}` parser (line 95-175). Substantial divergences from the server:

### Divergence 1 — Section information is dropped

Client-side entry shape (lines 148-152):

```ts
entries.push({
    extension,
    paths,
    mtime: currentMtime
});
```

**No `section` field.** The parser tracks `currentSection` (line 96) but never attaches it to entries. All entries collapse to a single sectionless flat list.

Production impact: any client-side consumer doing build-configuration filtering (`[Debug]` vs `[Release]`) cannot distinguish them. The client's flat list mixes Debug, Release, and Common entries indistinguishably.

### Divergence 2 — Synthetic `*.* = .` reintroduced

Client-side line 99-103:

```ts
entries.push({
    extension: "*.*",
    paths: ["."],
    mtime: currentMtime
});
```

This is a synthetic catch-all that was **deliberately removed** from the server-side parser per task `3161ea89` (server-side line 260: "Compiler-truth (3161ea89): no synthetic *.* catch-all is injected"). The client unilaterally reintroduces it.

Production impact: client-side file resolution may find files via the synthetic catch-all that the server-side `clarion/findFile` would NOT find. Cross-mode behaviour divergence.

### Divergence 3 — No async path

The client only has a sync parser (no async equivalent). So the async ordering bug found in Step 2 doesn't apply here — but neither does any async support, which limits the client's options if it ever needs non-blocking parsing.

### Recommendation

Both divergences are existing scope of task `0075728c` ("Delete client-side `RedirectionService`; route all client file resolution through LSP `clarion/findFile`"). This audit's findings **strengthen** that task's case: the client parser is not just architecturally redundant, it is **incorrect** in production-relevant ways.

Add to `0075728c`'s continuation notes:
- Section-information drop is a real correctness gap, not just architectural redundancy.
- Synthetic `*.* = .` reintroduction contradicts the post-`3161ea89` server contract.
- Migration plan should explicitly verify that no client consumer was relying on these incorrect-but-stable behaviours.

## Recommended Phase B per aspect

| Aspect | Recommendation |
|---|---|
| 1. Ordering — sync | Docstring-only at `parseRedFileRecursive:280` documenting interleaved-at-include-position behaviour + add the missing test coverage (the empirical probes from this report serialised as Mocha tests with disk-keyed fixtures, similar to `RedirectionParser.DotResolution.test.ts` shape) |
| 1. Ordering — **async** | **Substantive fix** — restructure `parseRedFileRecursiveAsync` to await each include serially at its position (mirror sync semantics) OR document a deliberate divergence with strong rationale. Strong recommendation: serial await — non-determinism is a worse property than the small parallelism win. Author RED-pin tests first; same fixture as sync but invoked via `parseRedFileAsync`; assert deterministic interleaved ordering |
| 2. Macros | Docstring-only at parser entry (`parseRedFile` / `parseRedFileAsync`) documenting macro source semantics — `serverSettings.macros` only, no `.red`-file-defined macros, hardcoded `%bin%` / `%redname%` fallbacks |
| 3. Section merging | Docstring-only at consumer-side comparison (line 56-57 `entryMatchesConfig`) referencing `a3c341cf` and explaining flat-list-tag semantics |

## Suggested follow-ups

| ID (suggested) | Title | Owner | Trigger |
|---|---|---|---|
| FOLLOWUP-1 | Async-path ordering fix (Aspect 1) — serialise `parseRedFileRecursiveAsync` includes | Alice | Independent; high priority — non-determinism |
| FOLLOWUP-2 | `{include}` end-to-end test coverage — disk-keyed fixtures with multi-file chains, both sync and async | Eve/Alice | Independent; sequenced after FOLLOWUP-1 to avoid pinning the broken behaviour |
| FOLLOWUP-3 | `0075728c` continuation-notes update — incorporate this audit's section-drop + synthetic-`*.*` divergence findings | Bob | Inform `0075728c`'s scope |
| FOLLOWUP-4 | Plan-field correction on this task — retire the "cross-file macro reference" framing as conceptually misframed | Bob | Bookkeeping |

## Branch / artefact

This report is the Phase A deliverable, committed as a doc artefact on `chore/include-chaining-audit-3f9f91c8`.

No production-code changes were made.
