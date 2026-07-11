# Startup Chain Diagnosis — 40-project / 3016-file Solution

## 1. Ranked root-cause hypotheses

### H1 (primary, explains all three symptoms): Server request-queue saturation during the first minutes, doubled by a duplicate startup pipeline, converts every interactive round-trip into a multi-second wait

This is a single causal chain built from five CONFIRMED findings:

1. **Dual startup pipeline** — `SolutionInitializer.ts:341` (high) + `SolutionInitializer.ts:347` (high) + `SolutionCache.ts:1073` (medium) + `solutionManager.ts:556` (low). The eager init and the `clarion/solutionReady` handler both run in full on *every* healthy startup: two `getSolutionTree` fetches, two tree refreshes, two full open-document passes, mismatched `fetchInProgress` guards that either drop or duplicate the fetch. All heavy client work and server traffic happens twice, exactly in the SDI (4-9s) / FRG (~17s) / validator (up to 11s) window.
2. **Premature guard drop** — `SolutionInitializer.ts:431` (high). The eager path calls `markActivationComplete()` seconds into startup (local-.sln fallback guarantees `projects>0`), un-suppressing `findFile` while the server is at its busiest. The activation skip at `SolutionCache.ts:1729` returns `""` *without caching*, so all ~113 unresolved names become deferred debt that fires the moment the guard drops.
3. **findFile storm hits an unshielded server** — `LocationProvider.ts:83` (high) fires all unique filenames per document in parallel (×4 concurrent pattern passes); `solutionManager.ts:506` (high) makes each request a full 40-project fan-out with **no early exit** (`Promise.all` at :538) and **no negative cache** (miss at :545 uncached). The code's own comment (`SolutionCache.ts:1724`) empirically records "113 parallel clarion/findFile requests block the server 5+ seconds."
4. **didOpen validation storm** — `ExtensionHelpers.ts:40` (high). `getAllOpenDocuments` force-opens every session-restored tab, firing N `textDocument/didOpen` → N sync validations + N deferred-validator enqueues on the server, in the same window.
5. **CodeLens cold-miss FAR scans** — `server.ts:886` (high). Since #290/#294 removed the precompute, every visible lens on a freshly opened file runs an uncancellable project-wide reference scan yielding only every 25 files — the direct producer of the measured 0.5-2.8s server lag chunks.

**Effect:** `getProjectFiles` (433ms handler) and `documentSymbol` responses queue behind chunked scans and storms → tree and Structure spinners persist even though their own handlers are fast, and the whole IDE feels unresponsive until caches warm (~1 minute — matching the measured decay). The extension-host CPU profile (87% idle) is consistent: the client is *waiting*, not working.

### H2 (specific to "tree still spins after the cached-children fix"): Every refresh discards the children cache and re-issues getProjectFiles

`SolutionTreeDataProvider.ts:1409` (CONFIRMED, medium): `getTreeItems()` rebuilds the root with brand-new project nodes (`children=[]`), discarding the line-477 cache. The **guaranteed** solutionReady refresh (H1's second pipeline pass) rebuilds the root; VS Code's stable label-handles keep expanded projects expanded and silently re-resolve their children → `getProjectFiles` re-issued per expanded project during the busiest server window. Combined with `SolutionTreeDataProvider.ts:508` (PLAUSIBLE, medium — the await has no timeout/cancellation, so spinner duration = full queue delay) and no in-flight dedup (concurrent duplicate requests per fire), **this is why the cached-children early-return changed nothing**: the cache lives on objects every refresh throws away.

### H3 (specific to Structure-view spin on tab switch): A client-side generation race renders blank regardless of server speed, and each tab switch triples the documentSymbol load

Chain of three CONFIRMED findings:
- `StructureViewProvider.ts:811` (high): tab switch clears `_lastKnownSymbols=[]`, fires render fetch #1; follow-cursor's `revealActiveSelection` (`:256`, medium) fires fetch #2 ~100ms later and bumps the generation, so whenever the server takes >100ms fetch #1 — the one VS Code actually renders — is discarded and returns the cleared `[]`. Fetch #2's symbols go nowhere. No retry is armed on the discard path.
- `LanguageServerManager.ts:206` (medium): the server's per-didOpen `symbolsRefreshed` notification triggers a third fetch that clears the registry and re-bumps the generation mid-flight.
- The same tab switch fires the CodeLens resolve storm (H1 #5) and, for first-view documents, the findFile storm (H1 #3), guaranteeing the >100ms latency that arms the race.

**Effect:** spin → blank/stale on every tab switch during the first minutes, with no auto-recovery between already-open tabs. Note H3 survives even after H1 is fixed — the 100ms race window exists whenever the server is merely "not instant."

### Ruled out
- Stuck `solutionOperationInProgress` (`solutionManager.ts:559`) — all setters balanced try/finally, sole reader masked. Not a cause.
- Server never-resolve on `getProjectFiles` (`solutionManager.ts:587`) — returns on every path. The persistent spinner is client-side re-issue + queue wait.
- Quick Open sync walks (`QuickOpenProvider.ts:92`) — real, but requires explicit Ctrl+P; contributor only.

## 2. Fix plan

### (a) Surgical fixes (<1h each, low risk)

| # | Target | Fix |
|---|--------|-----|
| 1 | `client/src/SolutionTreeDataProvider.ts:1374-1409` | On root rebuild, carry over `node.children` keyed by `project.guid` from the old root; set `treeItem.id` (guid / solution path / projectId_fileName). Kills H2. |
| 2 | `client/src/solution/SolutionInitializer.ts:427-433` | After the eager path completes, dispose `solutionReadyDisposable` (or set a `didStartupRefresh` latch the handler checks) — single-source startup completion. Halves H1 load. |
| 3 | `client/src/solution/SolutionInitializer.ts:343-350` | Call `beginActivationRefresh()` **before** `refreshSolutionTreeView()`; wrap handler body in try/finally around `markActivationComplete()`. |
| 4 | `client/src/views/StructureViewProvider.ts:91, 811` | Don't clear `_lastKnownSymbols` to `[]` on tab switch; on generation-discard, return/await the winning in-flight promise (single-flight map keyed by uri+version) instead of the cleared array. Kills H3's blank render. |
| 5 | `client/src/views/StructureViewProvider.ts:256` | `revealActiveSelection` reads the cached/in-flight symbols; it must never bump `_symbolRequestGeneration` or issue its own fetch. |
| 6 | `client/src/server/LanguageServerManager.ts:206` (+ `server/src/server.ts:528`) | Only refresh when `params.uri` matches the active editor (normalized paths); better, drop the didOpen-side notification and keep only the didChange one. |
| 7 | `server/src/solution/solutionManager.ts:538-546` | Negative-cache misses in `fileCache` + in-flight coalescing map + first-hit early exit (prioritize the requester's own project). Biggest server-queue win for the cost. |
| 8 | `server/src/server.ts:871-922` | Accept and propagate the LSP CancellationToken into `provideReferences` for CodeLens resolve + a 200-500ms wall-clock budget per resolve; same linked-token cancel for the 15s race at `server.ts:2390`. |
| 9 | `client/src/activation/ActivationManager.ts:223` | Delete the `refreshOpenDocuments(undefined)` call — it's a functional no-op costing 0.9-1.6s of awaited activation before the views register. |
| 10 | `client/src/utils/ExtensionHelpers.ts:36-44` | Stop force-opening lazily-restored tabs: iterate only `workspace.textDocuments`; let didOpen fire when the user actually focuses a tab. |
| 11 | `client/src/SolutionTreeDataProvider.ts:508` | Timeout (~5s) + retryable error node + in-flight dedup per projectGuid; fix the catch at :576 to store an explicit error node in `element.children`. |
| 12 | `client/src/extension.ts:295` | Assign the returned DocumentManager back to the module var inside the wrapper (fixes the leak for all call sites). |
| 13 | `client/src/SolutionTreeDataProvider.ts:1088` | Set the openFile command up front (resolve path lazily in the command handler) — removes the getTreeItem fire-and-forget round-trips and fixes the dead-click bug. |

### (b) Structural fixes

1. **One startup pipeline** — make `clarion/solutionReady` the sole completion driver: remove the eager 15s-race fetch (`SolutionCache.ts:811`, `:1073`, `:1116`), the 1s sleep (`SolutionInitializer.ts:390`), and the duplicate `getSolutionTree` registration (`server.ts:1922` vs `solutionManager.ts:556`); share one in-flight fetch promise between `initialize()`/`initializeFromServer()`/`refresh()`.
2. **Replace the shared activation boolean with refcounted/token-scoped suppression, gated on a server `clarion/indexingReady` signal** (`SolutionCache.ts:218/1727`, `SolutionInitializer.ts:347/350/431`) — findFile stays suppressed (local-only) until FRG/validators finish, and no path can un-suppress another's in-flight window.
3. **Batch + index file resolution** — one `clarion/findFiles` batch request per document (`LocationProvider.ts:83`); server-side O(1) basename index instead of the 40-project fan-out (`solutionManager.ts:506`); client O(1) map replacing `findSourceInProject`'s 40×3016 scan (`SolutionCache.ts:1605`); async probes replacing the existsSync sweeps (`SolutionCache.ts:1841-1930`); global negative-cache key at `SolutionCache.ts:1832`.
4. **Inverted reference index** (already tracked #294/#295) — makes CodeLens resolve O(1) and removes per-lens FAR entirely (`server.ts:886`); also lower `FILES_PER_YIELD` 25→5 or add a time-based checkpoint in `cooperativeScan.ts` (the 25-cold-file batch *is* the 0.5-2.8s chunk).
5. **Version-keyed documentSymbol caching on both ends** — client root-path cache by (uri, version) in `StructureViewProvider`; unconditional version-keyed `symbolCache` in `server.ts` onDocumentSymbol.
6. **Debounced, targeted watcher handling** — coalesce .cwproj/.red bursts, in-place DocumentManager rescan instead of dispose/recreate (`FileWatcherManager.ts:73`, `SolutionInitializer.ts:501-517`).

## 3. Decisive experiment

**Instrument the server's LSP dispatch queue: for every inbound request/notification, log `{method, arrivalTs, dispatchStartTs, handlerDurationMs}` (i.e., queue-wait vs self-time per method) for the first 3 minutes after solution open, while reproducing: open solution → expand two project nodes → switch between 3 tabs.**

This single trace decisively arbitrates the top hypothesis:
- If `clarion/getProjectFiles` and `textDocument/documentSymbol` show **large queue-wait, small self-time**, with the queue dominated by `codeLensResolve`, `clarion/findFile`, and didOpen validation bursts → H1 confirmed, and the trace names the exact storm to kill first.
- If the same trace shows **repeat `getProjectFiles` requests for already-expanded projectGuids** right after the solutionReady refresh → H2 confirmed simultaneously (the root-rebuild re-issue).
- If server-side both arrive fast and answer fast yet spinners persist → the fault is purely client-side (H2/H3 render paths), and the trace's request timeline vs the client's `_onDidChangeTreeData.fire()` log pinpoints it.

Cheapest implementation: a `connection.onRequest`/middleware wrapper in `server/src/server.ts` (one function, ~20 lines) writing to the existing perf log — it covers the exact handlers evidence item 7 lists as uninstrumented (`onDocumentSymbol`, `clarion/findFile`, `getSolutionTree` internals, codeLens resolve).