# Changelog — 1.0.8

Archived from the main CHANGELOG when 1.0.11 was released. The three newest versions stay in full there.

### [1.0.8] - 2026-10-04

![1 fix](https://img.shields.io/badge/fixes-1-1f6feb?style=flat-square) ![2 performance](https://img.shields.io/badge/performance-2-8250df?style=flat-square)

A follow-up to 1.0.7 for large generated modules. Diagnostics after an edit are ready in about a third of the time — on a 61,000-line generated module, about 2.3 s instead of about 7 s on the same machine — and a warning no longer keeps a variable's old type after you change its declaration. Hover, completion and Go to Definition also stop waiting behind the background check, which removes the occasional multi-second hover.

#### Performance

- **Diagnostics after an edit are ready much sooner in a large module.** The check for discarded return values worked out the type of every object it calls a method on, and every class's members, again after each edit, even though an edit to code cannot change them; it now does that again only when a declaration changes. [#715](https://github.com/msarson/Clarion-Extension/issues/715)
- **Hover, completion and Go to Definition no longer wait behind the background check.** The check that runs after an edit, or when a module is opened, took turns with them, so a hover that needed a lot of work could take several seconds, or time out, while it ran. They now go first, and the check still gets its turn at least every quarter of a second. [#715](https://github.com/msarson/Clarion-Extension/issues/715)

#### Diagnostics

- **A discarded-return-value warning no longer keeps a variable's old type after its declaration changes.** Changing a declaration such as `obj  LongClass` to `obj  ProcClass` could leave the warning judging `obj.Method()` by the old class, when the change kept the file the same length. [#715](https://github.com/msarson/Clarion-Extension/issues/715)
