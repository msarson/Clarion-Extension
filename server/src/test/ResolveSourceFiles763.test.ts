import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveSourceFiles } from '../solution/resolveSourceFiles';
import { RedirectionFileParserServer } from '../solution/redirectionFileParserServer';
import { serverSettings } from '../serverSettings';

/**
 * #763 — New Solution needs the library sources a folder's directives name (CWUTIL.INC and the
 * cwutil.clw it declares), before any solution is loaded. The server resolves them through the
 * folder's redirection file and the chosen installation's, with that installation's macros, using
 * the same parser as everything else — without touching the loaded solution's settings or caches.
 */
suite('Resolving source names for New Solution (#763)', () => {
    let tmp: string;
    let folder: string;
    let bin: string;
    const settings = () => ({
        redirectionFile: 'Clarion100.red',
        redirectionPath: bin,
        macros: { root: path.join(tmp, 'clarion') },
        libsrcPaths: [],
        configuration: 'Debug',
    });

    setup(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rsf763-'));
        bin = path.join(tmp, 'clarion', 'bin');
        const libsrc = path.join(tmp, 'clarion', 'libsrc', 'win');
        folder = path.join(tmp, 'app');
        for (const d of [bin, libsrc, path.join(folder, 'classes')]) fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(bin, 'Clarion100.red'), '[Common]\r\n*.* = .; %ROOT%\\libsrc\\win\r\n');
        fs.writeFileSync(path.join(folder, 'Clarion100.red'), '[Common]\r\n*.inc = .\\classes\r\n{include %bin%\\Clarion100.red}\r\n');
        fs.writeFileSync(path.join(libsrc, 'CWUTIL.INC'), "  MODULE('cwutil.clw')\r\n  END\r\n");
        fs.writeFileSync(path.join(libsrc, 'cwutil.clw'), '  MEMBER()\r\n');
        fs.writeFileSync(path.join(folder, 'classes', 'Mine.inc'), '! mine\r\n');
    });

    teardown(() => fs.rmSync(tmp, { recursive: true, force: true }));

    test('names resolve through the folder .red and the installation .red it includes', () => {
        const found = resolveSourceFiles({ folder, settings: settings(), names: ['CWUTIL.INC', 'cwutil.clw', 'Mine.inc', 'Nowhere.inc'] });
        assert.deepStrictEqual(Object.keys(found).sort(), ['CWUTIL.INC', 'Mine.inc', 'cwutil.clw']);
        assert.strictEqual(path.normalize(found['CWUTIL.INC']).toLowerCase(), path.join(tmp, 'clarion', 'libsrc', 'win', 'CWUTIL.INC').toLowerCase());
        assert.strictEqual(path.normalize(found['Mine.inc']).toLowerCase(), path.join(folder, 'classes', 'Mine.inc').toLowerCase());
    });

    test("the loaded solution's settings and parse caches are left alone", () => {
        const before = JSON.stringify({ red: serverSettings.redirectionFile, macros: serverSettings.macros });
        const parseShared = new RedirectionFileParserServer();
        resolveSourceFiles({ folder, settings: settings(), names: ['CWUTIL.INC'] });
        assert.strictEqual(JSON.stringify({ red: serverSettings.redirectionFile, macros: serverSettings.macros }), before);
        // A shared parser with no redirection file configured still finds nothing in the folder's .red.
        assert.deepStrictEqual(parseShared.parseRedFile(folder), []);
    });
});
