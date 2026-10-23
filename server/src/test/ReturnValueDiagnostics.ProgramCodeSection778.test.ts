import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic } from 'vscode-languageserver/node';
import { TokenCache } from '../TokenCache';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { validateDiscardedReturnValuesForPlainCalls } from '../providers/diagnostics/ReturnValueDiagnostics';

/**
 * #778 — the PROGRAM's own CODE section belongs to no procedure, and the discarded-return check
 * collected only the CODE sections of procedures and routines. Once the file implemented a
 * procedure, a call in the program's CODE was never checked; the method-call and cross-file
 * pass skipped it even with no procedures at all.
 */
const doc = (p: string, code: string[]) =>
    TextDocument.create('file:///' + p.replace(/\\/g, '/'), 'clarion', 1, code.join('\r\n') + '\r\n');

function names(diags: Diagnostic[]): string[] {
    return diags.map(x => String(x.message).match(/^Return value of '([\w.:]+)' is discarded/)?.[1])
        .filter((n): n is string => !!n).sort();
}

const CLASS = [
    'Counter     CLASS',
    'Next          PROCEDURE(),LONG',
    '            END',
];

suite('Discarded return in the PROGRAM\'s own CODE section (#778)', () => {
    setup(() => {
        TokenCache.getInstance().clearAllTokens();
        FileRelationshipGraph.getInstance().reset();
    });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    const WITH_PROCEDURES = [
        '  PROGRAM',
        '  MAP',
        'Later  PROCEDURE(LONG a, LONG b),LONG',
        'Main   PROCEDURE',
        '  END',
        ...CLASS,
        '  CODE',
        '  Later(1, 2)',                // 9
        '  Counter.Next()',             // 10
        '  Main',
        'Main  PROCEDURE',
        '  CODE',
        '  Later(1, 2)',                // 14
        'Later PROCEDURE(LONG a, LONG b)',
        '  CODE',
        '  RETURN a',
        'Counter.Next PROCEDURE()',
        '  CODE',
        '  RETURN 1',
    ];

    test('a plain call in the program\'s CODE warns when procedures follow', () => {
        const d = doc('c:\\app778\\prog.clw', WITH_PROCEDURES);
        const lines = validateDiscardedReturnValuesForPlainCalls(TokenCache.getInstance().getTokens(d), d)
            .filter(x => /'Later'/.test(String(x.message))).map(x => x.range.start.line);
        assert.deepStrictEqual(lines, [9, 14]);
    });

    test('a method call in the program\'s CODE warns when procedures follow', async () => {
        const d = doc('c:\\app778\\prog.clw', WITH_PROCEDURES);
        const diags = await DiagnosticProvider.validateDiscardedReturnValues(TokenCache.getInstance().getTokens(d), d, new MemberLocatorService());
        assert.deepStrictEqual(diags.filter(x => /'(Counter\.)?Next'/.test(String(x.message))).map(x => x.range.start.line), [10],
            JSON.stringify(diags.map(x => [x.range.start.line, x.message])));
    });

    test('a method call in the program\'s CODE warns with no procedures at all', async () => {
        const d = doc('c:\\app778\\prog.clw', ['  PROGRAM', '  MAP', '  END', ...CLASS, '  CODE', '  Counter.Next()']);
        const diags = await DiagnosticProvider.validateDiscardedReturnValues(TokenCache.getInstance().getTokens(d), d, new MemberLocatorService());
        assert.strictEqual(diags.filter(x => /discarded/.test(String(x.message))).length, 1, JSON.stringify(diags.map(x => x.message)));
    });

    // Found by the corpus check for #778: a method prototype continued with `|` was read from its
    // first line, so `Init PROCEDURE(REAL pBasis, |` ... `),DERIVED` "returned" REAL. That holds in
    // any CODE section; the program's own CODE only made it visible.
    test('a method prototype continued onto the next line returns what it says', async () => {
        const d = doc('c:\\app778\\member.clw', [
            '  MEMBER()',
            'Calc        CLASS',
            'Init          PROCEDURE(REAL pBasis, |',
            '                        STRING pState),DERIVED',
            'Sum           PROCEDURE(LONG a, |',
            '                        LONG b),LONG',
            '            END',
            'Main  PROCEDURE',
            '  CODE',
            '  Calc.Init(1, \'AR\')',     // 9: returns nothing
            '  Calc.Sum(1, 2)',           // 10: returns LONG
        ]);
        const diags = await DiagnosticProvider.validateDiscardedReturnValues(TokenCache.getInstance().getTokens(d), d, new MemberLocatorService());
        assert.deepStrictEqual(diags.filter(x => /discarded/.test(String(x.message))).map(x => x.range.start.line), [10],
            JSON.stringify(diags.map(x => [x.range.start.line, x.message])));
    });

    test('regression: a call that keeps the value, and declarations, stay silent', () => {
        const d = doc('c:\\app778\\prog.clw', ['  PROGRAM', '  MAP', 'Later  PROCEDURE(LONG a, LONG b),LONG', 'Main   PROCEDURE', '  END',
            'x  LONG', '  CODE', '  x = Later(1, 2)', '  Main', 'Main  PROCEDURE', '  CODE', 'Later PROCEDURE(LONG a, LONG b)', '  CODE', '  RETURN a']);
        assert.deepStrictEqual(names(validateDiscardedReturnValuesForPlainCalls(TokenCache.getInstance().getTokens(d), d)), []);
    });
});
