import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RedirectionFileParserServer } from '../solution/redirectionFileParserServer';
import { serverSettings } from '../serverSettings';

/**
 * #765 — a version's Redirection File name may be a full path (the IDE combines it
 * with .NET Path.Combine, which keeps a rooted name as it is). path.join glued it
 * onto the bin folder instead, so no red file was found and nothing redirected.
 *
 * Layout:
 *   <tmp>/clarion/bin/            (the version's bin, holds no red file)
 *   <tmp>/tools/Custom.red        (the version's red file, named by full path)
 *   <tmp>/common/Shared.inc       (reached only through Custom.red)
 *   <tmp>/Proj/                   (the project)
 */
suite('RedirectionParser — a red file name given as a full path (#765)', () => {
    let tmpRoot = '';
    let projectDir = '';
    let redFile = '';
    let target = '';
    let savedRedirectionFile = '';
    let savedRedirectionPaths: string[] = [];

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'red-fullpath-765-'));
        const binDir = path.join(tmpRoot, 'clarion', 'bin');
        projectDir = path.join(tmpRoot, 'Proj');
        redFile = path.join(tmpRoot, 'tools', 'Custom.red');
        target = path.join(tmpRoot, 'common', 'Shared.inc');
        for (const d of [binDir, projectDir, path.dirname(redFile), path.dirname(target)]) {
            fs.mkdirSync(d, { recursive: true });
        }
        fs.writeFileSync(redFile, `[Common]\n*.inc = ${path.dirname(target)}\n`);
        fs.writeFileSync(target, '! shared\n');
        savedRedirectionFile = serverSettings.redirectionFile;
        savedRedirectionPaths = serverSettings.redirectionPaths;
        serverSettings.redirectionFile = redFile;
        serverSettings.redirectionPaths = [binDir];
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.redirectionPaths = savedRedirectionPaths;
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best effort */ }
    });

    test('parseRedFile reads the named file', () => {
        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(projectDir);
        assert.strictEqual(path.normalize(parser.lastRedFileParsed), path.normalize(redFile));
        assert.strictEqual(path.normalize(parser.findFile('Shared.inc')!.path), path.normalize(target));
    });

    test('parseRedFileAsync reads the named file', async () => {
        const parser = new RedirectionFileParserServer();
        await parser.parseRedFileAsync(projectDir);
        const result = await parser.findFileAsync('Shared.inc');
        assert.ok(result, 'Shared.inc should resolve through the full-path red file');
        assert.strictEqual(path.normalize(result!.path), path.normalize(target));
    });
});
