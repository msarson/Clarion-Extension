# Undeclared-variable diagnostic scope audit (6b40d7da)

**Branch:** `chore/undeclared-variable-diagnostic-scope-audit-6b40d7da`
**Base:** `version-0.9.7@e25cf59` (post-`cd957ce3` CHANGELOG migration)
**Investigator:** Eve (2026-05-10 evening)
**GH Issue:** [#115](https://github.com/msarson/Clarion-Extension/issues/115)
**Origin:** Mark's reproducer 2026-05-10 — diagnostic emits "'a' is not declared in this file." on `MyNextProcedure.clw:8` despite hover/F12/FAR all resolving `a` correctly.
**Disposition ask:** Mark, via Bob — sign off on recommendation (B — hybrid fast-path + `SymbolFinder` fallback) before Phase B.

## Executive summary

**Recommendation: Option B — hybrid.** Preserve the diagnostic's existing local `declaredNames` Set as a fast-path; fall through to `SymbolFinderService.findSymbol` on miss. Closes Tiers 5b / 6 / 7 (cross-file coverage gaps) without losing Tier 1 (broad Label walk's Routine-Local coverage).

The bug shape is exactly **`feedback_substrate_symmetry_check` Pattern A**: diagnostic + resolver chain (hover/F12/FAR) are parallel consumers of the same symbol-resolution problem; their scope coverage has diverged. Diagnostic covers Tiers 1-2-3-5a (single-document only); resolvers cover Tiers 2-3-5-6 (and transitively 5b + 7 via FRG). Mark's `a` is declared at Tier 6 (PROGRAM-scope global in `SimpleNewSln.clw:27`) — the resolvers find it; the diagnostic doesn't.

The v1+v2 docstring (UndeclaredVariableDiagnostics.ts:19-22) explicitly admitted: *"Cross-file global resolution is out of scope; if a name isn't declared in the current document the diagnostic fires, so users with cross-file globals should keep the feature off."* Documented intent at v1+v2 time, but the documented narrowness is the bug from a user's perspective — silent false-positive UX per `feedback_silent_regression_pushback`.

## Step 1 — Reproducer

`f:/Playground/SimpleNewSln/MyNextProcedure.clw` is a MEMBER file:

```clarion
  MEMBER('SimpleNewSln.clw')
  MAP
  END
MyNextProcedure PROCEDURE(STRING param1, STRING param2)
  CODE
  a=1                                    ← line 8 — diagnostic fires here
  Message('Hello World from MyNextProcedure!')
```

Variable `a` is declared in the PROGRAM file `SimpleNewSln.clw:27` as `a long` — sitting between the MAP's `END` (line 24) and the program's `CODE` (line 33). Per `project_clarion_scope_model.md` this is **Tier 6 (Global / PROGRAM-scope data)**.

Hover, F12, and FAR resolve `a` because they walk the FRG-driven canonical scope chain (`loadGlobalScopeForCursor` covers Tier 6 cross-file). The diagnostic doesn't — it walks only the current document's tokens.

## Step 2 — Diagnostic walker

Source: `server/src/providers/diagnostics/UndeclaredVariableDiagnostics.ts:72-186` (`validateUndeclaredVariables`).

`declaredNames` set (lines 113-123):

```ts
const declaredNames = new Set<string>();
for (const t of tokens) {
    if (t.type === TokenType.Label && t.value) {
        declaredNames.add(t.value.toUpperCase());
    } else if (t.type === TokenType.Variable && t.value && !isInsideCode(t.line)) {
        declaredNames.add(t.value.toUpperCase());
    }
}
```

The walk operates on the SINGLE-document `tokens` parameter. Two contributors:
- Every `TokenType.Label` (any line) — broad-tolerance "name declared somewhere"
- Every `TokenType.Variable` outside CODE — procedure parameters + structure-shape declarations

Both feed into a `Set<string>` for O(1) name-existence lookup at check time.

**No cross-file resolution.** No `SymbolFinder`, no FRG, no MEMBER-parent walk, no INCLUDE walk.

The v1+v2 docstring (lines 19-22) explicitly admitted this. The narrowness was deliberate then; Mark's reproducer demonstrates it is now too narrow.

## Step 3 — Substrate-symmetry coverage map

Comparing diagnostic walker vs `SymbolFinderService.findSymbol` (the canonical authority for cross-file variable resolution; the engine behind hover/F12/FAR):

| Tier | Diagnostic walker | `SymbolFinder.findSymbol` | Notes |
|------|-------------------|---------------------------|-------|
| 1 (Routine Local) | YES (broad Label walk) | NO | Out of canonical chain; diagnostic's broad-tolerance covers it incidentally |
| 2 (Parameters) | YES (Variable-outside-CODE) | YES (`findParameter`) | Both cover |
| 3 (Procedure Local) | YES (Label walk) | YES (`findLocalVariable`) | Both cover |
| 4 (CLASS via SELF) | N/A (`SELF` is in `BUILT_IN_IDENTIFIERS`, short-circuits at line 249) | NO | Out of canonical chain; diagnostic side-steps via built-in list |
| 5a (Module — same file) | YES (Label walk) | YES (`findModuleVariable`) | Both cover |
| **5b (Module — cross-file MEMBER)** | **NO** | YES (`findModuleVariable` walks parent MEMBER file via `findMemberParentFile`) | **Resolver-only.** Tier-5b regression surface for the diagnostic. |
| **6 (Global / PROGRAM)** | **NO** ← Mark's reproducer | YES (`findGlobalVariable` async; FRG-driven) | **Resolver-only.** The headline gap. |
| **7 (INCLUDE'd content)** | **NO** | YES (transitively via FRG INCLUDE-chain walks) | **Resolver-only.** Wildcard tier — depends on what's INCLUDE'd. |

**Substrate-symmetry pattern confirmed** — same-shape divergence as `10ea5a80` / `0c289e16` / `9142af9f` shipped earlier today: parallel consumers of the same data, scope coverage drifts when one path gets new substrate without the other catching up.

## Step 4 — Recommendation

### Three options surveyed

#### Option A — Drop local Set; route through `SymbolFinder.findSymbol` per name

```ts
for (each checkable name token in CODE) {
    const resolved = await symbolFinder.findSymbol(name, document, position);
    if (!resolved) diagnostics.push(makeDiagnostic(...));
}
```

**Pros:**
- Maximum substrate-consolidation — diagnostic becomes a thin wrapper over the canonical scope chain. Future tier additions (when a Tier 4 SELF.x walk lands, or when Tier 1 Routine-Local explicit support is added) accrue to the diagnostic for free.
- Eliminates parallel-implementation drift entirely.

**Cons:**
- **Loses Tier 1 (Routine Local) coverage.** SymbolFinder doesn't walk Routine Local data per `project_clarion_scope_model.md`'s tier-7-of-canonical-chain note. The diagnostic's broad Label walk catches it incidentally today; this option drops that coverage and would surface false-positives on legitimate Routine-Local references. **Regression.**
- Per-name async lookup × N names × per-call cost. SymbolFinder is async (FRG global lookup); for files with many references the validate cycle slows. The current Set-based lookup is O(1) per check.

#### Option B — Hybrid: local Set fast-path + `SymbolFinder` fallback ⭐ **RECOMMENDED**

```ts
for (each checkable name token in CODE) {
    if (declaredNames.has(name.toUpperCase())) continue;          // existing fast-path
    const resolved = await symbolFinder.findSymbol(name, document, position);  // new fallback
    if (resolved) continue;                                       // tier 5b / 6 / 7 hit
    diagnostics.push(makeDiagnostic(...));
}
```

**Pros:**
- **Preserves Tier 1 broad-Label coverage** — local Set still seeds from the existing walk; existing v1+v2 surface stays GREEN.
- **Adds Tiers 5b + 6 + 7 coverage** via the fallback — Mark's reproducer GREEN on this option.
- **Performance-friendly** — most legitimate names hit the fast-path; only suspicious names trigger the expensive walk. On healthy code the suspicious-name count is small (these ARE the candidate diagnostics).
- Substrate-symmetry partial-consolidation — fallback path consumes the canonical resolver, so future tier additions there propagate to the diagnostic. Local Set remains the authoritative same-document source.

**Cons:**
- Two-layer logic (fast-path + fallback) is slightly more complex than the current single-Set check, but the layering is local to the validator function.
- Async fallback per-miss means `validateUndeclaredVariables` becomes `async`. Caller (`DiagnosticProvider`) needs to await it; existing callers should already be async-compatible (diagnostic publishing is async-driven), but verify.

#### Option C — Extend diagnostic's own walk: import `buildFileVarTypeIndex` + `loadGlobalScopeForCursor`, replicate per-tier walking

**Pros:**
- All-tiers-in-one-pass — no fallback layer.
- Sync (no `async` propagation needed).

**Cons:**
- **REPLICATES SymbolFinder's logic** — exactly the parallel-implementation drift Pattern A is meant to prevent. New parallel substrate consumer is added; future drift between diagnostic's walker and resolver's walker becomes a new silent-asymmetry surface.
- More invasive change (diagnostic file imports FRG / FileRelationshipGraph indirectly via the helpers).
- No Tier 4 (SELF) or Tier 1 (Routine Local) — `buildFileVarTypeIndex` doesn't cover those any more comprehensively than the current Label walk does.

**Not recommended** — antithetical to the substrate-symmetry discipline this codebase has been actively reinforcing today (`10ea5a80` / `0c289e16` / `feedback_substrate_symmetry_check`).

### Recommendation: Option B

Hybrid is the architecturally appropriate match for the v1+v2 design AND the new requirement. The local Set captures the v1+v2 "is this name declared anywhere in this document?" tolerance (including Tier 1); the SymbolFinder fallback captures the "is this name declared anywhere reachable cross-file?" extension (Tiers 5b / 6 / 7). Both are correct reads of "declared somewhere this code can reach"; together they cover the full canonical scope chain.

## Suggested Phase B test contract

Per the bidirectional-pin discipline (`feedback_bidirectional_pin_assertion`) + cross-tier sentinel framing (per Bob's mid-flight add):

| # | Shape | Tier covered | Pre-fix | Post-fix |
|---|-------|--------------|---------|----------|
| 1 | (BUG PIN — Tier 6 Global/PROGRAM) Mark's reproducer fixture; `a` declared in PROGRAM file, used in MEMBER file's PROCEDURE CODE; assert diagnostic does NOT fire on `a` | 6 | RED (fires) | GREEN (no fire) |
| 2 | (BUG PIN — Tier 5b cross-file MEMBER) `b` declared at MODULE scope in `MemberA.clw`, used in `MemberB.clw` (same parent PROGRAM); assert diagnostic does NOT fire on `b` in `MemberB` | 5b | RED | GREEN |
| 3 | (REGRESSION — Tier 1 Routine Local preserved) variable `r` declared in a ROUTINE's `DATA` section, used inside that routine's `CODE`; assert diagnostic does NOT fire | 1 | GREEN | GREEN |
| 4 | (REGRESSION — Tier 3 Procedure Local preserved) standard procedure-local declaration; assert no fire | 3 | GREEN | GREEN |
| 5 | **(CROSS-TIER SENTINEL — bidirectional)** Same fixture as test 1, plus a SECOND name `b` that is genuinely undeclared anywhere; assert diagnostic does NOT fire on `a` (Tier 6 declared) AND DOES fire on `b` (genuinely undeclared) | 6 + null | both RED | both GREEN |
| 6 | (REGRESSION — built-in shortcut) `SELF.Method` in a class method; assert no fire on `SELF` | 4 (built-in) | GREEN | GREEN |

Test 5 is the bidirectional anchor against the "fix widened too far + masked everything" failure mode — it ensures the v1+v2 surface (real undeclared-name catching) STILL fires post-fix. Per `feedback_non_x_regression_sentinel`, the test discriminates broadening-vs-masking.

## Tier 7 (INCLUDE'd content) — separate-flag framing

Tier 7 is a wildcard. If `a` is declared in a `.inc` chained from the cursor file, the resolver chain catches it via FRG INCLUDE-walks. The diagnostic in Option B inherits that coverage automatically through `SymbolFinder`'s walk.

But: if Tier 7 surfaces additional edge cases (cycle detection, performance on deep INCLUDE chains, namespace-collision corners), those may warrant a follow-up rather than blocking the Tier-5b/6 fix. Per Bob's mid-flight flag, surface this as a separate consideration in the Phase B PR — does Tier 7 work end-to-end on real-world code with deep INCLUDE chains? If yes, ship together; if a corner surfaces, file Tier 7 follow-up rather than expand scope.

## Risk notes

1. **Performance under heavy false-positive load**: Option B's fallback fires once per code-section name token NOT in the local Set. On a file referencing many cross-file globals, fallback firing rate is high. Each fallback is async + FRG-driven. Worst-case validation latency increases. Mitigation: cache `findGlobalVariable` results within a single validation cycle (the hot path). Phase B should include a perf check — if validate cycle on a representative large file slows by >100ms, add per-cycle memoization.

2. **`async` propagation**: `validateUndeclaredVariables` becomes async. `DiagnosticProvider` likely already awaits; quick verify in Phase B.

3. **Substrate-symmetry maintenance**: when future tier additions land in `SymbolFinder` (e.g. explicit Tier 1 / Tier 4 support), the diagnostic gets them automatically through the fallback. This is the intended-and-positive consequence — no scheduled drift.

4. **Tier 1 Routine Local edge case**: Option B preserves Tier 1 via the local Label walk. If Phase B ever migrates the local Set away (toward Option A's pure SymbolFinder route), Tier 1 must be added to SymbolFinder explicitly — file as an explicit prerequisite.

## Suggested follow-ups

| ID | Title | Trigger |
|---|---|---|
| FOLLOWUP-1 | Tier 1 (Routine Local) explicit support in `SymbolFinder.findSymbol` — would let Option A become viable in a future iteration | Independent; eligible for low-priority backlog |
| FOLLOWUP-2 | Per-validation-cycle memoization of `findGlobalVariable` — bound the worst-case async-call cost | Sequence with or after Option B Phase B if perf concern surfaces |
| FOLLOWUP-3 | Audit other diagnostic providers in `server/src/providers/diagnostics/` for the same parallel-implementation drift — Pattern A says "every consumer of the same data shape" | Independent; high systemic value |

## Branch / artefact

This report is the Phase A deliverable, committed as a doc artefact on `chore/undeclared-variable-diagnostic-scope-audit-6b40d7da`.

No production-code changes were made.
