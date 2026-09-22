/**
 * A procedure passed BY NAME as an argument — `SORT(Queue, CompareRows)` — is a
 * reference to that procedure, and hover / F12 must resolve it like any other
 * procedure reference.
 *
 * They did not. `ProcedureCallDetector.isProcedureCallOrReference` recognised only
 * three shapes: `Name(` (a call), `START(Name` (the one special-cased reference),
 * and a bare `Name` alone on its line. A name sitting between a comma and a closing
 * paren matched none of them, so the gate that guards the whole procedure pipeline
 * — HoverRouter step 3, DefinitionProvider's procedure branch, ImplementationProvider
 * — said "not a procedure" and the reference resolved to nothing: hover fell through
 * to a card with no location link, and F12 did nothing at all.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { ProcedureCallDetector } from '../providers/utils/ProcedureCallDetector';
import { setServerInitialized } from '../serverState';
import { hoverLocations, definitionLocations } from './support/hoverDefinitionAgreement';

/** The shape of a module with a MAP-prototyped comparison procedure used as a SORT callback. */
const LINES = [
    '    MEMBER',                                                  // 0
    '',                                                            // 1
    '    MAP',                                                     // 2
    '        CompareRows(*RowGroupType p1,*RowGroupType p2),LONG', // 3
    '    END',                                                     // 4
    '',                                                            // 5
    'RowGroupType  GROUP,TYPE',                                    // 6
    'line            STRING(8)',                                   // 7
    '              END',                                           // 8
    'RowQ          QUEUE(RowGroupType)',                           // 9
    '              END',                                           // 10
    '',                                                            // 11
    'CompareRows   PROCEDURE(*RowGroupType p1,*RowGroupType p2)',  // 12
    '  CODE',                                                      // 13
    '  RETURN 0',                                                  // 14
    '',                                                            // 15
    'SortRows      PROCEDURE',                                     // 16
    '  CODE',                                                      // 17
    '  SORT(RowQ,CompareRows)',                                    // 18
];
const SOURCE = LINES.join('\r\n');
const MAP_DECL_LINE = 3;
const IMPL_LINE = 12;
const CALL_SITE_LINE = 18;

/** Detector answer for the word starting at `column` on `line` of `source`. */
function detect(source: string, line: number, word: string) {
    const doc = TextDocument.create('file:///c:/testargref/Detect.clw', 'clarion', 1, source);
    const column = source.split(/\r?\n/)[line].indexOf(word);
    assert.ok(column >= 0, `fixture: "${word}" not on line ${line}`);
    const position = { line, character: column + 1 };
    const range = ProcedureCallDetector.getWordRangeAtPosition(doc, position);
    return ProcedureCallDetector.isProcedureCallOrReference(doc, position, range);
}

suite('a procedure name passed as an argument is a procedure reference', () => {
    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/testargref/Sorting.clw', 'clarion', 1, SOURCE);
    });

    suite('detection', () => {
        test('a name between a comma and the closing paren is a procedure reference', () => {
            const d = detect(SOURCE, CALL_SITE_LINE, 'CompareRows');
            assert.ok(d.isProcedure, 'SORT(RowQ,CompareRows) — CompareRows is a procedure reference');
            assert.ok(d.isArgumentReference, 'and it is flagged as the weak ARGUMENT shape');
        });

        test('the sole argument of a call is one too', () => {
            const src = ['MyProc PROCEDURE', '  CODE', '  Register(Callback)'].join('\r\n');
            assert.ok(detect(src, 2, 'Callback').isProcedure);
        });

        test('the old shapes keep their own flags', () => {
            const src = [
                'MyProc PROCEDURE',
                '  CODE',
                '  Direct()',
                '  START(Threaded)',
                '  Standalone',
            ].join('\r\n');
            const direct = detect(src, 2, 'Direct');
            assert.ok(direct.isProcedure && !direct.isArgumentReference, 'a `Name(` call is not an argument reference');
            const started = detect(src, 3, 'Threaded');
            assert.ok(started.isProcedure && started.isStartCall, 'START() still reports isStartCall');
            assert.ok(detect(src, 4, 'Standalone').isProcedure, 'a bare parameterless call still resolves');
        });

        test('a typed parameter in a declaration is NOT an argument reference', () => {
            // `LONG pValue` — the word is preceded by its type, not by '(' or ','.
            const src = ['Handler PROCEDURE(LONG pValue,LONG pFlag)', '  CODE'].join('\r\n');
            assert.ok(!detect(src, 0, 'pValue').isArgumentReference);
            assert.ok(!detect(src, 0, 'pFlag').isArgumentReference);
        });

        test('the member half of a dotted argument is NOT an argument reference', () => {
            const src = ['MyProc PROCEDURE', '  CODE', '  Register(Owner.Handler)'].join('\r\n');
            assert.ok(!detect(src, 2, 'Handler').isArgumentReference, 'preceded by a dot — member access, resolved elsewhere');
        });
    });

    test('hover on the argument links to the MAP declaration and the implementation', async () => {
        const character = LINES[CALL_SITE_LINE].indexOf('CompareRows') + 1;
        const hover = await new HoverProvider().provideHover(doc, { line: CALL_SITE_LINE, character });
        const links = hoverLocations(hover);
        const lines = links.map(l => l.line);
        assert.ok(lines.includes(MAP_DECL_LINE),
            `hover should link the MAP declaration (line ${MAP_DECL_LINE}); linked ${JSON.stringify(lines)}`);
        assert.ok(lines.includes(IMPL_LINE),
            `hover should link the implementation (line ${IMPL_LINE}); linked ${JSON.stringify(lines)}`);
    });

    test('F12 on the argument goes to the declaration', async () => {
        const character = LINES[CALL_SITE_LINE].indexOf('CompareRows') + 1;
        const def = await new DefinitionProvider().provideDefinition(doc, { line: CALL_SITE_LINE, character });
        const targets = definitionLocations(def).map(l => l.line);
        assert.ok(targets.includes(MAP_DECL_LINE),
            `F12 should land on the MAP declaration (line ${MAP_DECL_LINE}); got ${JSON.stringify(targets)}`);
    });
});
