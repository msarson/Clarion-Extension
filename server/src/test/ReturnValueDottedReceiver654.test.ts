/**
 * #654 (#638 step 4) — the discarded-return-value warning reads an `obj.Method()` receiver the
 * way hover and Go to Definition read it, through MemberLocatorService.resolveReceiverAt (#651).
 *
 * It asked resolveVariableType, which reads a local `ThisWindow CLASS(Base)` as a variable of
 * type Base (the #642 shape): a method the local class declares itself was then looked up on
 * Base, not found, and the discarded return went unreported.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { validateDiscardedReturnValues, __resetRvdMemosForTest } from '../providers/diagnostics/ReturnValueDiagnostics';
import { setServerInitialized } from '../serverState';
import { saveIncludeIndex } from '../services/IncludeIndexDiskCache';

let tmpDir: string;

function createDoc(filename: string, code: string): TextDocument {
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, code);
    return TextDocument.create(`file:///${filePath.replace(/\\/g, '/')}`, 'clarion', 1, code);
}

suite('Discarded return value through a local CLASS(Parent) receiver (#654)', () => {
    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvd654_'));
    });
    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });
    setup(() => __resetRvdMemosForTest());
    teardown(() => TokenCache.getInstance().clearAllTokens());

    const discarded = async (name: string, lines: string[]) => {
        const doc = createDoc(name, lines.join('\r\n'));
        const diags = await validateDiscardedReturnValues(TokenCache.getInstance().getTokens(doc), doc, new MemberLocatorService());
        return diags.filter(d => /is discarded/.test(String(d.message))).map(d => String(d.message));
    };

    const HEAD = [
        "  MEMBER('prog.clw')",
        '  MAP',
        '  END',
        'Base       CLASS,TYPE',
        'BaseValue    PROCEDURE(),LONG',
        '           END',
        'Caller PROCEDURE()',
        'ThisWindow   CLASS(Base)',
        'LocalValue     PROCEDURE(),LONG',
        '             END',
        '  CODE',
    ];

    test('CONTROL: an inherited method returning a value warns', async () => {
        const warns = await discarded('rvd654a.clw', [...HEAD, '  ThisWindow.BaseValue()']);
        assert.strictEqual(warns.length, 1, `got: ${warns.join(' | ')}`);
    });

    test('a method the local class declares itself warns', async () => {
        const warns = await discarded('rvd654b.clw', [...HEAD, '  ThisWindow.LocalValue()']);
        assert.strictEqual(warns.length, 1, `got: ${warns.join(' | ')}`);
        assert.ok(warns[0].includes("'ThisWindow.LocalValue'"), warns[0]);
    });

    // The memos persist across restarts (#358-cold), trusted while the files that fed them are
    // unchanged. So an upgraded server read an older build's answer - here the receiver type
    // before this fix, ThisWindow as Base - for every file the user had not edited since.
    test('a memo persisted under older resolution rules is not reused', async () => {
        const inc = path.join(tmpDir, 'rvd654base.inc');
        fs.writeFileSync(inc, ['Base       CLASS,TYPE', 'BaseValue    PROCEDURE(),LONG', '           END'].join('\r\n'));
        const lines = [
            "  MEMBER('prog.clw')",
            "  INCLUDE('rvd654base.inc'),ONCE",
            '  MAP',
            '  END',
            'Caller PROCEDURE()',
            'ThisWindow   CLASS(Base)',
            'LocalValue     PROCEDURE(),LONG',
            '             END',
            '  CODE',
            '  ThisWindow.LocalValue()',
        ];
        const text = lines.join('\r\n');
        let hash = 5381;
        for (let i = 0; i < text.length; i += 127) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
        const clw = path.join(tmpDir, 'rvd654c.clw');
        const incLower = inc.toLowerCase(), mtime = fs.statSync(inc).mtimeMs;
        // The envelope as a build before this fix wrote it: the pre-fix signature format.
        saveIncludeIndex('rvdmemo', clw.toLowerCase(), {
            signature: `${text.length}|${hash}`,
            contributing: { [incLower]: mtime },
            payload: {
                types: [{ k: 'THISWINDOW', v: { typeName: 'Base', isClass: true, isReference: false }, files: [[incLower, mtime]] }],
                classes: [],
            },
        });
        const warns = await discarded('rvd654c.clw', lines);
        assert.strictEqual(warns.length, 1, `the persisted pre-fix answer was reused - got: ${warns.join(' | ')}`);
    });
});
