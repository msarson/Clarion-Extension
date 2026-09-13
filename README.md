# Clarion Extension for Visual Studio Code

[![Marketplace version](https://flat.badgen.net/vs-marketplace/v/msarson.clarion-extensions)](https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extensions)
[![Marketplace installs](https://flat.badgen.net/vs-marketplace/i/msarson.clarion-extensions)](https://marketplace.visualstudio.com/items?itemName=msarson.clarion-extensions)

Clarion language support for Visual Studio Code: navigation, hover, IntelliSense, diagnostics, refactoring and builds, backed by a language server that understands whole solutions. Built and measured against real generated applications, 40 projects and 3,000 source files at a time, so the things a Clarion IDE user expects to work on a generated app, ABC or Legacy templates alike, work here too.

![Hover on a FILE label: Orders is a global FILE structure with DRIVER TOPSPEED, PRE ORD, CREATE, THREAD, 1 key and 3 fields, declared at viewjoin.clw line 16](docs/images/hover-file.png)

- [Quick start](docs/guides/quick-start.md) — five minutes to your first solution
- [Common tasks](docs/guides/common-tasks.md) — how do I…
- [Changelog](CHANGELOG.md) — what changed in each release
- [Issues](https://github.com/msarson/Clarion-Extension/issues) — bugs and requests

---

## Features

### Navigation and hover

Works in the current file with no solution open; opens out across files when a solution is loaded.

- F12, Ctrl+F12 and Shift+F12 for definition, implementation and references, aware of scope, overloads, routines, `PRE:Field` and `Structure.Field` access, and the procedure names an EXE shares with its DLLs.
- Hover cards that say what a thing is: a FILE with its driver, prefix and keys; a MAP prototype labelled Global, Module or Private; a structure field the same from its declaration or any qualified use.
- Reference counts above every procedure, method, class and routine, exact once the index is warm.
- Rename across the workspace, document highlight, workspace symbol search, and chained access such as `SELF.Order.RangeList.Init` resolved through CLASS, QUEUE and GROUP types.
- [Navigation in detail](docs/features/navigation.md)

### IntelliSense and signature help

- Member completion after `SELF.`, `PARENT.`, `MyVar.` or `ClassName.`, walking inheritance and honouring PRIVATE and PROTECTED.
- Parameter hints for 272 built-in functions and for class methods, with the overload narrowed by the argument types as you type.
- Documented completions and hover for `PROP:`, `PROPPRINT:` and `EVENT:` equates, and for `?` field equates scoped to the current window.
- [Signature help in detail](docs/features/signature-help.md)

### Diagnostics

Reported as you type, following the compiler's rules; where the rule was unclear it was settled by compiling a fixture.

![A PROJECT of a misspelled field is flagged: Customer.Naem is not a field on FILE Customer](docs/images/diagnostic-view-field.png)

- Unterminated structures, missing RETURN, FILE validation, VIEW field references checked against the owning file.
- Missing INCLUDE and missing project DefineConstants, each with a quick fix that adds the line.
- Discarded return values, a literal passed by reference, a call to a PRIVATE procedure from another module, undeclared variables, missing implementations and indistinguishable overloads.
- Character-set validation that respects every Windows ANSI code page and the Clarion 12 `!UTF8` directive.
- [Diagnostics in detail](docs/features/diagnostics.md)

### Refactoring and quick fixes

On Ctrl+.: Surround With, Negate Condition, Flip IF/ELSE, Introduce EQUATE, and Create routine from an unresolved `DO`. [Code editing in detail](docs/features/code-editing.md)

![The Quick Fix menu on an unresolved DO offering Create routine](docs/images/quick-fix-create-routine.png)

### Solutions and builds

- Open a folder; the extension finds the `.sln`, reads the projects, and follows Clarion's redirection files exactly as the IDE does, including per-configuration sections.
- Installed Clarion versions are discovered from the IDE's settings; a `ClarionProperties.xml` kept anywhere else can be chosen, and the build follows it.
- Build from the Solution View with live output, projects ordered by dependency. A solution that loads in a degraded state says so instead of silently returning nothing.
- [Solution management in detail](docs/features/solution-management.md)

<img src="docs/images/solution-view.png" width="344" alt="The Clarion Tools side bar: Actions with the selected Clarion version and configuration, the Solution View with the loaded solution and its project, and the Structure view of the open file">

### Editing and syntax

Syntax highlighting for Clarion and the template language, including the Clarion 12 Unicode preview; folding; 99 snippets; Paste as Clarion String; Add Method Implementation; a New Class wizard; a document formatter. Template files get highlighting only. [Snippet reference](docs/reference/snippets.md)

### Performance

Indexes persist across sessions and background work is time-sliced, so a 40-project solution is ready in about two seconds and interactive in about five, and typing, hover and navigation are never blocked. Opt-in tracing (`clarion.log.performance.enabled`) produces a full timeline for support.

---

## Requirements and installation

- Windows. The extension drives Clarion's own toolchain and does not run on macOS or Linux.
- Visual Studio Code 1.97 or later.
- Clarion 10, 11 or the 12 beta, for solution features and builds; editing and single-file navigation work without one.

Install from the Marketplace: open Extensions (`Ctrl+Shift+X`), search for **Clarion Extensions**, and install. [Detailed installation instructions](docs/guides/installation.md).

---

## What's new

### 1.0.3 (2026-09-13)

Most of this release is about reading generated code correctly: the MAP shapes a generated app emits, the procedure names it shares between an EXE and its DLLs, and the FILE, VIEW and KEY structures underneath. Several rules were settled by compiling a fixture, and the same work removed the last second-long cold starts on large programs.

- Every documented MAP prototype shape is recognised and navigable, and none is reported as undeclared; a `MODULE()`-wrapped prototype in the global MAP is labelled Global, a `,PRIVATE` one is called out.
- New diagnostic: a call to a PRIVATE procedure from another module, matching the compiler's *Invalid use of PRIVATE procedure*.
- Hover and references from a call site stay inside the project that can reach the declaration, so a name shared between an EXE and a DLL never answers with the wrong side.
- `PROJECT`, a VIEW's `JOIN` and a FILE's `KEY` hover; JOIN fields are checked against the parent file; dot notation in a VIEW is understood; F12 on the field half of `Customer.Name` works.
- Hover cards tell the truth about kind and scope: a FILE or QUEUE label is a structure, a field is one card from any of its three spellings, a PROGRAM's global is Global from inside a procedure.
- First hover, F12 or references on a generated program went from about two seconds to tens of milliseconds, and a quadratic tokenizer phase is gone.
- A `ClarionProperties.xml` outside `%APPDATA%` can be browsed for, and the build follows it.
- With contributions from [@geircodes](https://github.com/geircodes) and [@ClarionLive](https://github.com/ClarionLive).

**Earlier:** 1.0.2 (2026-09-06) made degraded solution loads report themselves and implemented the `%THISDIR%` family of redirection macros; 1.0.1 (2026-08-09) removed the startup freezes and the cold first interaction on large solutions. [Full changelog](CHANGELOG.md).

---

## Documentation

- Guides: [Quick start](docs/guides/quick-start.md), [Common tasks](docs/guides/common-tasks.md), [Installation](docs/guides/installation.md)
- Features: [Navigation](docs/features/navigation.md), [Signature help](docs/features/signature-help.md), [Solution management](docs/features/solution-management.md), [Diagnostics](docs/features/diagnostics.md), [Code editing](docs/features/code-editing.md)
- Reference: [Commands](docs/reference/commands.md), [Settings](docs/reference/settings.md), [Snippets](docs/reference/snippets.md), [Clarion language reference](https://github.com/msarson/Clarion-Extension/wiki/Clarion-Language-Reference) (wiki)

## Support and feedback

- [GitHub Issues](https://github.com/msarson/Clarion-Extension/issues) for bugs and requests
- [Discussions](https://github.com/msarson/Clarion-Extension/discussions) for questions and tips

## License

[MIT License](LICENSE)

## Acknowledgments

- **fushnisoft** for the original Clarion syntax highlighting
- The Clarion community for feedback and testing

## Contributors

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-12-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

Thanks to everyone who has helped improve the Clarion Language Extension through code, bug reports, testing, ideas, documentation and their knowledge of the Clarion language.

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/geircodes"><img src="https://avatars.githubusercontent.com/u/127224049?v=4?s=100" width="100px;" alt="geircodes"/><br /><sub><b>geircodes</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/commits?author=geircodes" title="Code">💻</a> <a href="https://github.com/msarson/Clarion-Extension/issues?q=author%3Ageircodes" title="Bug reports">🐛</a> <a href="#ideas-geircodes" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Chahton"><img src="https://avatars.githubusercontent.com/u/10942054?v=4?s=100" width="100px;" alt="Edin Čahtarević"/><br /><sub><b>Edin Čahtarević</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/issues?q=author%3AChahton" title="Bug reports">🐛</a> <a href="#ideas-Chahton" title="Ideas, Planning, & Feedback">🤔</a> <a href="#userTesting-Chahton" title="User Testing">📓</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/ClarionLive"><img src="https://avatars.githubusercontent.com/u/2301791?v=4?s=100" width="100px;" alt="ClarionLive"/><br /><sub><b>ClarionLive</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/issues?q=author%3AClarionLive" title="Bug reports">🐛</a> <a href="#ideas-ClarionLive" title="Ideas, Planning, & Feedback">🤔</a> <a href="#userTesting-ClarionLive" title="User Testing">📓</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://celeron533.github.io/"><img src="https://avatars.githubusercontent.com/u/3608762?v=4?s=100" width="100px;" alt="Allen Zhu"/><br /><sub><b>Allen Zhu</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/commits?author=celeron533" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://fushnisoft.com"><img src="https://avatars.githubusercontent.com/u/1259015?v=4?s=100" width="100px;" alt="Brahn Partridge"/><br /><sub><b>Brahn Partridge</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/commits?author=fushnisoft" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/MarkGoldberg"><img src="https://avatars.githubusercontent.com/u/4584617?v=4?s=100" width="100px;" alt="Mark Goldberg"/><br /><sub><b>Mark Goldberg</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/issues?q=author%3AMarkGoldberg" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://carlosgutierrez.mx"><img src="https://avatars.githubusercontent.com/u/5258638?v=4?s=100" width="100px;" alt="Carlos Gutierrez"/><br /><sub><b>Carlos Gutierrez</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/issues?q=author%3ACarlosGtrz" title="Bug reports">🐛</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/ThaDaVos"><img src="https://avatars.githubusercontent.com/u/5251028?v=4?s=100" width="100px;" alt="Dylan Vos"/><br /><sub><b>Dylan Vos</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/issues?q=author%3AThaDaVos" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/krosoftware"><img src="https://avatars.githubusercontent.com/u/8056218?v=4?s=100" width="100px;" alt="krosoftware"/><br /><sub><b>krosoftware</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/issues?q=author%3Akrosoftware" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/jslarveEC"><img src="https://avatars.githubusercontent.com/u/112515315?v=4?s=100" width="100px;" alt="jslarveEC"/><br /><sub><b>jslarveEC</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/issues?q=author%3AjslarveEC" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/narduss"><img src="https://avatars.githubusercontent.com/u/15345011?v=4?s=100" width="100px;" alt="Nardus"/><br /><sub><b>Nardus</b></sub></a><br /><a href="https://github.com/msarson/Clarion-Extension/commits?author=narduss" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.boxsoft.net"><img src="https://avatars.githubusercontent.com/u/1831296?v=4?s=100" width="100px;" alt="Mike Hanson"/><br /><sub><b>Mike Hanson</b></sub></a><br /><a href="#ideas-BoxSoft" title="Ideas, Planning, & Feedback">🤔</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!
