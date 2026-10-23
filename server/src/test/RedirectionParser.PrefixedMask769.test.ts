import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { RedirectionEntry, RedirectionFileParserServer } from '../solution/redirectionFileParserServer';
import { serverSettings } from '../serverSettings';

/**
 * #769 — a filemask is "a file name or a file mask using the standard OS wild card characters:
 * * and ?" (Redirection File help topic). Only `*.ext` matched: any other mask had its first `*`
 * stripped and was tested with endsWith, so `ab*.inc` meant "ends with ab.inc" and AbProgress.inc
 * was never found. getSearchPaths('.inc') kept only `*.inc` entries, dropping `ab*.inc` folders.
 *
 * Layout:
 *   <tmp>/Proj/Clarion110.red     (project-local red file)
 *   <tmp>/Shared/AbProgress.inc   (reached only through `ab*.inc = ..\Shared`)
 *   <tmp>/Shared/Other.inc        (in the same folder, but not matched by the mask)
 */
suite('RedirectionParser — masks with a prefix or ? wildcard (#769)', () => {
    let tmpRoot = '';
    let projDir = '';
    let sharedDir = '';
    let savedRedirectionFile = '';
    let savedRedirectionPaths: string[] = [];
    let savedLibsrcPaths: string[] = [];

    function writeRed(contents: string): void {
        fs.writeFileSync(path.join(projDir, 'Clarion110.red'), contents);
    }

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'red-mask-769-'));
        projDir = path.join(tmpRoot, 'Proj');
        sharedDir = path.join(tmpRoot, 'Shared');
        const binDir = path.join(tmpRoot, 'clarion', 'bin');
        for (const d of [projDir, sharedDir, binDir]) fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(sharedDir, 'AbProgress.inc'), '! shared\n');
        fs.writeFileSync(path.join(sharedDir, 'Other.inc'), '! not matched\n');
        savedRedirectionFile = serverSettings.redirectionFile;
        savedRedirectionPaths = serverSettings.redirectionPaths;
        savedLibsrcPaths = serverSettings.libsrcPaths;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.redirectionPaths = [binDir];
        serverSettings.libsrcPaths = [];
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.redirectionPaths = savedRedirectionPaths;
        serverSettings.libsrcPaths = savedLibsrcPaths;
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best effort */ }
    });

    test('findFile resolves a file through a prefixed mask, whatever its case', () => {
        writeRed('[Common]\nab*.inc = ..\\Shared\n');
        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(projDir);
        assert.strictEqual(path.normalize(parser.findFile('AbProgress.inc')?.path ?? ''), path.join(sharedDir, 'AbProgress.inc'));
        assert.strictEqual(path.normalize(parser.findFile('ABPROGRESS.INC')?.path ?? ''), path.join(sharedDir, 'ABPROGRESS.INC'));
    });

    test('findFileAsync resolves a file through a prefixed mask', async () => {
        writeRed('[Common]\nab*.inc = ..\\Shared\n');
        const parser = new RedirectionFileParserServer();
        await parser.parseRedFileAsync(projDir);
        const result = await parser.findFileAsync('AbProgress.inc');
        assert.strictEqual(path.normalize(result?.path ?? ''), path.join(sharedDir, 'AbProgress.inc'));
    });

    test('a prefixed mask does not match a file without the prefix', () => {
        writeRed('[Common]\nab*.inc = ..\\Shared\n');
        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(projDir);
        assert.strictEqual(parser.findFile('Other.inc'), null);
    });

    test('? matches exactly one character', () => {
        writeRed('[Common]\nabprogres?.inc = ..\\Shared\nother?.inc = ..\\Shared\n');
        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(projDir);
        assert.strictEqual(path.normalize(parser.findFile('AbProgress.inc')?.path ?? ''), path.join(sharedDir, 'AbProgress.inc'));
        assert.strictEqual(parser.findFile('Other.inc'), null);
    });

    test('a mask with * in the middle of the name matches', () => {
        writeRed('[Common]\na*ss.inc = ..\\Shared\n');
        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(projDir);
        assert.strictEqual(path.normalize(parser.findFile('AbProgress.inc')?.path ?? ''), path.join(sharedDir, 'AbProgress.inc'));
    });

    test('regression: *.inc and an exact file name still match', () => {
        writeRed('[Common]\nother.inc = ..\\Shared\n*.inc = ..\\Shared\n');
        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(projDir);
        assert.strictEqual(path.normalize(parser.findFile('Other.inc')?.path ?? ''), path.join(sharedDir, 'Other.inc'));
        assert.strictEqual(path.normalize(parser.findFile('AbProgress.inc')?.path ?? ''), path.join(sharedDir, 'AbProgress.inc'));
    });
});

suite('getSearchPaths — masks other than *.ext (#769)', () => {
    let savedConfiguration = '';

    setup(() => {
        savedConfiguration = serverSettings.configuration;
        serverSettings.configuration = 'Release';
    });

    teardown(() => {
        serverSettings.configuration = savedConfiguration;
    });

    function project(entries: RedirectionEntry[]): ClarionProjectServer {
        const p = new ClarionProjectServer('TestProj', 'app', 'C:\\Workspace\\Proj', '{TEST}');
        p.redirectionEntries = entries;
        (p as unknown as { redirectionParser: RedirectionFileParserServer | null }).redirectionParser =
            {} as RedirectionFileParserServer;
        return p;
    }

    const red = 'C:\\Workspace\\Proj\\Clarion110.red';

    test('an ab*.inc entry contributes its folders to the .inc search paths', () => {
        const p = project([{ redFile: red, section: 'Common', extension: 'ab*.inc', paths: ['..\\Shared'] }]);
        assert.ok(p.getSearchPaths('.inc').includes('C:\\Workspace\\Shared'));
    });

    test('an ab*.inc entry does not contribute to the .clw search paths', () => {
        const p = project([{ redFile: red, section: 'Common', extension: 'ab*.inc', paths: ['..\\Shared'] }]);
        assert.ok(!p.getSearchPaths('.clw').includes('C:\\Workspace\\Shared'));
    });
});
