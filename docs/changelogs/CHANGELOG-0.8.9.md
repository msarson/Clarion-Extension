# Version 0.8.9 - 2026-04-13

[← Back to Changelog](../../CHANGELOG.md)

## 🎯 Overview

A security-focused patch release resolving Dependabot alerts in dev dependencies and replacing the deprecated `vscode-test` package.

---

## 🔒 Security

- **`serialize-javascript`** — RCE via `RegExp.flags` and CPU exhaustion DoS (via mocha transitive dependency)
- **`diff`** — Denial of Service in `parsePatch`/`applyPatch` (via mocha transitive dependency)
- Replaced deprecated **`vscode-test`** with **`@vscode/test-electron`** in client (fixes `@tootallnate/once` vulnerability)

---

[← Back to Changelog](../../CHANGELOG.md)
