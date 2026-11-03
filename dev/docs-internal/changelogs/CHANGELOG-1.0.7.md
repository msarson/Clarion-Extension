# Changelog — 1.0.7

Archived from the main CHANGELOG when 1.0.10 was released. The three newest versions stay in full there.

### [1.0.7] - 2026-10-03

![1 fix](https://img.shields.io/badge/fixes-1-1f6feb?style=flat-square) ![4 performance](https://img.shields.io/badge/performance-4-8250df?style=flat-square)

A release about editing large generated modules. It fixes a 1.0.6 bug that could leave the extension reading a module wrongly after an edit, and it makes the hover after an edit much quicker: on a 61,000-line generated module, the hover just after typing nearby went from about half a second to about 0.21 s, and a hover that lands while the module is being re-checked now takes about 0.08 s.

#### Editing

- **After an edit, the extension no longer reads the module wrongly.** An edit could leave its parsed form out of step with the text until the file was reopened: a structure whose END was removed kept its old extent, a line inside a procedure could be misread (`ACCEPT` as `CCEPT`), and a new PROCEDURE line or a period in column 0 went unnoticed, so folding, the outline, hover and diagnostics worked from the wrong structure. Each edit now gives exactly what reading the whole file would. [#715](https://github.com/msarson/Clarion-Extension/issues/715)

#### Performance

- **A hover just after an edit no longer waits a second or more behind the re-check of a large module.** The check for indistinguishable prototypes took time that grew with the square of the module's size, and ran after every edit; on a 60,000-line generated module it took over a second, and now takes about 10 ms. [#715](https://github.com/msarson/Clarion-Extension/issues/715)
- **Pressing Enter in a large module no longer makes the next hover re-read the whole file, and a hover on a procedure call after an edit no longer takes seconds.** An edit that added or removed a line, touched several places at once, or fell inside a procedure that is most of the module (a generated report designer) re-read the whole module; and the procedure hover read the module from disk, so the edited buffer had to be parsed again from scratch. An edit now re-reads only the lines it changed. [#715](https://github.com/msarson/Clarion-Extension/issues/715)
- **A hover during the re-check that follows an edit no longer waits for the whole re-check, and the re-check itself is quicker.** The first part of the re-check ran as one block, and two of its checks took time that grew with the square of the module's size, so on a large module a hover could wait over a second. The re-check now lets requests in between its checks, and both checks are linear. [#715](https://github.com/msarson/Clarion-Extension/issues/715)
- **Hovering a local variable after an edit is quicker in a large module.** The hover rebuilt the outline of the whole module to find one procedure's declarations; it now reads only that procedure's data sections. [#715](https://github.com/msarson/Clarion-Extension/issues/715)
