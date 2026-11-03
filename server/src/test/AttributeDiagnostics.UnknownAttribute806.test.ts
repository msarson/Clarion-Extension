import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateAttributeApplicability } from '../providers/diagnostics/AttributeDiagnostics';

/**
 * #806: a word in attribute position that is not a Clarion attribute (a misspelling such as
 * IMPLUMENTS) was not reported: the applicability check judged known attributes only.
 *
 * Compiler-verified on Clarion 10: each of IMPLUMENTS on a CLASS, STATICK on a variable,
 * PREE on a GROUP and FLATTT on a BUTTON fails with "Unknown attribute: <WORD>".
 */

function unknownAttributes(lines: string[]): { line: number; message: string; text: string }[] {
    const text = lines.join('\n');
    const doc = TextDocument.create('file:///c%3A/t806/u.clw', 'clarion', 1, text);
    return validateAttributeApplicability(new ClarionTokenizer(text).tokenize(), doc)
        .filter(d => d.code === 'unknown-attribute')
        .map(d => ({
            line: d.range.start.line,
            message: String(d.message),
            text: lines[d.range.start.line].slice(d.range.start.character, d.range.end.character),
        }));
}

function program(data: string[], code: string[] = ['  RETURN']): string[] {
    return ['  PROGRAM', '  MAP', '  END', ...data, '  CODE', ...code];
}

suite('Unknown attribute: the review\'s findings (#806)', () => {
    test('nothing inside an OMIT or COMPILE block is judged: the compiler skips it', () => {
        assert.deepStrictEqual(unknownAttributes(program([
            "  OMIT('***')",
            'Note           STRING(20),BLAH',
            '***',
            "  COMPILE('!***', _C99_)",
            'Later          LONG,FROMLATERVERSION',
            '!***',
        ])), []);
    });

    test('a method definition is not a declaration: its return type is not read as an attribute', () => {
        const lines = ["  MEMBER('x')", '  MAP', '  END', 'MyClass.Fn     PROCEDURE(LONG x),LONG', '  CODE', '  RETURN 0'];
        assert.deepStrictEqual(unknownAttributes(lines), []);
    });
});

suite('Unknown attribute on a declaration (#806)', () => {
    test('a misspelt attribute on a CLASS is reported with the compiler\'s wording', () => {
        const lines = program([
            'IFace          INTERFACE',
            'Go               PROCEDURE',
            '               END',
            'Cls1           CLASS,TYPE',
            '               END',
            'Cls2           CLASS(Cls1),TYPE,IMPLUMENTS(IFace)',
            '               END',
        ]);
        assert.deepStrictEqual(unknownAttributes(lines), [
            { line: 8, message: 'Unknown attribute: IMPLUMENTS', text: 'IMPLUMENTS' },
        ]);
    });

    test('on a variable, a GROUP and a WINDOW control', () => {
        const lines = program([
            'Var1           LONG,STATICK',
            'Grp1           GROUP,PREE(G1)',
            'F1               LONG',
            '               END',
            "Win            WINDOW('T'),AT(,,100,100)",
            "                 BUTTON('Go'),AT(10,10),USE(?Go),FLATTT",
            '               END',
        ]);
        assert.deepStrictEqual(unknownAttributes(lines).map(d => d.text), ['STATICK', 'PREE', 'FLATTT']);
    });

    test('legitimate attribute-position text is not reported', () => {
        const lines = program([
            "Cls1           CLASS,TYPE,MODULE('x.clw'),LINK('x.clw',1),DLL(1),THREAD",
            'Name             STRING(20),PRIVATE',
            'Go               PROCEDURE(LONG pId),LONG,VIRTUAL,PROC',
            '               END',
            "Ext            LONG,EXTERNAL,DLL,NAME('Ext$X')",
            'Arr            LONG,DIM(5),STATIC,THREAD',
            'Ov             STRING(4),OVER(Arr)',
            'Q              QUEUE,PRE(Q)',
            'F                STRING(20),NAME(\'F\')',
            '               END',
            "Customers      FILE,DRIVER('TOPSPEED','/x=1'),PRE(CUS),CREATE,NAME('cus.tps'),OWNER('a'),ENCRYPT",
            'K                KEY(CUS:Id),NOCASE,OPT,PRIMARY',
            'Record           RECORD',
            'Id                 LONG',
            '                 END',
            '               END',
            "Win            WINDOW('T'),AT(,,100,100),SYSTEM,GRAY,FONT('Segoe UI',9)",
            "                 BUTTON('Go'),AT(10,10),USE(?Go),FLAT,ICON(ICON:Save), |",
            "                   TIP('Go'),KEY(EnterKey)",
            "                 ENTRY(@n9.2),AT(10,30),USE(Var1),RIGHT",
            '               END',
            'Var1           DECIMAL(9,2),AUTO',
            'Eq             EQUATE(1)',
            'Col            ITEMIZE(1),PRE(COL)',
            'A                EQUATE',
            '               END',
        ], [
            "  MESSAGE('a','b')",
            'Lbl1  LOOP',
            '  END',
        ]);
        // a MAP's prototypes carry a return type in the same list
        lines.splice(1, 2,'  MAP', "    MODULE('x')", "MyProc        PROCEDURE(LONG),LONG,NAME('MyProc'),PASCAL,RAW", 'Old           FUNCTION(*STRING),STRING,C', '    END', '  END');
        assert.deepStrictEqual(unknownAttributes(lines), []);
    });

    // #839: EXPORT on a CLASS compiles on Clarion 10 and 12, though the help documents no EXPORT
    // attribute; EXPORTX in the same place fails with "Unknown attribute: EXPORTX".
    test('EXPORT on a CLASS is an attribute; a misspelling of it is not (#839)', () => {
        const lines = program([
            'MyClass        CLASS,TYPE,EXPORT',
            'Value            LONG',
            'Init             PROCEDURE',
            '               END',
            'Other          CLASS,TYPE,EXPORTX',
            '               END',
        ]);
        assert.deepStrictEqual(unknownAttributes(lines).map(u => u.message), ['Unknown attribute: EXPORTX']);
    });

    test('attributes the catalogue lacks that compile on Clarion 10: COM, LEFT, RIGHT, DECIMAL, RTF', () => {
        const lines = program([
            'IFace          INTERFACE,COM',
            'Go               PROCEDURE',
            '               END',
            'Var1           DECIMAL(9,2)',
            'Txt            STRING(200)',
            "Win            WINDOW('T'),AT(,,200,200)",
            '                 ENTRY(@n9.2),AT(10,10),USE(Var1),RIGHT',
            '                 ENTRY(@n9.2),AT(10,30),USE(Var1,,?E2),LEFT',
            '                 ENTRY(@n9.2),AT(10,50),USE(Var1,,?E3),DECIMAL(12)',
            '                 TEXT,AT(10,70,100,50),USE(Txt),RTF(TEXT:Field)',
            "                 BUTTON('Cancel'),AT(45,42,50,15),USE(?Cancel),#ORIG(?Cancel)",
            '               END',
        ]);
        assert.deepStrictEqual(unknownAttributes(lines), []);
    });

    test('a labelled statement in code, or a routine\'s code, is not a declaration; a routine\'s DATA is', () => {
        const lines = program(['X              LONG'], [
            'Lbl1  LOOP',
            '  END',
            '  RETURN',
            'Rtn1  ROUTINE',
            "Lbl2  X = CHOOSE(X,1,2),FOO",
            'Rtn2  ROUTINE',
            '  DATA',
            'Loc            LONG,STATICK',
            '  CODE',
            "Lbl3  X = CHOOSE(X,1,2),FOO",
        ]);
        assert.deepStrictEqual(unknownAttributes(lines).map(d => d.text), ['STATICK']);
    });
});
