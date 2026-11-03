/**
 * Find All References on a class member that is also reached as `SELF.<field>.<member>`.
 *
 * Starting from `SELF.Hits` (or from the member's own declaration), the search carries no
 * receiver prefix: findMemberReferencesInFile drops a bare SELF/PARENT prefix. With no prefix,
 * every SELF-rooted chain ending in the member name was accepted without a type check, so
 * `SELF.Inner.Hits` listed as a reference of Token.Hits although Inner is an Engine.
 * The chain's receiver is now resolved through the enclosing class's data members, link by
 * link, and the hit is kept only when it lands on the target class family.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';

const LINES = [
    '  MEMBER()',                                  // 0
    'Token      CLASS,TYPE',                       // 1
    'Hits         LONG',                           // 2  the target
    'Bump         PROCEDURE()',                    // 3
    '           END',                              // 4
    'Engine     CLASS,TYPE',                       // 5
    'Hits         LONG',                           // 6  same name, other class
    '           END',                              // 7
    'Hub        CLASS,TYPE',                       // 8
    'Tok          &Token',                         // 9
    'Eng          &Engine',                        // 10
    '           END',                              // 11
    'Wrapper    CLASS,TYPE',                       // 12
    'Inner        &Engine',                        // 13
    'Tok          &Token',                         // 14
    'Center       &Hub',                           // 15
    'Work         PROCEDURE()',                    // 16
    '           END',                              // 17
    'Token.Bump PROCEDURE()',                      // 18
    '  CODE',                                      // 19
    '  SELF.Hits = 1',                             // 20 IN  (cursor)
    'Wrapper.Work PROCEDURE()',                    // 21
    '  CODE',                                      // 22
    '  SELF.Inner.Hits = 2',                       // 23 OUT (Engine)
    '  IF SELF.Inner.Hits = 3 THEN RETURN.',       // 24 OUT (Engine)
    '  SELF.Tok.Hits = 4',                         // 25 IN  (Token)
    '  IF SELF.Tok.Hits = 5 THEN RETURN.',         // 26 IN  (Token)
    '  SELF.Center.Eng.Hits = 6',                  // 27 OUT (Hub.Eng is an Engine)
    '  SELF.Center.Tok.Hits = 7',                  // 28 IN  (Hub.Tok is a Token)
];

const MUST_INCLUDE = [2, 20, 25, 26, 28];
const MUST_EXCLUDE = [6, 23, 24, 27];

suite('Find All References: SELF.<field>.<member> is type-checked by the field\'s class', () => {
    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/test-self-chain/refs.clw', 'clarion', 1, LINES.join('\r\n'));
    });

    async function refsAt(line: number): Promise<number[]> {
        const col = LINES[line].lastIndexOf('Hits');
        const r = await new ReferencesProvider().provideReferences(doc, { line, character: col + 1 }, { includeDeclaration: true });
        return [...new Set((r ?? []).map(l => l.range.start.line))].sort((a, b) => a - b);
    }

    function assertInOut(lines: number[], from: string): void {
        for (const l of MUST_INCLUDE) {
            assert.ok(lines.includes(l), `from ${from}: expected line ${l} (${LINES[l].trim()}) IN; got [${lines.join(',')}]`);
        }
        for (const l of MUST_EXCLUDE) {
            assert.ok(!lines.includes(l), `from ${from}: expected line ${l} (${LINES[l].trim()}) OUT; got [${lines.join(',')}]`);
        }
    }

    test('from SELF.Hits in the class\'s own method', async () => {
        assertInOut(await refsAt(20), 'SELF.Hits');
    });
    test('from the member\'s declaration in the CLASS body', async () => {
        assertInOut(await refsAt(2), 'the declaration');
    });
});

/**
 * Review of #838: a PARENT-rooted chain is checked the same way, and a receiver whose type does
 * not resolve is kept - Rename relies on Find All References, and must not miss a use.
 */
const PARENT_LINES = [
    '  MEMBER()',                                  // 0
    'Token      CLASS,TYPE',                       // 1
    'Hits         LONG',                           // 2  the target
    '           END',                              // 3
    'Engine     CLASS,TYPE',                       // 4
    'Hits         LONG',                           // 5
    '           END',                              // 6
    'Base       CLASS,TYPE',                       // 7
    'Inner        &Engine',                        // 8
    'Tok          &Token',                         // 9
    'Mystery      &NoSuchClass',                   // 10
    'Go           PROCEDURE(),VIRTUAL',            // 11
    '           END',                              // 12
    'Derived    CLASS(Base),TYPE',                 // 13
    'Go           PROCEDURE(),VIRTUAL',            // 14
    '           END',                              // 15
    'Base.Go    PROCEDURE()',                      // 16
    '  CODE',                                      // 17
    '  SELF.Mystery.Hits = 1',                     // 18 IN  (unresolved: kept)
    'Derived.Go PROCEDURE()',                      // 19
    '  CODE',                                      // 20
    '  PARENT.Inner.Hits = 2',                     // 21 OUT (Engine)
    '  PARENT.Tok.Hits = 3',                       // 22 IN  (Token)
];

suite('Find All References: PARENT chains and unresolved receivers (#838 review)', () => {
    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/test-self-chain/parent.clw', 'clarion', 1, PARENT_LINES.join('\r\n'));
    });

    test('from Token.Hits: PARENT.Tok.Hits and the unresolved SELF.Mystery.Hits are in, PARENT.Inner.Hits is out', async () => {
        const col = PARENT_LINES[2].indexOf('Hits');
        const r = await new ReferencesProvider().provideReferences(doc, { line: 2, character: col + 1 }, { includeDeclaration: true });
        const lines = [...new Set((r ?? []).map(l => l.range.start.line))].sort((a, b) => a - b);
        for (const l of [2, 18, 22]) assert.ok(lines.includes(l), `expected line ${l} IN; got [${lines.join(',')}]`);
        for (const l of [5, 21]) assert.ok(!lines.includes(l), `expected line ${l} OUT; got [${lines.join(',')}]`);
    });
});
