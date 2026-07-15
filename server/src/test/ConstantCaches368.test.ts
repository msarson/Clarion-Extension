/**
 * #368 — ClassConstantParser.parseFile + ProjectConstantsChecker.getProjectConstants
 * are hot shared calls (missingConstants validator + classConstants code-action) that were
 * uncached: parseFile re-read+re-scanned every call, and ProjectConstantsChecker was
 * constructed fresh per call so its instance cache never hit — re-reading + xml2js-parsing
 * the .cwproj every time. Both now use a static, mtime-validated cache.
 *
 * Pins (per class):
 *   1. Repeated calls on an unchanged file read it once (RED: read every call).
 *   2. A file edit (mtime change) re-reads (guards the cache from going stale).
 *   For ProjectConstantsChecker, the repeated calls come from SEPARATE fresh instances —
 *   the exact per-call construction pattern that defeated the old instance cache.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClassConstantParser } from '../utils/ClassConstantParser';
import { ProjectConstantsChecker } from '../utils/ProjectConstantsChecker';

let tmpDir: string;
let origReadFile: typeof fs.promises.readFile;
let reads: string[];

function countReadsFor(basename: string): number {
    return reads.filter(p => p.toLowerCase().endsWith(basename.toLowerCase())).length;
}

suite('#368 — constant parser/checker mtime caches', () => {

    suiteSetup(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc368_')); });
    suiteTeardown(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ } });

    setup(() => {
        reads = [];
        origReadFile = fs.promises.readFile;
        (fs.promises as unknown as { readFile: unknown }).readFile =
            ((p: fs.PathLike | fs.promises.FileHandle, ...rest: unknown[]) => {
                if (typeof p === 'string') reads.push(p);
                return (origReadFile as (...a: unknown[]) => unknown)(p, ...rest);
            });
    });
    teardown(() => { (fs.promises as unknown as { readFile: unknown }).readFile = origReadFile; });

    test('ClassConstantParser.parseFile: unchanged file reads once; edit re-reads', async () => {
        const inc = path.join(tmpDir, 'widget368.inc');
        fs.writeFileSync(inc, "Widget  CLASS,TYPE,LINK('widget.clw',WidgetLinkMode)\n        END\n");

        const p1 = await new ClassConstantParser().parseFile(inc);
        assert.ok(p1.some(c => c.className === 'Widget'), 'parses the class + its Link constant');
        const afterFirst = countReadsFor('widget368.inc');
        assert.strictEqual(afterFirst, 1, 'first call reads the file');

        for (let i = 0; i < 4; i++) await new ClassConstantParser().parseFile(inc);
        assert.strictEqual(countReadsFor('widget368.inc'), 1,
            `unchanged file must answer from the mtime cache (read ${countReadsFor('widget368.inc')}x)`);

        const t = new Date(fs.statSync(inc).mtimeMs + 5000);
        fs.utimesSync(inc, t, t);
        await new ClassConstantParser().parseFile(inc);
        assert.strictEqual(countReadsFor('widget368.inc'), 2, 'an edit (mtime change) re-reads');
    });

    test('ProjectConstantsChecker: fresh instances share the static cache; edit re-reads', async () => {
        const cwproj = path.join(tmpDir, 'proj368.cwproj');
        fs.writeFileSync(cwproj,
            '<Project><PropertyGroup><DefineConstants>FooConst=&gt;1%3b</DefineConstants></PropertyGroup></Project>\n');

        const c1 = await new ProjectConstantsChecker().getProjectConstants(cwproj);
        assert.strictEqual(c1.get('fooconst'), '1', 'parses DefineConstants');
        const afterFirst = countReadsFor('proj368.cwproj');
        assert.strictEqual(afterFirst, 1, 'first call reads the .cwproj');

        // Fresh instances per call — the pattern that defeated the old instance cache.
        for (let i = 0; i < 4; i++) await new ProjectConstantsChecker().getProjectConstants(cwproj);
        assert.strictEqual(countReadsFor('proj368.cwproj'), 1,
            `repeated calls (even from fresh instances) must hit the static cache (read ${countReadsFor('proj368.cwproj')}x)`);

        const t = new Date(fs.statSync(cwproj).mtimeMs + 5000);
        fs.utimesSync(cwproj, t, t);
        await new ProjectConstantsChecker().getProjectConstants(cwproj);
        assert.strictEqual(countReadsFor('proj368.cwproj'), 2, 'a DefineConstants edit (mtime change) re-reads');
    });
});
