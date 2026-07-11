/**
 * #313 — goto-implementation from CALL SITES of procedures declared in a
 * MODULE block inside a MAP-included INC (the WinEvent pattern), plus
 * docs-correct handling of EXTENSIONLESS MODULE names.
 *
 * Layout (all real temp files, no solution — same-dir fallbacks carry resolution):
 *   main313.clw     PROGRAM whose MAP has include('wevent313.inc') + include('wevent313b.inc')
 *   wevent313.inc   module('wevent313.clw')  → WinThing(),long,name('WinThing')
 *   wevent313b.inc  module('wevent313b')     → WinNoExt(),long,name('WinNoExt')   [extensionless!]
 *   wevent313.clw   WinThing PROCEDURE() implementation
 *   wevent313b.clw  WinNoExt PROCEDURE() implementation
 *   usage313.clw    MEMBER('main313.clw') module calling both
 *
 * Pins:
 *   1. Ctrl+F12 at the CALL SITE lands on the implementation (was: null — the
 *      call-site route only checked the current MAP and the parent's
 *      MODULE('<current file>') blocks, never the parent's MAP includes).
 *   2. Same for an extensionless module('wevent313b') — per the Language
 *      Reference (MODULE — specify MEMBER source file), the sourcefile
 *      routinely omits the extension: MODULE('Loadit') = loadit.clw.
 *   3. Declaration-side Ctrl+F12 also works for the extensionless module
 *      (was: mis-routed into the external-library branch → null).
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { setServerInitialized } from '../serverState';

let tmpDir: string;

function writeFixture(name: string, lines: string[]): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, lines.join('\r\n'));
    return p;
}

function openDoc(name: string): TextDocument {
    const p = path.join(tmpDir, name);
    const content = fs.readFileSync(p, 'utf8');
    return TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content);
}

function asLocation(result: Location | Location[] | null): Location | null {
    if (!result) return null;
    return Array.isArray(result) ? result[0] ?? null : result;
}

suite('ImplementationProvider #313 — MAP-include MODULE procedures', () => {

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'impl313_'));

        writeFixture('main313.clw', [
            '  PROGRAM',
            '  MAP',
            "  include('wevent313.inc')",
            "  include('wevent313b.inc')",
            '  END',
            '  CODE',
        ]);
        writeFixture('wevent313.inc', [
            "  module('wevent313.clw')",
            "    WinThing(),long,name('WinThing')",
            '  end',
        ]);
        writeFixture('wevent313b.inc', [
            "  module('wevent313b')",
            "    WinNoExt(),long,name('WinNoExt')",
            '  end',
        ]);
        writeFixture('wevent313.clw', [
            "  member('main313.clw')",
            '  MAP',
            '  END',
            'WinThing PROCEDURE()',
            '  CODE',
            '  RETURN 0',
        ]);
        writeFixture('wevent313b.clw', [
            "  member('main313.clw')",
            '  MAP',
            '  END',
            'WinNoExt PROCEDURE()',
            '  CODE',
            '  RETURN 0',
        ]);
        writeFixture('usage313.clw', [
            "  member('main313.clw')",
            'Caller PROCEDURE()',
            'X  long',
            '  CODE',
            '  X = WinThing()',
            '  X = WinNoExt()',
        ]);
    });

    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    teardown(() => TokenCache.getInstance().clearAllTokens());

    test('call site → implementation through the parent MAP include (module with extension)', async () => {
        const usage = openDoc('usage313.clw');
        const provider = new ImplementationProvider();
        // cursor on "WinThing" in `  X = WinThing()` (line 4)
        const result = asLocation(await provider.provideImplementation(usage, { line: 4, character: 8 }));

        assert.ok(result, 'implementation must resolve from the call site');
        assert.ok(result!.uri.toLowerCase().endsWith('wevent313.clw'),
            `expected wevent313.clw, got ${result!.uri}`);
        assert.strictEqual(result!.range.start.line, 3, 'lands on the WinThing PROCEDURE implementation');
    });

    test('call site → implementation for an EXTENSIONLESS module name', async () => {
        const usage = openDoc('usage313.clw');
        const provider = new ImplementationProvider();
        // cursor on "WinNoExt" in `  X = WinNoExt()` (line 5)
        const result = asLocation(await provider.provideImplementation(usage, { line: 5, character: 8 }));

        assert.ok(result, 'implementation must resolve for module(\'wevent313b\') — extensionless = source module with implied .clw');
        assert.ok(result!.uri.toLowerCase().endsWith('wevent313b.clw'),
            `expected wevent313b.clw, got ${result!.uri}`);
    });

    test('hover at the call site resolves through the parent MAP include', async () => {
        const usage = openDoc('usage313.clw');
        const hover = new HoverProvider();
        const result = await hover.provideHover(usage, { line: 4, character: 8 });

        assert.ok(result, 'hover must resolve at the call site');
        const text = JSON.stringify(result!.contents);
        assert.ok(text.includes('WinThing'), `hover must describe WinThing, got: ${text.slice(0, 200)}`);
    });

    // #313 follow-up guards: the walk cost 12s per hover when it ran for words it
    // could never match (dotted member access) and scanned includes OUTSIDE MAP blocks.
    test('walk guard: dotted words never trigger the MAP-include walk', async () => {
        const usage = openDoc('usage313.clw');
        const { MapProcedureResolver } = await import('../utils/MapProcedureResolver');
        const resolver = new MapProcedureResolver();
        const tokens = TokenCache.getInstance().getTokens(usage);

        const t0 = Date.now();
        const hit = await resolver.findDeclarationInMapIncludes('PARENT._FindFirstBreak', usage, tokens);
        const ms = Date.now() - t0;

        assert.strictEqual(hit, null, 'dotted names are member access, never MAP procedures');
        assert.ok(ms < 50, `dotted-word guard must return immediately (took ${ms}ms)`);
    });

    test('walk guard: root-level includes outside MAP blocks are not walked', async () => {
        // main with an include OUTSIDE the MAP that would satisfy the search if walked.
        writeFixture('decoy313.inc', [
            "  module('wevent313.clw')",
            "    DecoyProc(),long,name('DecoyProc')",
            '  end',
        ]);
        writeFixture('mainguard313.clw', [
            '  PROGRAM',
            "  include('decoy313.inc')",   // OUTSIDE the MAP — not a prototype context
            '  MAP',
            '  END',
            '  CODE',
        ]);
        const doc = openDoc('mainguard313.clw');
        const { MapProcedureResolver } = await import('../utils/MapProcedureResolver');
        const resolver = new MapProcedureResolver();
        const tokens = TokenCache.getInstance().getTokens(doc);

        const hit = await resolver.findDeclarationInMapIncludes('DecoyProc', doc, tokens);
        assert.strictEqual(hit, null, 'includes outside MAP blocks must not be treated as prototype sources');
    });

    test('declaration side: extensionless module resolves too', async () => {
        const inc = openDoc('wevent313b.inc');
        const provider = new ImplementationProvider();
        // cursor on "WinNoExt" in the prototype line (line 1)
        const result = asLocation(await provider.provideImplementation(inc, { line: 1, character: 6 }));

        assert.ok(result, 'declaration-side Ctrl+F12 must resolve extensionless module names');
        assert.ok(result!.uri.toLowerCase().endsWith('wevent313b.clw'),
            `expected wevent313b.clw, got ${result!.uri}`);
    });
});
