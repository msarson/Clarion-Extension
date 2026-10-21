/**
 * #756 — the #313 MAP include walk (call-site hover, Go to Implementation, the unresolved-call
 * diagnostic) re-did the same file work for every procedure name it was asked about: each INCLUDE
 * resolved with an existsSync, each file's MAP ranges and INCLUDE list re-scanned. Profiled on a
 * large generated module, existsSync alone was about two thirds of a lookup. Include resolution is
 * now memoized per cross-file epoch and each file is summarized once per token array, so a further
 * name costs set lookups. The answers must not change: the walk's own suites (#313, #361, #362,
 * #483, #754) pin them, and the cases below run every branch of the walk once more.
 *
 * Layout (real temp files, no solution):
 *   main756.clw    PROGRAM; MAP includes inmap756.inc; global data includes ownmap756.inc
 *   inmap756.inc   MODULE('A') A_Proc; INCLUDE('nested756.inc')
 *   nested756.inc  MODULE('B') B_Proc
 *   ownmap756.inc  its own MAP / MODULE('C') C_Proc, and a MODULE outside it with Stray_Proc
 *   use756.clw     MEMBER('main756.clw'), the module the lookups start from
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';
import { bumpCrossFileEpoch } from '../utils/crossFileEpoch';
import { setServerInitialized } from '../serverState';

let tmpDir: string;

function write(name: string, lines: string[]): void {
    fs.writeFileSync(path.join(tmpDir, name), lines.join('\r\n'));
}

function openDoc(name: string): TextDocument {
    const p = path.join(tmpDir, name);
    return TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, fs.readFileSync(p, 'utf8'));
}

async function lookup(name: string): Promise<string> {
    const doc = openDoc('use756.clw');
    const hit = await new MapProcedureResolver().findDeclarationInMapIncludes(name, doc, TokenCache.getInstance().getTokens(doc));
    return hit ? `${path.basename(decodeURIComponent(hit.doc.uri))}:${hit.declLine}` : 'none';
}

suite('MAP include walk: each file is worked out once, not once per name (#756)', () => {
    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'walk756_'));
        write('main756.clw', [
            '  PROGRAM',
            "  INCLUDE('ownmap756.inc'),ONCE",
            '  MAP',
            "    INCLUDE('inmap756.inc')",
            '  END',
            '  CODE',
        ]);
        write('inmap756.inc', [
            "  MODULE('A')",
            '    A_Proc(LONG), LONG',
            '  END',
            "  INCLUDE('nested756.inc')",
        ]);
        write('nested756.inc', [
            "  MODULE('B')",
            '    B_Proc()',
            '  END',
        ]);
        write('ownmap756.inc', [
            '  MAP',
            "    MODULE('C')",
            '      C_Proc(STRING)',
            '    END',
            '  END',
            "  MODULE('D')",
            '    Stray_Proc()',
            '  END',
        ]);
        write('use756.clw', [
            "  MEMBER('main756.clw')",
            'Caller PROCEDURE()',
            '  CODE',
            '  A_Proc(1)',
        ]);
    });

    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    setup(() => bumpCrossFileEpoch());

    test('every branch of the walk still answers as before', async () => {
        assert.strictEqual(await lookup('A_Proc'), 'inmap756.inc:1', 'MODULE in a MAP include');
        assert.strictEqual(await lookup('a_proc'), 'inmap756.inc:1', 'names match without case');
        assert.strictEqual(await lookup('B_Proc'), 'nested756.inc:1', 'nested include of a MAP include');
        assert.strictEqual(await lookup('C_Proc'), 'ownmap756.inc:2', 'MODULE in the own MAP of a global include (#754)');
        assert.strictEqual(await lookup('Stray_Proc'), 'none', 'a MODULE outside that file\'s MAP declares nothing');
        assert.strictEqual(await lookup('NoSuch_Proc'), 'none');
    });

    test('after the first lookup, further names resolve no include on disk again', async () => {
        await lookup('Warm_Up_Name');
        // the module object itself: a namespace import only has getters, which read through to it
        const nodeFs = require('fs') as typeof fs;
        const real = nodeFs.existsSync;
        let calls = 0;
        nodeFs.existsSync = ((p: fs.PathLike) => { calls++; return real(p); }) as typeof fs.existsSync;
        try {
            for (let i = 0; i < 20; i++) await lookup(`Undeclared_${i}`);
            assert.strictEqual(await lookup('B_Proc'), 'nested756.inc:1');
        } finally {
            nodeFs.existsSync = real;
        }
        assert.strictEqual(calls, 0, `${calls} existsSync calls across 21 further lookups`);
    });

    test('a new cross-file epoch resolves the includes afresh', async () => {
        assert.strictEqual(await lookup('B_Proc'), 'nested756.inc:1');
        write('nested756.inc', ["  MODULE('B')", '    Renamed_Proc()', '  END']);
        bumpCrossFileEpoch();
        TokenCache.getInstance().clearAllTokens();
        assert.strictEqual(await lookup('B_Proc'), 'none', 'the changed file is read again');
        assert.strictEqual(await lookup('Renamed_Proc'), 'nested756.inc:1');
        write('nested756.inc', ["  MODULE('B')", '    B_Proc()', '  END']);
        bumpCrossFileEpoch();
        TokenCache.getInstance().clearAllTokens();
    });
});
