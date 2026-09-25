# Contributing to Clarion Extension

Thanks for your interest in contributing! Please read the following before opening a PR.

## Branching Model

This project uses a simple release-branch model:

| Branch | Purpose |
|--------|---------|
| `master` | Stable released code — only updated at release time |
| `version-X.X.X` | Active development for the next release |

**Always branch from and target the current development branch** (e.g. `version-1.0.4`), not `master`. The current development branch is the **highest-numbered `version-x.y.z` branch** in the [branch list](https://github.com/msarson/Clarion-Extension/branches) — normally also the repository's default branch, but check the branch list rather than relying on that.

If you open a PR against `master` by mistake, don't close it — change the base in the **`base:`** dropdown at the top of the PR, or just say so and a maintainer will retarget it for you. Nothing is lost either way.

Note that a PR opened against `master` will show a diff containing every commit already merged into the development branch, which can look alarmingly large. Retargeting reduces it to your actual change.

## Getting Started

The extension runs inside VS Code's extension host, which is **Node 20** for the oldest VS Code we support (1.97). Develop on the same Node so that what passes for you passes in CI and in the editor. `.nvmrc` pins it; `nvm use` (or `nvm install`) picks it up. Any other Node works for editing, but npm will warn and V8 differences have bitten us before (#490).

```bash
git clone https://github.com/msarson/Clarion-Extension.git
cd Clarion-Extension
git checkout version-x.y.z   # the current development branch — see "Branching Model" above
nvm use                      # Node 20, from .nvmrc
npm ci                       # exact versions from package-lock.json
npm run compile
```

Use `npm ci` rather than `npm install`: it installs exactly what the lockfile says and does not rewrite it. The `client/` and `server/` folders carry their own lockfiles for their packages, but the root install is all that compiling and testing need.

## Keeping a fork current

The toolchain moves occasionally (TypeScript, the language-server libraries, the Node line). After pulling or rebasing onto the development branch, if `package-lock.json` changed, run `npm ci` again before doing anything else. A stale `node_modules` fails at compile time with errors that look unrelated to your change, such as an unknown `moduleResolution` value or missing `vscode-languageserver` types.

## Development

```bash
npm run watch        # continuous rebuild
npm run test:server  # server suite (Mocha, no VS Code needed)
npm run test:client  # client suite (also Mocha; runs without an Extension Host)
npm run test:node20  # the server suite under Node 20 via npx, whatever Node you run locally
```

Press **F5** in VS Code to launch an Extension Development Host for manual testing. If it stops with "Extension host did not start in 10 seconds" (a VS Code 1.139 debugger bug), see [#665](https://github.com/msarson/Clarion-Extension/issues/665) for the workaround script.

Tests are Mocha with the `tdd` interface (`suite` / `test` / `setup`), run against the compiled output in `out/`, so compile first (or keep `npm run watch` running). A few things worth knowing when writing them:

- A diagnostic's `message` is typed `string | MarkupContent` by the protocol; read it as `String(d.message)` before calling string methods on it.
- Language behaviour claims are settled by the Clarion help or by compiling a fixture; `test-programs/` holds the compiler-verified ones.
- Write the failing test first and watch it fail for the right reason before changing the implementation.

## Submitting a PR

1. Fork the repo
2. Branch from the current development branch (`version-X.X.X`), one branch per change
3. Make your changes with tests where applicable
4. Add a one-line entry to `CHANGELOG.md` under the unreleased version for any user-facing change
5. Ensure `npm run compile` is clean and `npm run test:server` and `npm run test:client` pass — under Node 20 (`npm run test:node20` if you develop on another version)
6. Open a PR targeting the current development branch

Every PR runs the same install, compile and test steps on a Windows runner (the suite depends on a case-insensitive filesystem, exactly as the Clarion compiler does), so a red check there is the same failure you would see locally on Node 20.

## Release Process

Releases are handled by the maintainer via the **Release** GitHub Actions workflow, which:
- Merges the version branch into `master`
- Builds and packages the VSIX
- Creates a GitHub release
- Publishes to the VS Code Marketplace
- Creates the next development branch and sets it as default
