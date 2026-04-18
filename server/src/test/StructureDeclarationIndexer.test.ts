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
