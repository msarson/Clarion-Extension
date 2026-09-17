import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { versionPathSettings } from '../utils/VersionPathSettings';

/**
 * #567 — opening VitTransform from the Solution View with Clarion 12.0.14313 sent the
 * language server no redirection or libsrc paths, so StringTheory.inc never resolved
 * and hover, definition and completion on `param.` came back empty until a restart.
 */
const C12 = {
    name: 'Clarion 12.0.14313',
    path: 'C:\\Clarion\\Clarion12-12.0.14204\\bin',
    redirectionFile: 'Clarion120.red',
    macros: { root: 'C:\\Clarion\\Clarion12-12.0.14204', reddir: 'C:\\Clarion\\Clarion12-12.0.14204\\bin' },
    libsrc: 'C:\\Clarion\\Clarion12-12.0.14204\\libsrc\\win;C:\\Clarion\\Clarion12-12.0.14204\\Accessory\\libsrc\\win',
};

suite('versionPathSettings (#567)', () => {
    test('the redirection directory is the version\'s %REDDIR%, not the folder part of the bare file name', () => {
        // ClarionProperties.xml stores the redirection file as a bare name; its folder
        // part is ".", which the server joined into ".\Clarion120.red" and never found.
        assert.strictEqual(versionPathSettings(C12).redirectionPath, 'C:\\Clarion\\Clarion12-12.0.14204\\bin');
    });

    test('without a reddir macro the version\'s bin path is used', () => {
        const { reddir, ...macros } = C12.macros;
        assert.strictEqual(versionPathSettings({ ...C12, macros }).redirectionPath, 'C:\\Clarion\\Clarion12-12.0.14204\\bin');
    });

    test('the file name, macros and libsrc paths are carried over', () => {
        const paths = versionPathSettings(C12);
        assert.strictEqual(paths.redirectionFile, 'Clarion120.red');
        assert.deepStrictEqual(paths.macros, C12.macros);
        assert.deepStrictEqual(paths.libsrcPaths, [
            'C:\\Clarion\\Clarion12-12.0.14204\\libsrc\\win',
            'C:\\Clarion\\Clarion12-12.0.14204\\Accessory\\libsrc\\win',
        ]);
    });

    test('a version with no libsrc gives no libsrc paths, not one empty path', () => {
        assert.deepStrictEqual(versionPathSettings({ ...C12, libsrc: '' }).libsrcPaths, []);
    });
});

suite('initializeSolution sends the paths of the solution\'s own version (#567)', () => {
    test('the version\'s paths are loaded before clarion/updatePaths is sent', () => {
        // initializeSolution imports vscode, so the ordering is pinned on the source: the
        // paths are only filled at startup and by the Set Version picker otherwise, and a
        // solution opened from the Solution View sent whatever the session started with.
        const source = fs.readFileSync(
            path.resolve(__dirname, '..', '..', '..', '..', 'client', 'src', 'solution', 'SolutionInitializer.ts'), 'utf8');
        const body = source.slice(source.indexOf('export async function initializeSolution('));
        const load = body.indexOf('loadVersionGlobalSettings(globalClarionPropertiesFile, globalClarionVersion)');
        const send = body.indexOf("'clarion/updatePaths'");
        assert.ok(send > 0, 'clarion/updatePaths send not found in initializeSolution');
        assert.ok(load > 0 && load < send, 'initializeSolution must load the version\'s paths before sending clarion/updatePaths');
    });
});
