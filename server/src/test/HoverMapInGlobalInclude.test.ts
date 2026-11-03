/**
 * Call-site hover for a procedure whose prototype sits in a MAP that lives INSIDE an
 * included file, where the INCLUDE itself is in the global data section (outside any
 * MAP). A PROGRAM may hold several MAP structures, so an INC carrying its own
 * `MAP / MODULE('LogLib') / ... / END / END` is the usual way a DLL ships its prototypes.
 *
 * The #313 walk only followed INCLUDEs that sit inside a MAP at the root file, so it
 * never opened such an INC: hover at the call site returned nothing while F12 found the
 * declaration.
 *
 * Layout (real temp files, no solution — same-dir fallbacks carry resolution):
 *   maingi.clw    PROGRAM; include('logapigi.inc') in global data, empty MAP
 *   logapigi.inc  MAP / MODULE('LogLib') / Log_SetChannel(...) / END / END
 *   usagegi.clw   MEMBER('maingi.clw') module calling Log_SetChannel
 *   selfgi.clw    MEMBER module that includes logapigi.inc itself, outside its MAP
 *   shimgi.clw    MEMBER('maingi.clw') — an include shim
 *   viashimgi.clw module whose first statement is INCLUDE('shimgi.clw')
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';
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

suite('Hover — MAP inside a globally included file', () => {

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hovergi_'));

        writeFixture('maingi.clw', [
            '  PROGRAM',
            "  INCLUDE('logapigi.inc'),ONCE",   // global data, OUTSIDE the MAP below
            '  MAP',
            '  END',
            '  CODE',
        ]);
        writeFixture('logapigi.inc', [
            '! Prototypes for an external logging DLL',
            '  MAP',
            "    MODULE('LogLib')",
            '      Log_Open(), LONG, PROC',
            '      Log_SetChannel( LONG pHandle ), LONG, PROC   ! Select the active channel',
            '    END',
            '  END',
        ]);
        writeFixture('usagegi.clw', [
            "  MEMBER('maingi.clw')",
            'Caller PROCEDURE()',
            'Handle  LONG',
            '  CODE',
            '  Log_SetChannel(Handle)',
        ]);
        writeFixture('selfgi.clw', [
            "  MEMBER('maingi.clw')",
            "  INCLUDE('logapigi.inc'),ONCE",
            '  MAP',
            '  END',
            'Other PROCEDURE()',
            '  CODE',
            '  Log_SetChannel(0)',
        ]);
        // MEMBER via an INCLUDE shim: the module's first statement includes a file whose
        // own first statement is the MEMBER header.
        writeFixture('shimgi.clw', [
            "  MEMBER('maingi.clw')",
        ]);
        writeFixture('viashimgi.clw', [
            "  INCLUDE('shimgi.clw')",
            'Third PROCEDURE()',
            '  CODE',
            '  Log_SetChannel(1)',
        ]);
    });

    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    teardown(() => TokenCache.getInstance().clearAllTokens());

    test('hover at the call site shows the prototype from the included MAP (MEMBER parent includes it)', async () => {
        const usage = openDoc('usagegi.clw');
        const result = await new HoverProvider().provideHover(usage, { line: 4, character: 6 });

        assert.ok(result, 'hover must resolve at the call site');
        const text = JSON.stringify(result!.contents);
        assert.ok(text.includes('Log_SetChannel'), `hover must describe Log_SetChannel, got: ${text.slice(0, 300)}`);
        assert.ok(text.includes('pHandle'), `hover must show the prototype's parameters, got: ${text.slice(0, 300)}`);
    });

    test('hover at the call site works when the module itself includes the file', async () => {
        const doc = openDoc('selfgi.clw');
        const result = await new HoverProvider().provideHover(doc, { line: 6, character: 6 });

        assert.ok(result, 'hover must resolve at the call site');
        const text = JSON.stringify(result!.contents);
        assert.ok(text.includes('Log_SetChannel'), `hover must describe Log_SetChannel, got: ${text.slice(0, 300)}`);
    });

    test('hover at the call site reaches the parent through a MEMBER include shim', async () => {
        const doc = openDoc('viashimgi.clw');
        const result = await new HoverProvider().provideHover(doc, { line: 3, character: 6 });

        assert.ok(result, 'hover must resolve at the call site');
        const text = JSON.stringify(result!.contents);
        assert.ok(text.includes('Log_SetChannel'), `hover must describe Log_SetChannel, got: ${text.slice(0, 300)}`);
    });

    test('the walk returns the prototype line in the included file', async () => {
        const usage = openDoc('usagegi.clw');
        const tokens = TokenCache.getInstance().getTokens(usage);
        const hit = await new MapProcedureResolver().findDeclarationInMapIncludes('Log_SetChannel', usage, tokens);

        assert.ok(hit, 'declaration must be found through the global include');
        assert.ok(hit!.doc.uri.toLowerCase().endsWith('logapigi.inc'), `expected logapigi.inc, got ${hit!.doc.uri}`);
        assert.strictEqual(hit!.declLine, 4, 'lands on the Log_SetChannel prototype');
    });

    test('a globally included file with a MAP is not tokenized when its text does not name the procedure', async () => {
        writeFixture('otherapigi.inc', [
            '  MAP',
            "    MODULE('OtherLib')",
            '      Other_Call(), LONG, PROC',
            '    END',
            '  END',
        ]);
        writeFixture('mainothergi.clw', [
            '  PROGRAM',
            "  INCLUDE('otherapigi.inc'),ONCE",
            "  INCLUDE('logapigi.inc'),ONCE",
            '  MAP',
            '  END',
            '  CODE',
        ]);
        const doc = openDoc('mainothergi.clw');
        const tokens = TokenCache.getInstance().getTokens(doc);
        const resolver = new MapProcedureResolver();
        const loaded: string[] = [];
        const original = (resolver as any).loadDocForWalk.bind(resolver);
        (resolver as any).loadDocForWalk = async (p: string) => { loaded.push(path.basename(p).toLowerCase()); return original(p); };

        const hit = await resolver.findDeclarationInMapIncludes('Log_Open', doc, tokens);

        assert.ok(hit && hit.doc.uri.toLowerCase().endsWith('logapigi.inc'), 'the file that names it answers');
        assert.ok(!loaded.includes('otherapigi.inc'), `otherapigi.inc must not be loaded, loaded: ${loaded.join(', ')}`);
    });

    test('#809: a globally included header that only includes the MAP file is followed, and not tokenized', async () => {
        writeFixture('passgi.inc', [
            '! includes the logging API',
            "  INCLUDE('logapigi.inc'),ONCE",
        ]);
        writeFixture('mainpassgi.clw', [
            '  PROGRAM',
            "  INCLUDE('passgi.inc'),ONCE",
            '  MAP',
            '  END',
            '  CODE',
        ]);
        const doc = openDoc('mainpassgi.clw');
        const tokens = TokenCache.getInstance().getTokens(doc);
        const resolver = new MapProcedureResolver();
        const loaded: string[] = [];
        const original = (resolver as any).loadDocForWalk.bind(resolver);
        (resolver as any).loadDocForWalk = async (p: string) => { loaded.push(path.basename(p).toLowerCase()); return original(p); };

        const hit = await resolver.findDeclarationInMapIncludes('Log_SetChannel', doc, tokens);

        assert.ok(hit && hit.doc.uri.toLowerCase().endsWith('logapigi.inc'), `found through passgi.inc, got ${hit?.doc.uri}`);
        assert.strictEqual(hit!.declLine, 4);
        assert.ok(!loaded.includes('passgi.inc'), `passgi.inc is read as text, not tokenized; loaded: ${loaded.join(', ')}`);
    });

    test('a MODULE in a globally included file without a MAP is still not a prototype source', async () => {
        writeFixture('nomapgi.inc', [
            "  MODULE('LogLib')",
            '    Log_Stray(), LONG, PROC',
            '  END',
        ]);
        writeFixture('mainnomapgi.clw', [
            '  PROGRAM',
            "  INCLUDE('nomapgi.inc')",
            '  MAP',
            '  END',
            '  CODE',
        ]);
        const doc = openDoc('mainnomapgi.clw');
        const tokens = TokenCache.getInstance().getTokens(doc);
        const hit = await new MapProcedureResolver().findDeclarationInMapIncludes('Log_Stray', doc, tokens);

        assert.strictEqual(hit, null, 'only a MODULE inside a MAP declares a procedure');
    });
});
