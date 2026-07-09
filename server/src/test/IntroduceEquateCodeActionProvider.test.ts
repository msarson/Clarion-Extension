import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range } from 'vscode-languageserver/node';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { IntroduceEquateCodeActionProvider, EquateScope } from '../providers/IntroduceEquateCodeActionProvider';

/**
 * #281 — Introduce EQUATE: detect the literal under the cursor and compute the candidate data
 * sections it could be declared in. The scope list is the load-bearing part — a routine with DATA,
 * the enclosing procedure, and the file-level section (module vs global per file type).
 */

function createDocument(content: string, uri: string): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function invoke(content: string, uri: string, line: number, character: number) {
    const doc = createDocument(content, uri);
    TokenCache.getInstance().getTokens(doc);
    const actions = new IntroduceEquateCodeActionProvider()
        .provideCodeActions(doc, Range.create(line, character, line, character));
    return actions;
}

/** Pull the command arguments the action carries to the client. */
function args(actions: ReturnType<IntroduceEquateCodeActionProvider['provideCodeActions']>) {
    assert.strictEqual(actions.length, 1, 'expected one Introduce EQUATE action');
    const a = actions[0].command!.arguments!;
    return {
        literal: a[1] as { line: number; startChar: number; endChar: number },
        value: a[2] as string,
        scopes: a[3] as EquateScope[]
    };
}

suite('#281 IntroduceEquateCodeActionProvider', () => {
    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });

    test('numeric literal in a PROGRAM procedure → offers procedure + global scopes', () => {
        const src = [
            '  PROGRAM',        // 0
            '  MAP',            // 1
            '  END',            // 2
            '  CODE',           // 3  (program CODE — global data goes before here)
            'MyProc PROCEDURE', // 4
            '  CODE',           // 5
            '  Count = 42'      // 6
        ].join('\n');
        const { value, scopes, literal } = args(invoke(src, 'file:///eq-prog.clw', 6, 11));
        assert.strictEqual(value, '42');
        assert.strictEqual(literal.line, 6);
        assert.deepStrictEqual(scopes.map(s => s.label), ['This procedure (local data)', 'Global']);
        // local data inserts before the procedure's CODE (line 5); global before the program CODE (line 3).
        assert.strictEqual(scopes[0].insertLine, 5);
        assert.strictEqual(scopes[1].insertLine, 3);
    });

    test('string literal in a MEMBER procedure → file scope labelled "This module"', () => {
        const src = [
            "  MEMBER('prog')", // 0
            'MyProc PROCEDURE', // 1
            '  CODE',           // 2
            "  Name = 'Main'"   // 3
        ].join('\n');
        const { value, scopes } = args(invoke(src, 'file:///eq-member.clw', 3, 11));
        assert.strictEqual(value, "'Main'");
        assert.deepStrictEqual(scopes.map(s => s.label), ['This procedure (local data)', 'This module']);
    });

    test('literal inside a routine WITH a DATA section → offers routine, procedure and module scopes', () => {
        const src = [
            "  MEMBER('prog')", // 0
            'MyProc PROCEDURE', // 1
            '  CODE',           // 2
            '  DO Setup',       // 3
            'Setup ROUTINE',    // 4
            '  DATA',           // 5
            'X   LONG',         // 6
            '  CODE',           // 7
            '  X = 42'          // 8
        ].join('\n');
        const { scopes } = args(invoke(src, 'file:///eq-routine.clw', 8, 7));
        assert.deepStrictEqual(scopes.map(s => s.label), [
            'This routine (routine data)',
            'This procedure (local data)',
            'This module'
        ]);
    });

    test('no action when the cursor is not on a literal', () => {
        const src = [
            "  MEMBER('prog')",
            'MyProc PROCEDURE',
            '  CODE',
            '  Count = 42'
        ].join('\n');
        // char 4 is inside the identifier "Count", not the literal.
        assert.strictEqual(invoke(src, 'file:///eq-noop.clw', 3, 4).length, 0);
    });
});
