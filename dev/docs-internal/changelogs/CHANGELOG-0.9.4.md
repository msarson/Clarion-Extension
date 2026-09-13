# Changelog — 0.9.4 (2026-04-19)

Archived from the main CHANGELOG.md on 2026-09-13 (1.0.3 release). Full text as published.

**Release fix** — the v0.9.3 release package was built before all branch commits were pushed to origin, so 50+ commits were missing from the published VSIX. This release includes everything that was intended for v0.9.3:

- ✨ Hover documentation for `PROP:`, `PROPPRINT:`, and `EVENT:` equates (336 + 25 + 63 entries)
- ✨ Autocomplete for `PROP:`, `PROPPRINT:`, and `EVENT:` equates
- ✨ CodeLens inline reference counts above procedures and CLASS declarations (#72)
- ✨ Flatten continuation lines code action (#70)
- ✨ Expand Selection through structure nesting — `Shift+Alt+→` (#71)
- ✨ Warn on discarded plain MAP/MODULE procedure return values (#51)
- 🐛 INTERFACE member hover, go-to-definition, and Find All References for `&IfaceName` variables
- 🐛 Reference variable hover shows correct type instead of `STRING`
- 🐛 Reserved keywords used as labels now flagged as diagnostics (#69)
- 🔧 Formatter: 6 bugs resolved (#66)
- 🐛 Tokenizer: structure keywords at col 0 tokenize as labels (#68)
- 🐛 Fix false-positive unreachable code after multiple `IF..RETURN..END` blocks (#67)
- 🔧 Refactor DiagnosticProvider into focused sub-modules
- 🐛 Fix diagnostics flashing and disappearing on file open

See [0.9.3] below for full details.
