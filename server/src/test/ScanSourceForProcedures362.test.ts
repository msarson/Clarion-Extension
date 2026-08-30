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

    test('catches keyword-LESS MODULE shorthand prototypes (NetTalk/library form)', () => {
        // The real NetTalk shape Mark pasted: indented, no PROCEDURE keyword,
        // `Name(params),attrs` inside a MODULE('') block. Before #362-shorthand
        // these never indexed, so the hover/F12 fast-path could never fire.
        const src = [
            '  map',
            "    module('')",
            "      NetDebugTrace(string),long,proc,pascal,name('NetDebugTrace'),DLL(dll_mode)",
            "      NetAutoGetServer(long,string,long),long,proc,pascal,name('NetAutoGetServer'),DLL(dll_mode)",
            "      !NetGet_NetCriticalSection(),long,proc,pascal,name('x'),DLL(dll_mode)",  // commented out
            "      INCLUDE('driver.inc')",                                                    // directive, not a proc
            '    end',
            '  end'
        ].join('\n');

        const procs = scanSourceForProcedures(src, 'C:\\x\\netall.inc');
        const byName = new Map(procs.map(p => [p.name, p]));

        assert.ok(byName.has('NetDebugTrace'), 'keyword-less shorthand prototype captured');
        assert.strictEqual(byName.get('NetDebugTrace')!.kind, 'procedure');
        assert.ok(byName.get('NetDebugTrace')!.signature.startsWith('(string)'), 'signature captured');
        assert.ok(byName.has('NetAutoGetServer'), 'second shorthand prototype captured');

        assert.ok(!byName.has('NetGet_NetCriticalSection'), 'commented-out prototype excluded');
        assert.ok(!byName.has('INCLUDE'), 'INCLUDE directive not mistaken for a procedure');
        assert.ok(!byName.has('module'), 'MODULE not mistaken for a procedure');
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

    test('does not index CLASS/INTERFACE member prototypes as bare global procedures', () => {
        // Real-world class bodies are often written unindented — member labels at
        // column 0, the same shape as a real top-level declaration. Before the
        // structureStack fix, a method like `DoWork` indexed identically to a
        // global procedure — the bare name then resolved via
        // SymbolFinderService.findProcedureViaIndex (and so the undeclared-variable
        // diagnostic's cross-file augmentation) to this unrelated class member,
        // matching the defect class PR #391 fixed for hover.
        const src = [
            'SomeClass CLASS,TYPE, MODULE(\'SomeClass.clw\')',
            '',
            'SomeField      &SomeFieldType',
            'Construct      PROCEDURE()',
            'Destruct       PROCEDURE()',
            'DoWork         PROCEDURE( *? )',
            '',
            '             END',
            '',
            'SomeInterface  INTERFACE',
            'Method1        PROCEDURE()',
            '             END',
            '',
            'GlobalAfter    PROCEDURE()',
            '  CODE',
            '  RETURN'
        ].join('\n');

        const procs = scanSourceForProcedures(src, 'C:\\x\\SomeClass.inc');
        const byName = new Map(procs.map(p => [p.name, p]));

        assert.ok(!byName.has('Construct'), 'CLASS member not indexed as bare global procedure');
        assert.ok(!byName.has('Destruct'), 'CLASS member not indexed as bare global procedure');
        assert.ok(!byName.has('DoWork'), 'CLASS member "DoWork" not indexed as bare global procedure (the real repro shape)');
        assert.ok(!byName.has('Method1'), 'INTERFACE member not indexed as bare global procedure');

        assert.ok(byName.has('GlobalAfter'), 'a real global procedure after the CLASS/INTERFACE close is still indexed');
    });

    test('CLASS/INTERFACE tracking survives an inline nested structure (e.g. a GROUP data member)', () => {
        // A GROUP declared inline inside a CLASS needs its own END — that inner END
        // must pop only the GROUP, not prematurely close the enclosing CLASS.
        const src = [
            'SomeClass2  CLASS,TYPE',
            'Rec           GROUP',
            'Field1           STRING(10)',
            '              END',
            'Method1       PROCEDURE()',
            '            END',
            '',
            'GlobalAfter2  PROCEDURE()',
            '  CODE',
            '  RETURN'
        ].join('\n');

        const procs = scanSourceForProcedures(src, 'C:\\x\\y.inc');
        const byName = new Map(procs.map(p => [p.name, p]));

        assert.ok(!byName.has('Method1'), 'CLASS member after an inline nested GROUP is still correctly excluded');
        assert.ok(byName.has('GlobalAfter2'), 'a real global procedure after the CLASS close is still indexed');
    });

    test('a trailing `.` on the last member line closes the structure (period-terminated CLASS)', () => {
        // Clarion closes a structure with a `.` terminator as often as with END —
        // commonly as a TRAILING terminator on the last member line. If that form
        // doesn't pop the stack, the CLASS stays "open" to EOF and every genuine
        // global procedure declared later in the same file is dropped from the
        // proc index (F12/hover fast-path regression).
        const src = [
            'PClass      CLASS,TYPE',
            'Method1       PROCEDURE()',
            'LastField       STRING(10).',
            '',
            'GlobalAfter3 PROCEDURE()',
            '  CODE',
            '  RETURN'
        ].join('\n');

        const procs = scanSourceForProcedures(src, 'C:\\x\\p1.inc');
        const byName = new Map(procs.map(p => [p.name, p]));

        assert.ok(!byName.has('Method1'), 'CLASS member still excluded in a period-terminated class');
        assert.ok(byName.has('GlobalAfter3'), 'a global procedure after a period-terminated CLASS must be indexed');
    });

    test('a trailing `.` on a member PROCEDURE line closes the structure', () => {
        // The terminator can sit on a member *prototype* line too. That line is
        // still INSIDE the class it terminates (must be excluded from the bare-name
        // index) — the close takes effect for the lines after it.
        const src = [
            'PClass2     CLASS,TYPE',
            'Done          PROCEDURE().',
            '',
            'GlobalAfter4 PROCEDURE()',
            '  CODE',
            '  RETURN'
        ].join('\n');

        const procs = scanSourceForProcedures(src, 'C:\\x\\p2.inc');
        const byName = new Map(procs.map(p => [p.name, p]));

        assert.ok(!byName.has('Done'), 'the period-terminated member prototype itself is still a member, not a global');
        assert.ok(byName.has('GlobalAfter4'), 'a global procedure after the close must be indexed');
    });

    test('collapsed `. .` closes multiple structures (nested GROUP + CLASS on one line)', () => {
        const src = [
            'PClass3     CLASS,TYPE',
            'Rec           GROUP',
            'Field1          STRING(10)',
            '. .',
            '',
            'GlobalAfter5 PROCEDURE()',
            '  CODE',
            '  RETURN'
        ].join('\n');

        const procs = scanSourceForProcedures(src, 'C:\\x\\p3.inc');
        const byName = new Map(procs.map(p => [p.name, p]));

        assert.ok(byName.has('GlobalAfter5'), 'a `. .` line must pop BOTH the GROUP and the CLASS');
    });

    test('a one-line `Rec GROUP,PRE(R1).` inside a CLASS opens and closes on the same line', () => {
        const src = [
            'PClass4     CLASS,TYPE',
            'Rec           GROUP,PRE(R1).',
            'Method1       PROCEDURE()',
            '            END',
            '',
            'GlobalAfter6 PROCEDURE()',
            '  CODE',
            '  RETURN'
        ].join('\n');

        const procs = scanSourceForProcedures(src, 'C:\\x\\p4.inc');
        const byName = new Map(procs.map(p => [p.name, p]));

        assert.ok(!byName.has('Method1'), 'member after the self-closing GROUP is still inside the CLASS — excluded');
        assert.ok(byName.has('GlobalAfter6'), 'the CLASS END must not have been consumed by the self-closing GROUP');
    });

    test('a class member named Map is not a MAP opener (libsrc ablwinr.clw shape)', () => {
        // MAP_OPEN_PATTERN once matched any line whose first word is `Map`, so this
        // member bumped mapDepth and the class END was consumed by the MAP close
        // instead of popping the CLASS — every later Class.Method implementation
        // in the file was then dropped as a member prototype.
        const src = [
            '   MEMBER',
            '   MAP',
            '   END',
            '',
            'EventMapper             CLASS',
            'Construct                 PROCEDURE()',
            'Map                       PROCEDURE(ASTRING name),SIGNED',
            'TieH                      SIGNED',
            '                        END',
            '',
            'Event                   CLASS(Element)',
            'EventNo                   UNSIGNED',
            '                        END',
            '',
            'EventMapper.Construct   PROCEDURE()',
            '  CODE',
            '',
            'EventMapper.Map         PROCEDURE(ASTRING name)',
            '  CODE',
            '',
            'GlobalAfterMap          PROCEDURE()',
            '  CODE'
        ].join('\n');

        const procs = scanSourceForProcedures(src, 'C:\\x\\ablwinr.clw');
        const byName = new Map(procs.map(p => [p.name, p]));

        assert.ok(!byName.has('Construct'), 'member prototype Construct is not a bare global');
        assert.ok(!byName.has('Map'), 'member prototype Map is not a bare global');
        assert.ok(byName.has('EventMapper.Construct'), 'implementation before the leak point indexed');
        assert.ok(byName.has('EventMapper.Map'), 'Class.Method implementation after a Map member is still indexed');
        assert.ok(byName.has('GlobalAfterMap'), 'global after a Map member is still indexed');
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
