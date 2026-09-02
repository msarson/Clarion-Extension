# fix(diagnostics): dot-call receiver/method names containing ':' skip the discarded-return-value check

**Branch:** `geircodes/Clarion-Extension:fix/discarded-return-colon-receiver` → `msarson/Clarion-Extension:version-1.0.2`

## What happened

The compiler warns "Calling function as procedure" for a discarded non-PROC return value on a
dot-call, but the extension's equivalent diagnostic (`validateDiscardedReturnValues`, closes #61)
silently skips the line when the receiver's label contains a `:` — a common Clarion naming
convention:

```clarion
My:StringTheory   StringTheory
St                StringTheory
  CODE
  My:StringTheory.IsEmpty()   ! compiler warns, extension is silent
  St.IsEmpty()                ! identical shape, no colon — extension warns correctly
```

## Root cause

`ReturnValueDiagnostics.ts`'s `DOTCALL_PREFIX` regex matched both the receiver and method-name
groups as `[A-Za-z_][A-Za-z0-9_]*` — no `:`. Clarion labels legally contain colons (the
tokenizer's own `Label` pattern documents this: `[A-Za-z_][A-Za-z0-9_:]*`), so
`My:StringTheory.IsEmpty()` never matched the regex at all; the whole line was skipped before any
resolution ran. Same gap on the method-name side for a colon-containing member label (e.g.
`Obj.My:Method()`).

## Fix

Widen both capture groups in `DOTCALL_PREFIX` to allow `:`:

```ts
const DOTCALL_PREFIX = /^([A-Za-z_][A-Za-z0-9_:]*)\.([A-Za-z_][A-Za-z0-9_:]*)/;
```

Traced the downstream use of the captured `objectName`/`methodName` strings (passed as-is into
`memberLocator.resolveVariableType` / `resolveDotAccess` / class-member map lookups) — all take
the full string, so this is a self-contained regex change with no other logic depending on either
name being colon-free.

## Testing

New `ReturnValueDiagnostics.ColonReceiver.test.ts`: colon-named receiver warns on a discarded
non-PROC return (matching a plain-named receiver in the same file), stays silent when the method
has the `PROC` attribute, and a colon-named *method* on a normally-resolved instance also warns.

`npx tsc -b`: clean. `npm run test:server`: 2436 passing, 25 failing — all 25 pre-existing on
`origin/version-1.0.2` (confirmed identical with this change reverted), unrelated to this fix.

## Scope

One file (`ReturnValueDiagnostics.ts`, one regex) plus one new test file. Unrelated to any
in-flight feature work.

## Follow-up (not in this PR)

While verifying this fix, found that a receiver which is itself a bare local `CLASS` instance
(`MyOwn:CLASS CLASS ... END`, no `,TYPE`, label doubles as the instance — `MyOwn:CLASS.Method()`)
never resolves as a dot-call receiver at all, colon or not — a separate, pre-existing gap in
`MemberLocatorService.extractTypeFromToken` (shared by hover/definition/references too). Details
in `_notes/issue-bare-class-self-instance-receiver.md`; no PR yet.
