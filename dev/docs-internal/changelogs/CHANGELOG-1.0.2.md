# Changelog — 1.0.2

Archived from the main CHANGELOG when 1.0.5 was released. The three newest versions stay in full there.

### [1.0.2] - 2026-09-06

![21 fixes](https://img.shields.io/badge/fixes-21-1f6feb?style=flat-square) ![1 performance](https://img.shields.io/badge/performance-1-8250df?style=flat-square)

A correctness release about silent failure: several ways a solution could load in a degraded state looked identical to a healthy load, so features returned nothing and the extension read as broken rather than misconfigured. Those now report themselves. Many of the navigation and diagnostic fixes were contributed by [@geircodes](https://github.com/geircodes).

#### Solution and configuration

- **Unresolved source files are counted and named.** They were dropped from the file graph in silence while the build still reported healthy; now a log line, the graph-status notification and the Clarion Tools panel all carry `N of M unresolved`. [#434](https://github.com/msarson/Clarion-Extension/issues/434)
- **Re-opening a recent solution validates its stored build configuration** instead of adopting a stale one that matches no `.red` section. [#437](https://github.com/msarson/Clarion-Extension/issues/437)
- **The `%THISDIR%`, `%WinUserApplicationData%` and `%WinCommonApplicationData%` redirection macros are implemented.** An unrecognised macro was left in the path as text, so every directory on that line failed to resolve; `%THISDIR%` expands per file inside included `.red` files. [#435](https://github.com/msarson/Clarion-Extension/issues/435)
- **Every command carries a `Clarion` category,** so typing "clarion" in the Command Palette finds all 57, including Open Solution. [#438](https://github.com/msarson/Clarion-Extension/issues/438)
- **Open Detected Solution is hidden from the Command Palette,** where it failed for want of the path the extension's own UI supplies. [#433](https://github.com/msarson/Clarion-Extension/issues/433), @ClarionLive

#### Navigation and hover

- **A bare local CLASS used as its own instance resolves** for hover, F12, Ctrl+F12, completion, signature help and the discarded-return warning, as a bare QUEUE, GROUP or FILE already did. [#439](https://github.com/msarson/Clarion-Extension/pull/439), @geircodes
- **A GROUP, QUEUE or CLASS field's own declaration hovers as that field,** not as an unrelated same-named variable, and the card names the owning structure. [#424](https://github.com/msarson/Clarion-Extension/pull/424), @geircodes
- **Attribute, built-in and keyword names that collide with your own names** no longer hijack the hover card or the diagnostic. [#425](https://github.com/msarson/Clarion-Extension/pull/425), @geircodes
- **A colon in the enclosing SELF or PARENT scope line** no longer truncates identifiers and kills hover, F12, completion and signature help. [#431](https://github.com/msarson/Clarion-Extension/pull/431), @geircodes
- **A local CLASS's indented END** no longer captures the following PROCEDURE as one of its methods. [#430](https://github.com/msarson/Clarion-Extension/pull/430), @geircodes
- **61 built-ins that hovered as "undefined"** now show their signatures; the loader reads both shapes the built-ins data is authored in.
- **The Outline no longer repeats `in <Parent>` after every symbol,** and filtering the Structure View by a procedure's name still shows what it declares. [#426](https://github.com/msarson/Clarion-Extension/pull/426), [#418](https://github.com/msarson/Clarion-Extension/issues/418), @geircodes

#### Diagnostics

- **Discarded-return warnings survive a trailing comment** on a CRLF line. [#429](https://github.com/msarson/Clarion-Extension/pull/429), @geircodes
- **A colon-named dot-call receiver or method** (`My:StringTheory.IsEmpty()`) is checked for a discarded return value. [#427](https://github.com/msarson/Clarion-Extension/pull/427), @geircodes
- **An undeclared bare word is no longer accepted because an unrelated CLASS or INTERFACE declares a same-named member;** the procedure index now tracks structure bodies. A class member named `Map` no longer hides the file's later method implementations from that index. [#392](https://github.com/msarson/Clarion-Extension/pull/392), @geircodes
- **The missing-include check follows a `MEMBER` reached through an `INCLUDE('member.clw')` shim,** and understands the extension-less `MEMBER('Program')` form. [#395](https://github.com/msarson/Clarion-Extension/pull/395), @geircodes
- **A structure keyword used as an attribute argument or parameter type** (`FROM(QUEUE)`, `PROCEDURE(FILE,KEY)`) no longer loses its first character. [#416](https://github.com/msarson/Clarion-Extension/issues/416)
- **No false "missing END" on a WINDOW** whose control references a structure keyword on a continuation line. [#415](https://github.com/msarson/Clarion-Extension/issues/415)

#### Performance

- **Hovering an undeclared bare word in a big generated module** no longer freezes for about 10 seconds before showing nothing (10.5s to 13ms), and Clarion's predefined compiler flags such as `DLL_MODE` and `_DEBUG_` get a hover card instead of an undeclared warning. [#420](https://github.com/msarson/Clarion-Extension/issues/420)

#### Maintenance

- **The shelved ANTLR grammar experiment moved to its own archived repository,** [Clarion-ANTLR-Grammar](https://github.com/msarson/Clarion-ANTLR-Grammar); its lockfile had been raising Dependabot alerts against a toolchain the extension does not use.

