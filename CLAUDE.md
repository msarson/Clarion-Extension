# Clarion-Extension — agent notes

## Perf verification: use the local real-solution rig, not synthetic fixtures

For any measure-the-logs perf issue (hover/F12/references latency, startup cost,
event-loop freezes), verify against the **real copied solution** on this machine
— do not build a VSIX and wait for a VM retest, and do not trust small synthetic
fixtures for perf claims.

- **Test solution:** `F:\DirectSystems\AppDev\ap1.sln` — 40 projects / 3,016
  sources; `genfiles\src\IBSCommon.clw` (856K) is the canonical big generated
  file. `IBS.sln` in the same folder is a small 2-project variant.
- **Clarion install:** `F:\DirectSystems\Clarion10` (10.0.12567), registered as
  the **"DirectSystems"** version in
  `%APPDATA%\SoftVelocity\Clarion\10.0\ClarionProperties.xml` — redirection and
  libsrc resolve fully on this machine.
- **Headless driver:** `scripts/perf/lsp-driver.js` — forks the built server
  over IPC, mirrors the real client's startup (initialize → `clarion/updatePaths`
  → solutionReady → didOpen), runs timed requests cold-then-warm, and captures
  every server `*.Perf` line to a log. Run `npm run compile` first.

```
node scripts/perf/lsp-driver.js            # warm run against ap1.sln
node scripts/perf/lsp-driver.js --cold     # true cold start (wipes the %TEMP% caches)
node scripts/perf/lsp-driver.js --sln=... --file=...
```

- **Cold runs:** the server persists mtime-validated caches under
  `%TEMP%\clarion-extension-{sdi,frg,chainindex,siblingindex,refindex,reachableset,iv}`.
  `--cold` deletes them (safe — they rebuild). Always report cold and warm
  separately; never let borrowed cache warmth pass as a cold result.
- Perf channels are enabled by the driver via
  `initializationOptions.settings.log.performance.enabled` — the `Hover slow`,
  `StartupPerf`, and `EventLoop lag | max_blocked_ms` lines are the acceptance
  evidence (`max_blocked_ms` is the "freeze" metric).
- Reference baselines (2026-07-18, this machine): solutionReady 40 projects
  ≈100ms; SDI cold build 4,104 files ≈2.0s; worst acceptable `max_blocked_ms`
  ≈1.5s (one big-file tokenize).

What still needs a human: PWEE-embeditor scenarios (live Clarion IDE), UI
feel/rendering judgments, and VM-parity absolute timings.

## Other repo conventions

- Tests are **Mocha** (tdd ui: `suite`/`test`/`setup`), not Jest. `npm test`
  runs the server suite.
- `version-x.y.z` branches have a pre-commit hook blocking direct source
  commits — branch off, then FF-merge back (FF bypasses the hook).
- CHANGELOG.md gets a lean entry in the same commit as any user-facing change.
- Release packaging: run `npm run bundle` before `vsce package` if the VSIX
  comes out with hundreds of files (the `rimraf` in `package:release` can miss,
  leaving the tsc tree in `out/`; a correct bundle VSIX is ~26 files).
