# ViewJoinTest — a hand-coded VIEW fixture

Every other project under `test-programs/` is generated or excerpted. This one is
hand-written, and exists to record what the **Clarion compiler actually accepts** in a
VIEW structure, so diagnostics that validate VIEW/PROJECT/JOIN can be checked against
the language rather than against assumption.

Verified against **Clarion 10.0.12567** (`F:\DirectSystems\Clarion10`), TopSpeed driver,
built with MSBuild. It compiles and links cleanly — the `PRAGMA('link(ClaTPS.lib)')` is
what pulls the driver in; without it the compile still succeeds and only the link fails
with `Unresolved External TOPSPEED`.

## What it pins

`viewjoin.clw` declares three VIEWs over the same two files:

1. **`ViewPrefix`** — `JOIN(CUS:CusKey, …)` / `PROJECT(CUS:Name)`. The prefixed form the
   app generator emits.
2. **`ViewDotted`** — `JOIN(Customer.CusKey, …)` / `PROJECT(Customer.Name)` /
   `PROJECT(Orders.ID)`. **Dot notation is legal**, for both the JOIN's key and the
   projected fields. Uncommon in generated code, plausible in hand-written code.
3. **`ViewShortEnd`** — the JOIN closed with a period rather than `END`. Also legal.

Two rules were established by compiling deliberately-wrong variants, and are worth
knowing before "fixing" a diagnostic:

- **The compiler resolves the dotted name.** `JOIN(Customer.NoSuchKey, …)` fails with
  `Field not found: NOSUCHKEY`, so variant 2 compiling is acceptance, not indifference.
- **`PROJECT` may not follow a `JOIN`.** Moving `PROJECT(ORD:Total)` after the JOIN in
  variant 3 fails with `All fields must be declared before JOINs`. A VIEW body is
  therefore projections first, then joins — so "ownership returns to the FROM file after
  a JOIN ends" describes source that cannot compile.

## The JOIN field list resolves against the PARENT file

Established for #467 by compiling this fixture with one line changed per case:

| variant | result |
|---|---|
| `JOIN(CUS:CusKey, ORD:NoSuchField)` | `Field not found in parent FILE` |
| `JOIN(CUS:CusKey, CUS:Name)` | `Field not found in parent FILE` |
| `JOIN(CUS:CusKey, CUS:ID)` | compiles |

So a JOIN's field list is resolved against the **parent** file, **by field
name, with the prefix ignored**. The third row is the trap: `CUS:ID` carries the
joined file's prefix and still compiles, purely because the parent `Orders` also
has a field called `ID`. Read alone it looks like proof that the joined file is
consulted, and it is not — row two is the one that settles it.

This is why the JOIN loop in `StructureDiagnostics.ts` is left dormant rather
than repaired: its premise (fields belong to the joined file) is wrong, and
making it resolve emits false positives on the prefixed form every app
generator emits.

Also compiler-verified, for the dotted form: `PROJECT(Orders.Total)` inside
`JOIN(Customer.CusKey, ...)` fails with `Field not found in parent FILE`. A dot
qualifier therefore does **not** override the enclosing JOIN's scope — it is a
qualifier to strip, not an owner to honour.

## Building it

```
msbuild ViewJoinTest.cwproj /t:build /p:Configuration=Debug /p:Platform=Win32 ^
        /p:ClarionBinPath=<your Clarion>\bin /p:clarion_Sections=Debug
```

Two traps, both of which cost time the first go:

- The source must be **CRLF**. With LF-only endings the compiler reads the whole file as
  line 1 and reports a cascade of `Illegal character` errors that look like syntax
  problems and are not.
- Drive MSBuild from **PowerShell or cmd**, not Git Bash — MSYS rewrites `/t:build` into
  a path and MSBuild answers `MSB1008: Only one project can be specified`.

## Adding a shape

Add it as a fourth VIEW and rebuild. If it compiles, it is legal Clarion and any
diagnostic that flags it is wrong; if it does not, paste the compiler's exact message
here. That is the whole value of this project — the compiler is the authority, not the
documentation and not us.
