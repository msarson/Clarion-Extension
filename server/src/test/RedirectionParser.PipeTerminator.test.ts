import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RedirectionFileParserServer, RedirectionEntry } from '../solution/redirectionFileParserServer';
import { serverSettings } from '../serverSettings';

/**
 * #356 — the redirection pipe terminator (`|`), verified against BOTH the
 * 11.1 docs ("Redirection System": a path ending in | stops the search) and
 * the decompiled IDE (Clarion.Core.Redirection\RedirectionFile.cs), which is
 * stricter than the docs read:
 *
 *   - PARSE time: a dir ending in `|` truncates the REMAINING dirs on that
 *     line (Section.Item ctor sets stoppingDir and breaks the dir loop).
 *   - LOOKUP time: once a mask-MATCHING stop-entry has been consulted, the
 *     search stops entirely — later entries, later sections, chained REDs,
 *     and any fallback are never reached (stop propagates out of
 *     Section.Exists/GetName through the sections loop).
 *
 * The stop is mask-scoped at consult time: a stop-entry for *.inc does not
 * wall off *.clw lookups, because the item is only consulted when its mask
 * matches the requested name.
 */

interface Fixture {
    tmpRoot: string;
    projDir: string;
}

function buildFixture(parentRed: string, files: { [relPath: string]: string }): Fixture {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'red-pipe-356-'));
    const projDir = path.join(tmpRoot, 'Proj');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'Clarion110.red'), parentRed);
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.join(tmpRoot, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }
    return { tmpRoot, projDir };
}

suite('RedirectionParser.PipeTerminator (#356)', () => {

    let fixtures: Fixture[] = [];
    let savedRedirectionFile = '';
    let savedConfiguration = '';
    let savedLibsrc: string[] = [];

    setup(() => {
        fixtures = [];
        savedRedirectionFile = serverSettings.redirectionFile;
        savedConfiguration = serverSettings.configuration;
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.configuration = 'Release';
        serverSettings.libsrcPaths = [];
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.configuration = savedConfiguration;
        serverSettings.libsrcPaths = savedLibsrc;
        for (const fix of fixtures) {
            try { fs.rmSync(fix.tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
        }
    });

    test('parse time: a trailing | truncates the remaining dirs on the line and marks the entry', () => {
        const fix = buildFixture(
            '[Common]\n*.clw = .\\walled|; .\\dropped\n',
            {}
        );
        fixtures.push(fix);
        const parser = new RedirectionFileParserServer();
        const entries = parser.parseRedFile(fix.projDir);
        const clwEntries = entries.filter(e => e.extension.toLowerCase() === '*.clw');
        assert.strictEqual(clwEntries.length, 1);
        const entry = clwEntries[0] as RedirectionEntry & { stopsSearch?: boolean };
        assert.strictEqual(entry.paths.length, 1,
            `dirs after the pipe on the same line are dropped at parse time; got: ${JSON.stringify(entry.paths)}`);
        assert.ok(!entry.paths[0].includes('|'), 'the pipe itself is stripped from the kept dir');
        assert.ok(entry.paths[0].toLowerCase().includes('walled'), 'the dir before the pipe is kept');
        assert.strictEqual(entry.stopsSearch, true, 'entry carries the stop marker');
    });

    test('lookup: a matching stop-entry walls off later entries', () => {
        // File exists ONLY beyond the wall — the IDE would never find it.
        const fix = buildFixture(
            '[Common]\n*.clw = .\\walled|\n*.clw = .\\beyond\n',
            { 'Proj\\beyond\\target.clw': '! beyond the wall\n' }
        );
        fixtures.push(fix);
        fs.mkdirSync(path.join(fix.projDir, 'walled'), { recursive: true });
        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('target.clw');
        assert.strictEqual(result, null,
            `search must stop at the pipe wall; resolved to ${result?.path ?? '(null)'}`);
    });

    test('lookup: a file BEFORE the wall still resolves normally', () => {
        const fix = buildFixture(
            '[Common]\n*.clw = .\\walled|\n*.clw = .\\beyond\n',
            { 'Proj\\walled\\target.clw': '! inside the wall\n' }
        );
        fixtures.push(fix);
        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('target.clw');
        assert.ok(result, 'file inside the walled dir resolves');
        assert.ok(result!.path.toLowerCase().includes('walled'));
    });

    test('lookup: the wall is mask-scoped — an *.inc wall does not stop a *.clw search', () => {
        const fix = buildFixture(
            '[Common]\n*.inc = .\\walled|\n*.clw = .\\beyond\n',
            { 'Proj\\beyond\\target.clw': '! reachable\n' }
        );
        fixtures.push(fix);
        fs.mkdirSync(path.join(fix.projDir, 'walled'), { recursive: true });
        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('target.clw');
        assert.ok(result, 'the *.inc wall must not affect *.clw lookups');
        assert.ok(result!.path.toLowerCase().includes('beyond'));
    });

    test('lookup: the wall also suppresses the libsrc fallback', () => {
        const fix = buildFixture(
            '[Common]\n*.clw = .\\walled|\n',
            { 'libsrc\\target.clw': '! in libsrc\n' }
        );
        fixtures.push(fix);
        fs.mkdirSync(path.join(fix.projDir, 'walled'), { recursive: true });
        serverSettings.libsrcPaths = [path.join(fix.tmpRoot, 'libsrc')];
        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('target.clw');
        assert.strictEqual(result, null,
            `the wall stops the ENTIRE search including fallbacks; resolved to ${result?.path ?? '(null)'}`);
    });

    test('lookup (async twin): a matching stop-entry walls off later entries and fallbacks', async () => {
        const fix = buildFixture(
            '[Common]\n*.clw = .\\walled|\n*.clw = .\\beyond\n',
            { 'Proj\\beyond\\target.clw': '! beyond\n', 'libsrc\\target.clw': '! libsrc\n' }
        );
        fixtures.push(fix);
        fs.mkdirSync(path.join(fix.projDir, 'walled'), { recursive: true });
        serverSettings.libsrcPaths = [path.join(fix.tmpRoot, 'libsrc')];
        const parser = new RedirectionFileParserServer();
        await parser.parseRedFileAsync(fix.projDir);
        const result = await parser.findFileAsync('target.clw');
        assert.strictEqual(result, null,
            `async twin must honour the wall identically; resolved to ${result?.path ?? '(null)'}`);
    });
});

/**
 * #356 (part 2) — {include} inside a section: PIN of the shipping-IDE behaviour.
 *
 * The 11.1 docs claim "any {include} within a section is only active when that
 * section is active", but the DECOMPILED IDE (RedirectionFile.Load) recurses
 * with a fresh section context — the included file's entries activate by their
 * OWN section names regardless of where the {include} sits (the enclosing
 * section is consulted only for [Copy] %libpath% macro handling). Our parser
 * matches the shipping implementation. This pin documents that decision: if a
 * future Clarion version implements the documented gating, flex this test with
 * evidence, not with the docs alone.
 */
suite('RedirectionParser.SectionedInclude (#356 pin — decompiled-IDE parity)', () => {

    let fixtures: Fixture[] = [];
    let savedRedirectionFile = '';
    let savedConfiguration = '';

    setup(() => {
        fixtures = [];
        savedRedirectionFile = serverSettings.redirectionFile;
        savedConfiguration = serverSettings.configuration;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.configuration = 'Release';
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.configuration = savedConfiguration;
        for (const fix of fixtures) {
            try { fs.rmSync(fix.tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
        }
    });

    test('an {include} under [Debug] still contributes its own [Common] entries in a Release build', () => {
        const fix = buildFixture(
            '[Debug]\n{include child.red}\n',
            { 'Proj\\child.red': '[Common]\n*.clw = .\\childdir\n', 'Proj\\childdir\\target.clw': '! via child\n' }
        );
        fixtures.push(fix);
        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(fix.projDir);
        const result = parser.findFile('target.clw');
        assert.ok(result,
            'shipping-IDE behaviour: included entries activate by their own sections, not the enclosing one');
        assert.ok(result!.path.toLowerCase().includes('childdir'));
    });
});
