# Bare local CLASS self-instance never resolves as a dot-call receiver (hover/F12/discarded-return alike)

## Summary

A local CLASS declared without `,TYPE` and without a separate instance variable — the label doubles as both the type and the single instance, exactly like a bare `QUEUE`/`GROUP`/`FILE` local — never resolves as a navigable receiver:

```clarion
MyOwn:CLASS CLASS
My:My:Method  PROCEDURE(), LONG
            END

Caller PROCEDURE()
  CODE
  MyOwn:CLASS.My:My:Method()   ! compiler warns "Calling function as procedure" — extension stays silent
```

Confirmed colon-independent: the plain-name equivalent (`MyClass CLASS ... END` / `MyClass.Method()`, no colons anywhere) reproduces identically. Only `validateDiscardedReturnValues` was checked directly, but the root cause sits in shared resolution code, so hover and go-to-definition on this receiver shape are suspected to share the gap — not yet verified.

## Root cause

`MemberLocatorService.extractTypeFromToken` (server/src/services/MemberLocatorService.ts) resolves a bare local structure declaration (no `(TypeName)` argument) to its own label as a navigable type — but only for QUEUE/GROUP/FILE. CLASS is explicitly excluded, in both branches that handle this shape:

```ts
if (token.type === TokenType.Structure && token.label) {
    const structureKeyword = token.value.toUpperCase();
    if (structureKeyword === 'CLASS') return null;   // ← excluded here
    return { typeName: token.label, isClass: structureKeyword === 'CLASS', isReference };
}
```

(and again a few lines down, inside the `bareStructures` branch). Both guards trace to commit `45104d4` ("Fix nested queue/group chain completion", 2026-07-05), which extended self-instance resolution from "always null" to cover QUEUE/GROUP/FILE — CLASS was left on the old `return null` path. The commit message and diff don't explain why CLASS was excluded; may have been deliberate (avoiding some CLASS-specific side effect through this same shared path) or simply out of that commit's scope.

## Why this matters

`Label CLASS ... END` (no `,TYPE`) is valid, idiomatic Clarion for a single local class instance — the compiler accepts calls on it and warns on discarded non-PROC returns exactly like any other receiver. Every LSP feature routed through `extractTypeFromToken` (hover, F12/definition, references, and this diagnostic) is blind to this receiver shape.

## Fix sketch (not yet implemented)

Mirror the QUEUE/GROUP/FILE branch for CLASS in both guards — `structureKeyword === 'CLASS'` should return `{ typeName: token.label, isClass: true, isReference }` instead of `null`. Needs a check across hover/definition/references tests (not just RVD) before proposing, since `extractTypeFromToken` is shared, and a look at why the Jul 2026 commit excluded CLASS specifically before assuming it was just scope, not a deliberate guard against something else.

## Status

Found 2026-09-02 while fixing the colon-in-dot-call-receiver bug in `ReturnValueDiagnostics.ts` (DOTCALL_PREFIX regex — separate, already-fixed issue). No PR yet.
