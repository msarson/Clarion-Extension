import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range } from 'vscode-languageserver/node';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import {
    IntroduceEquateCodeActionProvider, EquateScope, extractMemberProgramName
} from '../providers/IntroduceEquateCodeActionProvider';

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

    test('Global lands after the MAP, not inside it, when the MAP has prototypes (real-file shape)', () => {
        const src = [
            '  PROGRAM',        // 0
            '  MAP',            // 1
            'Foo   PROCEDURE',  // 2  (prototype INSIDE the MAP — must not be the anchor)
            '  END',            // 3
            'GlobalX  LONG',    // 4  (global data)
            '  CODE',           // 5  (program CODE — global data ends here)
            '  Foo',            // 6
            'Foo PROCEDURE',    // 7  (implementation)
            '  CODE',           // 8
            '  Y = 10'          // 9
        ].join('\n');
        const { scopes } = args(invoke(src, 'file:///eq-map.clw', 9, 8));
        const global = scopes.find(s => s.label === 'Global')!;
        assert.ok(global, 'a Global scope is offered');
        assert.strictEqual(global.insertLine, 5, 'inserts before the program CODE (after the MAP), not inside the MAP');
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

    test('a bare / empty MEMBER offers no global scope (only module + local)', () => {
        for (const member of ['  MEMBER', '  MEMBER()', "  MEMBER('')"]) {
            const src = [member, 'MyProc PROCEDURE', '  CODE', '  Count = 42'].join('\n');
            const { scopes } = args(invoke(src, `file:///eq-empty-${member.trim()}.clw`, 3, 11));
            assert.deepStrictEqual(
                scopes.map(s => s.label),
                ['This procedure (local data)', 'This module'],
                `no Global for "${member.trim()}"`
            );
        }
    });

    test("a named MEMBER whose program file can't be resolved degrades to module + local", () => {
        const src = ["  MEMBER('NoSuchProgram')", 'MyProc PROCEDURE', '  CODE', '  Count = 42'].join('\n');
        const { scopes } = args(invoke(src, 'file:///eq-missing.clw', 3, 11));
        assert.deepStrictEqual(scopes.map(s => s.label), ['This procedure (local data)', 'This module']);
    });
});

suite('#281 extractMemberProgramName', () => {
    setup(() => { setServerInitialized(true); TokenCache.getInstance().clearAllTokens(); });

    function nameOf(memberLine: string): string | null {
        const doc = createDocument(`${memberLine}\nMyProc PROCEDURE\n  CODE`, 'file:///member-name.clw');
        return extractMemberProgramName(TokenCache.getInstance().getTokens(doc));
    }

    test("MEMBER('MyApp') → 'MyApp'", () => assert.strictEqual(nameOf("  MEMBER('MyApp')"), 'MyApp'));
    test('bare MEMBER → null', () => assert.strictEqual(nameOf('  MEMBER'), null));
    test('MEMBER() → null', () => assert.strictEqual(nameOf('  MEMBER()'), null));
    test("MEMBER('') → null", () => assert.strictEqual(nameOf("  MEMBER('')"), null));
});

suite('#281 cross-file Global from a MEMBER', () => {
    let tmpDir: string;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clarion-eq-'));
    });

    teardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    // Both the bare-name form MEMBER('MyApp') and the full-filename form MEMBER('MyApp.clw')
    // (AppGen-generated code emits the latter) must resolve to MyApp.clw — not MyApp.clw.clw.
    for (const memberArg of ['MyApp', 'MyApp.clw']) {
        test(`MEMBER('${memberArg}') offers a cross-file Global scope targeting the resolved PROGRAM file`, () => {
            // Program file sits next to the member (sibling-directory resolution, no solution needed).
            // Its MAP carries a prototype before CODE — the cross-file global must land after the MAP.
            fs.writeFileSync(
                path.join(tmpDir, 'MyApp.clw'),
                ['  PROGRAM', '  MAP', 'Foo   PROCEDURE', '  END', 'GlobalX  LONG', '  CODE'].join('\n')
            );
            const memberPath = path.join(tmpDir, 'sub.clw');
            const memberUri = 'file:///' + memberPath.replace(/\\/g, '/');

            const src = [`  MEMBER('${memberArg}')`, 'MyProc PROCEDURE', '  CODE', '  Count = 42'].join('\n');
            const { scopes } = args(invoke(src, memberUri, 3, 11));

            assert.deepStrictEqual(scopes.map(s => s.label), [
                'This procedure (local data)',
                'This module',
                'Global (in MyApp.clw)'
            ]);
            const global = scopes.find(s => s.label.startsWith('Global'))!;
            assert.ok(global.uri && global.uri.toLowerCase().includes('myapp.clw'), 'global scope targets MyApp.clw');
            assert.strictEqual(global.insertLine, 5, 'global data inserts before the PROGRAM CODE (after the MAP)');
        });
    }
});
