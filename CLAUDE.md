# Clarion-Extension — agent notes

## Perf verification: use the local real-solution rig, not synthetic fixtures

For any measure-the-logs perf issue (hover/F12/references latency, startup cost,
event-loop freezes), verify against the **real solution copied to this machine**
— do not build a VSIX and wait for a VM retest, and do not trust small synthetic
fixtures for perf claims.

> **The test solution is a client's private source.** Its path, its file names and
> its shape live in the gitignored `CLAUDE.local.md`, never here and never in a
> commit message, issue, PR or script default — this file is checked into a public
> repository. Report corpus results as "nothing else moved", not as file names or
> counts that describe someone else's application.

- **Headless driver:** `scripts/perf/lsp-driver.js` — forks the built server
  over IPC, mirrors the real client's startup (initialize → `clarion/updatePaths`
  → solutionReady → didOpen), runs timed requests cold-then-warm, and captures
  every server `*.Perf` line to a log. Run `npm run compile` first. The solution
  and file default to the ones named in `CLAUDE.local.md`.

```
node scripts/perf/lsp-driver.js            # warm run against the configured solution
node scripts/perf/lsp-driver.js --cold     # true cold start (wipes the %TEMP% caches)
node scripts/perf/lsp-driver.js --sln=... --file=...
node scripts/perf/lsp-driver.js --diag-status   # assert clarion/diagnosticsStatus ordering (#460); exit 0 = all pass
node scripts/perf/lsp-driver.js --link-refresh  # assert document links reach the editor on startup (#620); exit 0 = all pass
```

- **Cold runs:** the server persists mtime-validated caches under
  `%TEMP%\clarion-extension-{sdi,frg,chainindex,siblingindex,refindex,reachableset,iv}`.
  `--cold` deletes them (safe — they rebuild). Always report cold and warm
  separately; never let borrowed cache warmth pass as a cold result.
- Perf channels are enabled by the driver via
  `initializationOptions.settings.log.performance.enabled` — the `Hover slow`,
  `StartupPerf`, and `EventLoop lag | max_blocked_ms` lines are the acceptance
  evidence (`max_blocked_ms` is the "freeze" metric).
- Reference baselines for the configured solution are in `CLAUDE.local.md`. Always
  compare against those rather than against a number quoted in an issue.

What still needs a human: PWEE-embeditor scenarios (live Clarion IDE), UI
feel/rendering judgments, and VM-parity absolute timings.

## Real-code sweeps: run one before and after a change

**A fixture proves the fix; these do not.** What a sweep adds is surprise — a
fixture only ever contains the cases we thought of, and a corpus catches what we
did not predict. So lead with the fixture, and read a sweep only as "nothing else
moved". A sweep that reports 0 changed because the corpus holds no instance of the
shape is evidence of nothing at all: check whether the shape is even present before
quoting the result (#618 and #623 both hit exactly that).

Each writes a snapshot, and `--against=<earlier snapshot>` prints exactly which
results moved and how. A fix should move its own cases and nothing else; a
refactor should move nothing. Run `npm run compile` first. The corpus is the
private solution configured in `CLAUDE.local.md` — never name its files in a
commit, issue or PR.

```
node scripts/health/hover-definition-agreement.js --json=a.json [--against=prev.json]  # ~70-100s, real server
node scripts/health/document-symbols.js --out=a.tsv [--against=prev.tsv]               # ~30s, in-process
node scripts/health/self-members.js --out=a.tsv [--against=prev.tsv]                   # ~7-13 min, in-process
node scripts/health/cards.js --positions=<agreement json> --out=a.json [--against=prev.json]  # ~2 min, real server
```

- **hover-definition-agreement**: hover and Go to Definition resolve a word
  through separate pipelines and drift apart. It samples ~450 code positions
  across the corpus (deterministic), asks the running server for both, and reports
  `mismatch`, `f12-only` and `hover-only` per reference shape. Fixture
  counterpart: `server/src/test/HoverDefinitionAgreement.test.ts`; both
  classify with `server/src/test/support/hoverDefinitionAgreement.ts`. A known
  disagreement sits in the test's `KNOWN` table with its issue; remove the
  entry when the fix makes it agree. Since #636 it also asks Go to
  Implementation at each position and judges it against F12's answer (to the
  body when F12 names a procedure, method or routine; nowhere else otherwise):
  a second table, a `KNOWN_IMPLEMENTATION` table in the same test, and
  `ImplementationAgreement.test.ts` for every `ProcedureCallDetector` shape
  through all three features. A snapshot from before #636 compares hover and
  F12 only.
- **document-symbols**: every outline entry of every file (the Structure view,
  breadcrumbs and workspace/symbol all read it).
- **cards**: the full hover text and the F12 target at the agreement sweep's
  positions (pass its --json as --positions). The agreement sweep compares
  locations only; this shows every card whose wording or links moved - the
  check for a refactor of how a card is built (#651).
  The agreement sample almost never lands on a chain member (`SELF.Q.Field`);
  `node scripts/health/chain-positions.js out.json [300]` draws those, in the
  same shape, for cards.js (#652).
- **self-members**: what each `SELF.x` resolves to through the SELF lookup
  hover, F12 and Ctrl+F12 use (no solution index in-process, so members
  inherited from a class the includes do not reach read null). A snapshot
  from before #637 is of the retired ClassMemberResolver engine.

Shared plumbing: `scripts/health/corpus.js` (walk, snapshot, compare) and
`scripts/health/lsp-session.js` (server startup and settle).

## Working rules

- **One branch per change — and delete it once it lands.** Never work on a
  `version-x.y.z` branch directly: cut `fix/…` or `feat/…` off it first, FF-merge
  back, then `git branch -d` it, and `git push origin --delete` it as well if it
  was ever pushed. A fast-forward merge leaves the topic branch sitting on the
  merged commit and nothing else removes it, so the backlog is silent and grows
  once per change: by 2026-09-18 it was 93 local and 14 remote stale branches.
  GitHub's "automatically delete head branches" does not help here — it fires
  only on a PR merge, and our own work does not go through a PR. The same applies
  to the `pr-NNN` refs from `git fetch origin pull/N/head:pr-N` when reviewing a
  contributor PR locally, and to any `verify/…` branch used to test that two PRs
  compose.
- **TDD: red then green.** Write the failing test first and *watch it fail* for
  the right reason before touching the implementation. A test written after the
  fix proves nothing about the fix. Report the red run, not just the green one.
- **Check the Clarion help before asserting language behaviour.** The official
  help ships with every Clarion install as `bin\ClarionHelp.chm` (4,686 topic
  pages, one per keyword — e.g. `map__declare_procedure_prototypes_`,
  `private__set_procedure_private_to_a_class_or_module_`), with the Language
  Reference and ABC Library Reference PDFs in `docs\`; this machine's install
  path is in `CLAUDE.local.md`. If a `clarion-help` skill is
  available in your session, prefer it — it is a searchable conversion of the
  same help. Either way it is SoftVelocity's copyrighted material: quote from it
  to answer, never copy it into this repo. **The help mixes in Clarion.NET
  pages** — check the breadcrumb: Win32 language pages read `Language Reference
  > 2 - Program Source Code Format`. Where the docs are ambiguous or silent,
  settle it by compiling a fixture (see the compiler-verified notes in
  `test-programs/`) — and say which source settled it.

## Other repo conventions

- Tests are **Mocha** (tdd ui: `suite`/`test`/`setup`), not Jest. `npm test`
  runs the server suite.
- `version-x.y.z` branches have a pre-commit hook blocking direct source
  commits — branch off, then FF-merge back (FF bypasses the hook).
- CHANGELOG.md gets a lean entry in the same commit as any user-facing change,
  in the #492 style: no emoji; under an area subheading (`Navigation and hover`,
  `Diagnostics`, `Performance`, `Configuration and build`, `Syntax`, `Editing`,
  `Maintenance`); a bold short statement ending in a full stop, one or two
  plain sentences, the issue/PR link, then `@handle` if contributed. Cause
  narrative, measurements and test counts stay in the issue and commit. At
  release time the section head gets the shields.io pills
  (`fixes` 1f6feb · `new` 2da44e · `performance` 8250df, `?style=flat-square`)
  and a one-to-two-sentence lead; the three newest versions stay in full,
  older ones become a Highlights block linking `dev/docs-internal/changelogs/`
  (that folder is gitignored — `git add -f` new archives).
- Release packaging: run `npm run bundle` before `vsce package` if the VSIX
  comes out with hundreds of files (the `rimraf` in `package:release` can miss,
  leaving the tsc tree in `out/`; a correct bundle VSIX is ~26 files).
- **One Node runtime, declared in four places.** `engines.vscode ^1.97.0` means
  Electron 32.2.7, which bundles Node 20 (VS Code 1.97.0 `.npmrc` → Electron
  `DEPS`: v20.18.1). So `.nvmrc`, `engines.node`, `@types/node` and the CI
  `setup-node` step (which reads `.nvmrc`) all say 20, and they move together
  whenever `engines.vscode` is raised. The dev box may run a newer Node, and V8
  differs between majors (a `(?i:` regex passed on Node 26 and failed the 1.0.3
  dry run, #490), so run `npm run test:node20` — the suite under Node 20 via
  `npx node@20` — before any release dry run (#491).
