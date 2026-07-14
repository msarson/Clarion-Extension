import * as assert from 'assert';
import * as fs from 'fs';
import { scanSourceForProcedures } from '../utils/StructureDeclarationIndexer';

/**
 * #362 — the lightweight regex scanner that lets cross-file hover/F12/impl answer
 * "where is procedure X declared?" from an index instead of tokenizing the include
 * universe. Pins the declaration shapes it must catch and the ones it must not.
 */
suite('scanSourceForProcedures (#362)', () => {

    test('catches MAP prototypes, global implementations, and Class.Method implementations', () => {
        const src = [
            "  MEMBER('host.clw')",
            '',
            '  MAP',
            '    MODULE(\'netall.clw\')',
            "NetDebugTrace       PROCEDURE(STRING xMessage)",
            "fe_ClassVersion     PROCEDURE(byte Flag=0),string,name('fe_ClassVersion'),DLL(dll_mode)",
            '    END',
            '  END',
            '',
            'MyProc     PROCEDURE(LONG id)',
            '  CODE',
            '  RETURN',
            '',
            'ThisWindow.Init     PROCEDURE(),BYTE',
            '  CODE',
            '  RETURN',
            '',
            'DctInit     PROCEDURE',   // no params / no parens
            '  CODE'
        ].join('\n');

        const procs = scanSourceForProcedures(src, 'C:\\x\\host.clw');
        const byName = new Map(procs.map(p => [p.name, p]));

        assert.ok(byName.has('NetDebugTrace'), 'MAP prototype captured');
        assert.strictEqual(byName.get('NetDebugTrace')!.kind, 'procedure');
        assert.ok(byName.get('NetDebugTrace')!.signature.includes('STRING xMessage'), 'signature captured');

        assert.ok(byName.has('fe_ClassVersion'), 'attributed prototype captured');
        assert.ok(byName.has('MyProc'), 'global implementation captured');
        assert.ok(byName.has('DctInit'), 'no-paren PROCEDURE captured');

        assert.ok(byName.has('ThisWindow.Init'), 'Class.Method implementation captured');
        assert.strictEqual(byName.get('ThisWindow.Init')!.kind, 'method', 'dotted name → method');
    });

    test('does not treat indented lines, fields, or comment text as declarations', () => {
        const src = [
            'Rec  QUEUE',
            'Field  LONG',                 // a QUEUE field — not a procedure
            '     END',
            '  ! NetDebugTrace PROCEDURE   is only a comment',   // indented + comment
            'Foo  LONG                      ! PROCEDURE mentioned in a comment'
        ].join('\n');
        const procs = scanSourceForProcedures(src, 'C:\\x\\y.clw');
        assert.strictEqual(procs.length, 0, `no false positives; got ${JSON.stringify(procs.map(p => p.name))}`);
    });

    test('finds real procedures in IBSCommon.clw when present', function () {
        const real = 'F:\\TestApps\\Direct10Source\\IBSCommon.clw';
        if (!fs.existsSync(real)) { this.skip(); return; }
        const procs = scanSourceForProcedures(fs.readFileSync(real, 'utf8'), real);
        const names = new Set(procs.map(p => p.name));
        assert.ok(procs.length > 50, `expected many procedures, got ${procs.length}`);
        // Sampled from the real file's column-0 PROCEDURE lines.
        assert.ok(names.has('DctInit'), 'DctInit indexed');
        assert.ok(names.has('fe_ClassVersion'), 'fe_ClassVersion indexed');
        // At least one Class.Method implementation is present in a program module.
        assert.ok(procs.some(p => p.kind === 'method'), 'at least one Class.Method implementation indexed');
    });
});
