import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer, Token, TokenType } from '../ClarionTokenizer';
import { validateViewProjectFields } from '../providers/diagnostics/StructureDiagnostics';
import { DocumentStructure } from '../DocumentStructure';

/**
 * Issue #855 — a field labelled `Code` or `Data` was read as the procedure's CODE or
 * DATA execution marker, so it never became a child of its RECORD, GROUP or QUEUE.
 * `PROJECT(PRL:Code)` was then reported as "not a field on FILE", while hover (a
 * separate lookup) found the field.
 *
 * Compiler-verified on Clarion 10 and Clarion 12: `Code` and `Data` are legal labels
 * for a FILE record field, a GROUP field and a procedure-local variable, and a
 * PROJECT of `PRL:Code` inside a JOIN compiles. A column-0 CODE or DATA is the
 * marker only when nothing but a comment follows it on the line.
 */

const FILES = [
    "TagFile     FILE,DRIVER('TOPSPEED'),PRE(TF)",
    'PtrKey        KEY(TF:Ptr)',
    'Record        RECORD',
    'Ptr             LONG',
    '              END',
    '            END',
    '',
    "PriceList   FILE,DRIVER('TOPSPEED'),PRE(PRL)",
    'IDKey         KEY(PRL:ID)',
    'Record        RECORD',
    'ID              LONG',
    'Code            CSTRING(16)',
    'Data            LONG',
    'Name            STRING(20)',
    '              END',
    '            END',
    ''
];

function tokenize(lines: string[]): { tokens: Token[]; doc: TextDocument } {
    const doc = TextDocument.create('file:///c:/test855/view.clw', 'clarion', 1, lines.join('\r\n'));
    return { tokens: new ClarionTokenizer(doc.getText()).tokenize(), doc };
}

suite('Issue #855 — fields and variables labelled Code or Data', () => {

    test('PROJECT of a JOINed field labelled Code or Data is not flagged', () => {
        const { tokens, doc } = tokenize([
            ...FILES,
            'V           VIEW(TagFile)',
            '              PROJECT(TF:Ptr)',
            '              JOIN(PRL:IDKey,TF:Ptr)',
            '                PROJECT(PRL:Code)',
            '                PROJECT(PRL:Data)',
            '                PROJECT(PRL:Name)',
            '              END',
            '            END'
        ]);
        assert.deepStrictEqual(validateViewProjectFields(tokens, doc).map(d => d.message), []);
    });

    test('a misspelt field next to them is still flagged', () => {
        const { tokens, doc } = tokenize([
            ...FILES,
            'V           VIEW(PriceList)',
            '              PROJECT(PRL:Code)',
            '              PROJECT(PRL:Cod)',
            '            END'
        ]);
        assert.deepStrictEqual(validateViewProjectFields(tokens, doc).map(d => d.message),
            ["'PRL:Cod' is not a field on FILE 'PriceList'."]);
    });

    test('GROUP fields labelled Code and Data are children of the GROUP', () => {
        const { tokens } = tokenize([
            'G           GROUP,PRE(G)',
            'Code          LONG',
            'Data          LONG  ! a comment after the type',
            '            END'
        ]);
        const group = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'GROUP')!;
        const names = (group.children ?? []).map(c => c.value.toUpperCase());
        assert.ok(names.includes('CODE'), `children: ${names.join(',')}`);
        assert.ok(names.includes('DATA'), `children: ${names.join(',')}`);
    });

    test('a procedure-local variable labelled Code does not become the CODE marker', () => {
        const { tokens } = tokenize([
            '  MEMBER()',
            'LocalProc   PROCEDURE',
            'Code          LONG',
            'Data          LONG',
            '  CODE',
            '  Code = 1',
            '  RETURN'
        ]);
        const proc = tokens.find(t => t.value.toUpperCase() === 'PROCEDURE' && t.executionMarker !== undefined
            || (t.label?.toUpperCase() === 'LOCALPROC' && t.executionMarker !== undefined));
        assert.ok(proc, 'the procedure has an execution marker');
        assert.strictEqual(proc!.executionMarker!.line, 4, 'the marker is the real CODE line');
    });

    test('a global variable labelled Code is a global, not the first CODE marker', () => {
        const { tokens } = tokenize([
            '  PROGRAM',
            '  MAP',
            '  END',
            'Code          LONG',
            'Data          LONG',
            'Other         LONG',
            '  CODE',
            '  Code = 1'
        ]);
        const ds = new DocumentStructure(tokens);
        ds.process();
        assert.strictEqual(ds.getFirstCodeMarker()?.line, 6, 'the program CODE, not the Code LONG declaration');
        const globals = ds.getGlobalVariables().map(t => t.value.toUpperCase());
        assert.deepStrictEqual(globals, ['CODE', 'DATA', 'OTHER']);
    });

    test('a column-0 CODE and DATA with only a comment after them are still markers', () => {
        const { tokens } = tokenize([
            '  MEMBER()',
            'LocalProc   PROCEDURE',
            'X             LONG',
            'CODE  ! starts the code',
            '  X = 1',
            '  DO R1',
            'R1          ROUTINE',
            'DATA',
            'Y             LONG',
            'CODE',
            '  Y = 2'
        ]);
        const proc = tokens.find(t => t.label?.toUpperCase() === 'LOCALPROC' && t.executionMarker !== undefined);
        assert.ok(proc, 'the procedure has an execution marker');
        assert.strictEqual(proc!.executionMarker!.line, 3);
        const routine = tokens.find(t => t.subType === TokenType.Routine);
        assert.ok(routine, 'the routine is found');
        assert.strictEqual(routine!.executionMarker?.line, 9);
        assert.strictEqual(routine!.hasLocalData, true);
    });
});
