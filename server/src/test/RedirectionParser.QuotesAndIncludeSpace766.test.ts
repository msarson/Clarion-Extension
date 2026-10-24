import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RedirectionFileParserServer } from '../solution/redirectionFileParserServer';
import { serverSettings } from '../serverSettings';

/**
 * #766 — the help writes `{include %REDDIR%\oldname.red }` with a space before the
 * brace, and recommends quoting a directory that holds spaces. The space or the quotes
 * were kept in the path, so the red file or the directory was never found.
 *
 * Layout per case:
 *   <tmp>/Proj/P.red              (project-local red, the line under test)
 *   <tmp>/Proj/sub dir/child.red  (`*.inc = <tmp>/my lib`)
 *   <tmp>/my lib/X.inc            (the target)
 */
suite('RedirectionParser — quoted paths and a space before } (#766)', () => {
    let savedRedirectionFile = '';
    let savedRedirectionPaths: string[] = [];
    const roots: string[] = [];

    setup(() => {
        savedRedirectionFile = serverSettings.redirectionFile;
        savedRedirectionPaths = serverSettings.redirectionPaths;
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.redirectionPaths = savedRedirectionPaths;
        for (const r of roots.splice(0)) {
            try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best effort */ }
        }
    });

    /** Writes the layout with `line` in P.red; returns the project dir and the target. */
    function layout(line: (lib: string) => string): { projectDir: string; target: string } {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'red-766-'));
        roots.push(root);
        const projectDir = path.join(root, 'Proj');
        const sub = path.join(projectDir, 'sub dir');
        const lib = path.join(root, 'my lib');
        for (const d of [sub, lib]) { fs.mkdirSync(d, { recursive: true }); }
        const target = path.join(lib, 'X.inc');
        fs.writeFileSync(target, '');
        fs.writeFileSync(path.join(sub, 'child.red'), `[Common]\n*.inc = ${lib}\n`);
        fs.writeFileSync(path.join(projectDir, 'P.red'), `[Common]\n${line(lib)}\n`);
        serverSettings.redirectionFile = 'P.red';
        serverSettings.redirectionPaths = [root];
        return { projectDir, target };
    }

    const cases: Array<[string, (lib: string) => string]> = [
        ['a space before } in {include}', () => String.raw`{include %THISDIR%\sub dir\child.red }`],
        ['a quoted {include} path', () => String.raw`{include "%THISDIR%\sub dir\child.red"}`],
        ['a quoted directory', lib => `*.inc = .; "${lib}"`],
        ['a quoted directory ending the search', lib => `*.inc = "${lib}"|`],
    ];

    for (const [name, line] of cases) {
        test(`${name} (sync)`, () => {
            const { projectDir, target } = layout(line);
            const parser = new RedirectionFileParserServer();
            parser.parseRedFile(projectDir);
            assert.strictEqual(path.normalize(parser.findFile('X.inc')?.path ?? '(not found)'), path.normalize(target));
        });

        test(`${name} (async)`, async () => {
            const { projectDir, target } = layout(line);
            const parser = new RedirectionFileParserServer();
            await parser.parseRedFileAsync(projectDir);
            const result = await parser.findFileAsync('X.inc');
            assert.strictEqual(path.normalize(result?.path ?? '(not found)'), path.normalize(target));
        });
    }
});
