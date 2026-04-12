# Contributing to Clarion Extension

Thanks for your interest in contributing! Please read the following before opening a PR.

## Branching Model

This project uses a simple release-branch model:

| Branch | Purpose |
|--------|---------|
| `master` | Stable released code — only updated at release time |
| `version-X.X.X` | Active development for the next release |

**Always branch from and target the current development branch** (e.g. `version-0.8.8`), not `master`. You can see which branch is the current development branch by checking the repository's default branch.

PRs targeting `master` directly will be asked to retarget.

## Getting Started

```bash
git clone https://github.com/msarson/Clarion-Extension.git
cd Clarion-Extension
git checkout version-0.8.8   # or whatever the current default branch is
npm install
npm run compile
```

## Development

```bash
npm run watch        # continuous rebuild
npm run test:server  # run server-side tests (no VS Code needed)
npm run test:client  # run client tests (requires VS Code Extension Host)
```

Press **F5** in VS Code to launch an Extension Development Host for manual testing.

## Submitting a PR

1. Fork the repo
2. Branch from the current development branch (`version-X.X.X`)
3. Make your changes with tests where applicable
4. Ensure `npm run test:server` passes
5. Open a PR targeting the current development branch

## Release Process

Releases are handled by the maintainer via the **Release** GitHub Actions workflow, which:
- Merges the version branch into `master`
- Builds and packages the VSIX
- Creates a GitHub release
- Publishes to the VS Code Marketplace
- Creates the next development branch and sets it as default
