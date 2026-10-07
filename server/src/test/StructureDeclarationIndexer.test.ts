import * as assert from 'assert';
import { scanSourceForDeclarations, StructureDeclarationInfo } from '../utils/StructureDeclarationIndexer';

const FAKE_FILE = 'test://test.inc';

function scan(source: string): StructureDeclarationInfo[] {
    return scanSourceForDeclarations(source, FAKE_FILE);
}

function findByName(results: StructureDeclarationInfo[], name: string): StructureDeclarationInfo | undefined {
    return results.find(r => r.name.toLowerCase() === name.toLowerCase());
}

suite('StructureDeclarationIndexer — scanSourceForDeclarations', () => {

    // -----------------------------------------------------------------------
    // Type structures
    // -----------------------------------------------------------------------
    suite('CLASS', () => {
        test('simple CLASS declaration', () => {
            const r = scan('MyClass  CLASS');
            const d = findByName(r, 'MyClass');
            assert.ok(d, 'should find MyClass');
            assert.strictEqual(d!.structureType, 'CLASS');
            assert.strictEqual(d!.line, 0);
        });

        test('CLASS with inheritance', () => {
            const r = scan('MetroForm  CLASS(ce_MetroWizardForm)');
            const d = findByName(r, 'MetroForm');
            assert.ok(d);
            assert.strictEqual(d!.parentName, 'ce_MetroWizardForm');
        });

        test('CLASS with MODULE attribute', () => {
            const r = scan("AbWindow  CLASS,MODULE('ABWINDOW.CLW')");
            const d = findByName(r, 'AbWindow');
            assert.ok(d);
            assert.strictEqual(d!.moduleName, 'ABWINDOW.CLW');
        });

        test('CLASS TYPE declaration', () => {
            const r = scan('BaseClass  CLASS,TYPE');
            const d = findByName(r, 'BaseClass');
            assert.ok(d);
            assert.strictEqual(d!.isType, true);
        });
    });

    suite('INTERFACE', () => {
        test('simple INTERFACE', () => {
            const r = scan('IMyInterface  INTERFACE');
            const d = findByName(r, 'IMyInterface');
            assert.ok(d);
            assert.strictEqual(d!.structureType, 'INTERFACE');
        });
    });

    suite('QUEUE / GROUP / RECORD / FILE / VIEW', () => {
        const cases: Array<[string, string]> = [
            ['MyQueue  QUEUE', 'QUEUE'],
            ['MyGroup  GROUP', 'GROUP'],
            ['MyRecord  RECORD', 'RECORD'],
            ['MyFile  FILE,DRIVER(\'TOPSPEED\')', 'FILE'],
            ['MyView  VIEW(MyFile)', 'VIEW'],
        ];
        for (const [src, expected] of cases) {
            test(`${expected} structure`, () => {
                const r = scan(src);
                assert.ok(r.length > 0, `should find a ${expected}`);
                assert.strictEqual(r[0].structureType, expected);
            });
        }

        // A colon-qualified GROUP,TYPE label was silently invisible to the SDI, so
        // sdi.find("GLOB:WidgetCacheType") always returned zero hits — the whole type
        // never gets a completion/hover cross-file answer even though the declaring
        // file scans cleanly for every other declaration in it.
        test('colon-qualified GROUP,TYPE declaration (short prefix)', () => {
            const r = scan('GLOB:WidgetCacheType   GROUP,TYPE');
            const d = findByName(r, 'GLOB:WidgetCacheType');
            assert.ok(d, 'should find GLOB:WidgetCacheType');
            assert.strictEqual(d!.structureType, 'GROUP');
            assert.strictEqual(d!.isType, true);
        });

        test('colon-qualified QUEUE,TYPE declaration', () => {
            const r = scan('CFG:SettingsQType   QUEUE,TYPE');
            const d = findByName(r, 'CFG:SettingsQType');
            assert.ok(d, 'should find CFG:SettingsQType');
            assert.strictEqual(d!.structureType, 'QUEUE');
            assert.strictEqual(d!.isType, true);
        });

        test('colon-qualified CLASS declaration', () => {
            const r = scan('LONGPREFIX9:SomeClass   CLASS');
            const d = findByName(r, 'LONGPREFIX9:SomeClass');
            assert.ok(d, 'should find LONGPREFIX9:SomeClass');
            assert.strictEqual(d!.structureType, 'CLASS');
        });
    });

    // -----------------------------------------------------------------------
    // Standalone EQUATE
    // -----------------------------------------------------------------------
    suite('EQUATE (standalone)', () => {
        test('simple equate with value', () => {
            const r = scan("XYZ:Equate  EQUATE('Something')");
            const d = findByName(r, 'XYZ:Equate');
            assert.ok(d, 'should find XYZ:Equate');
            assert.strictEqual(d!.structureType, 'EQUATE');
            assert.strictEqual(d!.line, 0);
        });

        test('equate without value', () => {
            const r = scan('MyConst  EQUATE');
            const d = findByName(r, 'MyConst');
            assert.ok(d);
            assert.strictEqual(d!.structureType, 'EQUATE');
        });

        test('equate with numeric value', () => {
            const r = scan('MAX_ITEMS  EQUATE(100)');
            const d = findByName(r, 'MAX_ITEMS');
            assert.ok(d);
            assert.strictEqual(d!.structureType, 'EQUATE');
        });
    });

    // -----------------------------------------------------------------------
    // ITEMIZE blocks
    // -----------------------------------------------------------------------
    suite('ITEMIZE equates', () => {
        const itemizeSource = [
            'Color  ITEMIZE(0),PRE(Color)',
            'Red    EQUATE',
            'White  EQUATE',
            'Blue   EQUATE',
            'Pink   EQUATE(5)',
            'END',
        ].join('\n');

        test('ITEMIZE declaration itself is indexed', () => {
            const r = scan(itemizeSource);
            const d = findByName(r, 'Color');
            assert.ok(d, 'should index the ITEMIZE block itself');
            assert.strictEqual(d!.structureType, 'ITEMIZE');
        });

        test('EQUATE inside ITEMIZE gets PRE prefix', () => {
            const r = scan(itemizeSource);
            assert.ok(findByName(r, 'Color:Red'), 'Color:Red should be indexed');
            assert.ok(findByName(r, 'Color:White'), 'Color:White should be indexed');
            assert.ok(findByName(r, 'Color:Blue'), 'Color:Blue should be indexed');
            assert.ok(findByName(r, 'Color:Pink'), 'Color:Pink should be indexed');
        });

        test('ITEMIZE_EQUATE entries have correct structureType', () => {
            const r = scan(itemizeSource);
            const d = findByName(r, 'Color:Red');
            assert.ok(d);
            assert.strictEqual(d!.structureType, 'ITEMIZE_EQUATE');
        });

        test('raw EQUATE names (without prefix) are not indexed', () => {
            const r = scan(itemizeSource);
            assert.strictEqual(findByName(r, 'Red'), undefined, 'bare "Red" should not be in index');
        });

        test('ITEMIZE with expression seed and different PRE', () => {
            const source = [
                'Stuff  ITEMIZE(Color:Last + 1),PRE(My)',
                'X      EQUATE',
                'Y      EQUATE',
                'END',
            ].join('\n');
            const r = scan(source);
            assert.ok(findByName(r, 'My:X'), 'My:X should be indexed');
            assert.ok(findByName(r, 'My:Y'), 'My:Y should be indexed');
        });

        test('EQUATEs after END are no longer prefixed', () => {
            const source = [
                'Color  ITEMIZE(0),PRE(Color)',
                'Red    EQUATE',
                'END',
                'Standalone  EQUATE(999)',
            ].join('\n');
            const r = scan(source);
            assert.ok(findByName(r, 'Color:Red'), 'prefixed equate should exist');
            assert.ok(findByName(r, 'Standalone'), 'standalone equate after END should exist');
            // "Red" without prefix should NOT be in index
            assert.strictEqual(findByName(r, 'Red'), undefined);
        });
    });

    // -----------------------------------------------------------------------
    // Blank-label ITEMIZE (no label at column 0, e.g. XMLType.inc style)
    // -----------------------------------------------------------------------
    suite('blank-label ITEMIZE', () => {
        const blankItemizeSource = [
            '              ITEMIZE,PRE(CLType)',
            'BYTE          EQUATE',
            'SHORT         EQUATE',
            'ULONG         EQUATE',
            'END',
        ].join('\n');

        test('member EQUATEs get PRE prefix even with no block label', () => {
            const r = scan(blankItemizeSource);
            assert.ok(findByName(r, 'CLType:BYTE'), 'CLType:BYTE should be indexed');
            assert.ok(findByName(r, 'CLType:SHORT'), 'CLType:SHORT should be indexed');
            assert.ok(findByName(r, 'CLType:ULONG'), 'CLType:ULONG should be indexed');
        });

        test('bare names are NOT indexed for blank-label ITEMIZE', () => {
            const r = scan(blankItemizeSource);
            assert.strictEqual(findByName(r, 'BYTE'), undefined, '"BYTE" should not appear as bare name');
            assert.strictEqual(findByName(r, 'SHORT'), undefined, '"SHORT" should not appear as bare name');
        });

        test('blank-label ITEMIZE without PRE indexes entries under plain name', () => {
            const source = [
                '              ITEMIZE',
                'ValA          EQUATE(1)',
                'ValB          EQUATE(2)',
                'END',
            ].join('\n');
            const r = scan(source);
            // No PRE → entries use their own label
            assert.ok(findByName(r, 'ValA'), 'ValA should be indexed');
            assert.ok(findByName(r, 'ValB'), 'ValB should be indexed');
        });
    });

    // -----------------------------------------------------------------------
    // ITEMIZE closed by an indented END / a period, and colon-qualified PRE
    // -----------------------------------------------------------------------
    suite('ITEMIZE close and colon-qualified PRE', () => {
        const names = (r: StructureDeclarationInfo[]) => r.map(d => d.name);

        test('indented END closes the ITEMIZE — later EQUATEs keep their own names', () => {
            const source = [
                '                     ITEMIZE(200),PRE(Btn)',
                'Ok                     EQUATE',
                'Cancel                 EQUATE',
                '                     END',
                '',
                'Evt:Refresh          EQUATE(282H)',
                'PageBase             EQUATE(040000H)',
            ].join('\n');
            const r = scan(source);
            assert.ok(findByName(r, 'Btn:Ok'), 'Btn:Ok should be indexed');
            assert.ok(findByName(r, 'Btn:Cancel'), 'Btn:Cancel should be indexed');
            const evt = findByName(r, 'Evt:Refresh');
            assert.ok(evt, `Evt:Refresh should be indexed under its own name; got ${names(r).join(', ')}`);
            assert.strictEqual(evt!.structureType, 'EQUATE');
            const pb = findByName(r, 'PageBase');
            assert.ok(pb, `PageBase should be indexed under its own name; got ${names(r).join(', ')}`);
            assert.strictEqual(pb!.structureType, 'EQUATE');
            assert.strictEqual(findByName(r, 'Btn:Evt:Refresh'), undefined);
            assert.strictEqual(findByName(r, 'Btn:PageBase'), undefined);
        });

        test('labelled ITEMIZE with an indented END closes too', () => {
            const source = [
                'Shade  ITEMIZE(0),PRE(Shade)',
                'Dark   EQUATE',
                '       END',
                'Loose  EQUATE(7)',
            ].join('\n');
            const r = scan(source);
            assert.ok(findByName(r, 'Shade:Dark'));
            const loose = findByName(r, 'Loose');
            assert.ok(loose, `Loose should be indexed under its own name; got ${names(r).join(', ')}`);
            assert.strictEqual(loose!.structureType, 'EQUATE');
        });

        test('a period on its own line closes the ITEMIZE', () => {
            const source = [
                '  ITEMIZE,PRE(Mode)',
                'Fast    EQUATE',
                '  .',
                'Slow    EQUATE(9)',
            ].join('\n');
            const r = scan(source);
            assert.ok(findByName(r, 'Mode:Fast'));
            assert.ok(findByName(r, 'Slow'), `Slow should be indexed under its own name; got ${names(r).join(', ')}`);
            assert.strictEqual(findByName(r, 'Mode:Slow'), undefined);
        });

        test('consecutive ITEMIZE blocks with indented ENDs each use their own PRE', () => {
            const source = [
                '  ITEMIZE,PRE(First)',
                'One     EQUATE',
                '  END',
                '  ITEMIZE',
                'Two     EQUATE',
                '  END',
            ].join('\n');
            const r = scan(source);
            assert.ok(findByName(r, 'First:One'));
            assert.ok(findByName(r, 'Two'), `Two (no PRE) should be indexed bare; got ${names(r).join(', ')}`);
            assert.strictEqual(findByName(r, 'First:Two'), undefined);
        });

        test('blank-label ITEMIZE,PRE(AB:CD) expands members to AB:CD:Name', () => {
            const source = [
                '                     ITEMIZE,PRE(AB:CD)',
                'None                   EQUATE(-1)',
                'Text                   EQUATE(00H)',
                'Value                  EQUATE',
                '                     END',
            ].join('\n');
            const r = scan(source);
            for (const n of ['AB:CD:None', 'AB:CD:Text', 'AB:CD:Value']) {
                const d = findByName(r, n);
                assert.ok(d, `${n} should be indexed; got ${names(r).join(', ')}`);
                assert.strictEqual(d!.structureType, 'ITEMIZE_EQUATE');
            }
            for (const bare of ['None', 'Text', 'Value']) {
                assert.strictEqual(findByName(r, bare), undefined, `bare "${bare}" should not be indexed`);
            }
        });

        test('labelled ITEMIZE,PRE(AB:CD) expands members to AB:CD:Name', () => {
            const source = [
                'Flags  ITEMIZE(1),PRE(AB:CD)',
                'On     EQUATE',
                'Off    EQUATE(5)',
                '       END',
            ].join('\n');
            const r = scan(source);
            assert.ok(findByName(r, 'Flags'), 'the ITEMIZE itself is indexed');
            assert.ok(findByName(r, 'AB:CD:On'), `AB:CD:On should be indexed; got ${names(r).join(', ')}`);
            assert.ok(findByName(r, 'AB:CD:Off'), `AB:CD:Off should be indexed; got ${names(r).join(', ')}`);
            assert.strictEqual(findByName(r, 'On'), undefined);
            assert.strictEqual(findByName(r, 'Off'), undefined);
        });
    });

    // -----------------------------------------------------------------------
    // ITEMIZE with an empty prefix, and members already spelled with the prefix
    // -----------------------------------------------------------------------
    suite('ITEMIZE empty prefix and pre-qualified members', () => {
        const names = (r: StructureDeclarationInfo[]) => r.map(d => d.name);

        test('labelled ITEMIZE,PRE (no parentheses) uses the label as the prefix', () => {
            const source = [
                'Shade             ITEMIZE(0),PRE',
                'Off                 EQUATE',
                'Vertical            EQUATE',
                '                  END',
            ].join('\n');
            const r = scan(source);
            for (const n of ['Shade:Off', 'Shade:Vertical']) {
                const d = findByName(r, n);
                assert.ok(d, `${n} should be indexed; got ${names(r).join(', ')}`);
                assert.strictEqual(d!.structureType, 'ITEMIZE_EQUATE');
            }
            assert.strictEqual(findByName(r, 'Off'), undefined);
            assert.strictEqual(findByName(r, 'Vertical'), undefined);
        });

        test('labelled ITEMIZE,PRE() uses the label as the prefix', () => {
            const source = [
                'Mode   ITEMIZE,PRE()',
                'Fast   EQUATE',
                '       END',
            ].join('\n');
            const r = scan(source);
            assert.ok(findByName(r, 'Mode:Fast'), `Mode:Fast should be indexed; got ${names(r).join(', ')}`);
            assert.strictEqual(findByName(r, 'Fast'), undefined);
        });

        test('blank-label ITEMIZE,PRE() has no prefix', () => {
            const source = [
                '       ITEMIZE,PRE()',
                'Fast   EQUATE',
                '       END',
            ].join('\n');
            const r = scan(source);
            assert.ok(findByName(r, 'Fast'), `Fast should be indexed bare; got ${names(r).join(', ')}`);
        });

        test('a member already spelled with the prefix is not prefixed twice', () => {
            const source = [
                'BtnState ITEMIZE,PRE()',
                'BtnState:Normal EQUATE(1)',
                'Hot             EQUATE',
                '         END',
                '         ITEMIZE,PRE(Px)',
                'Px:Own   EQUATE',
                'Zz:Other EQUATE',
                '         END',
            ].join('\n');
            const r = scan(source);
            for (const n of ['BtnState:Normal', 'BtnState:Hot', 'Px:Own', 'Px:Zz:Other']) {
                assert.ok(findByName(r, n), `${n} should be indexed; got ${names(r).join(', ')}`);
            }
            for (const n of ['BtnState:BtnState:Normal', 'Px:Px:Own', 'Zz:Other']) {
                assert.strictEqual(findByName(r, n), undefined, `${n} should not be indexed`);
            }
        });
    });

    // -----------------------------------------------------------------------
    // Comment handling
    // -----------------------------------------------------------------------
    suite('comments', () => {
        test('comment-only line is skipped', () => {
            const r = scan('! This is a comment\nMyClass  CLASS');
            assert.strictEqual(r.length, 1);
            assert.strictEqual(r[0].name, 'MyClass');
        });

        test('inline comment does not corrupt label extraction', () => {
            const r = scan('MyClass  CLASS  ! This is the main class');
            const d = findByName(r, 'MyClass');
            assert.ok(d, 'should still find MyClass');
            assert.strictEqual(d!.structureType, 'CLASS');
        });

        test('EQUATE with inline comment', () => {
            const r = scan('Color:Red  EQUATE(0)  ! Red colour');
            const d = findByName(r, 'Color:Red');
            assert.ok(d);
            assert.strictEqual(d!.structureType, 'EQUATE');
        });
    });

    // -----------------------------------------------------------------------
    // Mixed file
    // -----------------------------------------------------------------------
    suite('mixed declarations', () => {
        test('scans multiple declaration types from one file', () => {
            const source = [
                'MyClass    CLASS(Base)',
                'MyMethod   PROCEDURE',
                'END',
                '',
                'IMyFace    INTERFACE',
                'DoIt       PROCEDURE',
                'END',
                '',
                'Color      ITEMIZE(0),PRE(Color)',
                'Red        EQUATE',
                'END',
                '',
                'Global:Val EQUATE(42)',
                'MyQueue    QUEUE',
                'Field1     LONG',
                'END',
            ].join('\n');

            const r = scan(source);
            assert.ok(findByName(r, 'MyClass'), 'CLASS');
            assert.ok(findByName(r, 'IMyFace'), 'INTERFACE');
            assert.ok(findByName(r, 'Color'), 'ITEMIZE');
            assert.ok(findByName(r, 'Color:Red'), 'ITEMIZE_EQUATE');
            assert.ok(findByName(r, 'Global:Val'), 'EQUATE');
            assert.ok(findByName(r, 'MyQueue'), 'QUEUE');
        });

        test('line numbers are 0-based', () => {
            const source = 'FirstClass  CLASS\nSecondClass CLASS';
            const r = scan(source);
            const first = findByName(r, 'FirstClass');
            const second = findByName(r, 'SecondClass');
            assert.strictEqual(first?.line, 0);
            assert.strictEqual(second?.line, 1);
        });
    });

    // -----------------------------------------------------------------------
    // Case insensitivity
    // -----------------------------------------------------------------------
    suite('case insensitivity', () => {
        test('CLASS keyword is case-insensitive', () => {
            const r = scan('myclass  class');
            assert.ok(r.length > 0);
            assert.strictEqual(r[0].structureType, 'CLASS');
        });

        test('EQUATE keyword is case-insensitive', () => {
            const r = scan('MyVal  equate(1)');
            assert.ok(r.length > 0);
            assert.strictEqual(r[0].structureType, 'EQUATE');
        });
    });
});
