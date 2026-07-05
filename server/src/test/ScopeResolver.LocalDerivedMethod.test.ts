import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import { ScopeResolver } from '../scope/ScopeResolver';
import { ScopeKind } from '../scope/ScopeTypes';

function createTestDocument(content: string, uri: string = 'file:///test.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function build(content: string): { tokens: Token[]; resolver: ScopeResolver } {
    const cache = TokenCache.getInstance();
    cache.clearAllTokens();
    const doc = createTestDocument(content);
    const tokens = cache.getTokens(doc);
    return { tokens, resolver: new ScopeResolver(tokens) };
}

function methodImpl(tokens: Token[], label: string, occurrence = 0): Token {
    const matches = tokens.filter(t =>
        t.subType === TokenType.MethodImplementation && t.label?.toUpperCase() === label.toUpperCase());
    assert.ok(matches[occurrence], `method impl '${label}' (occurrence ${occurrence}) not found`);
    return matches[occurrence];
}

// A single procedure declaring a local derived class, its routine, then the method impl.
// 0 PROGRAM
// 1 MAP
// 2 END
// 4 MyProc PROCEDURE
// 5 LocalX LONG
// 6 MyClass CLASS
// 7 Run PROCEDURE
// 8 END
// 9 CODE
// 10 LocalX = 1
// 11 DO MyRtn
// 13 MyRtn ROUTINE
// 14 CODE
// 15 LocalX = 2
// 17 MyClass.Run PROCEDURE
// 18 CODE
// 19 LocalX = 3
const LOCAL_DERIVED = `PROGRAM
  MAP
  END

MyProc PROCEDURE
LocalX LONG
MyClass CLASS
Run PROCEDURE
  END
  CODE
  LocalX = 1
  DO MyRtn

MyRtn ROUTINE
  CODE
  LocalX = 2

MyClass.Run PROCEDURE
  CODE
  LocalX = 3
`;

// Two adjacent procedures each declaring a same-named local class + method impl.
// 4  ProcA PROCEDURE
// 5  SharedName CLASS
// 6  Run PROCEDURE
// 7  END
// 8  AVar LONG
// 9  CODE
// 10 AVar = 1
// 12 SharedName.Run PROCEDURE
// 13 CODE
// 14 AVar = 2
// 16 ProcB PROCEDURE
// 17 SharedName CLASS
// 18 Run PROCEDURE
// 19 END
// 20 BVar LONG
// 21 CODE
// 22 BVar = 1
// 24 SharedName.Run PROCEDURE
// 25 CODE
// 26 BVar = 2
const TWO_SAME_NAME = `PROGRAM
  MAP
  END

ProcA PROCEDURE
SharedName CLASS
Run PROCEDURE
  END
AVar LONG
  CODE
  AVar = 1

SharedName.Run PROCEDURE
  CODE
  AVar = 2

ProcB PROCEDURE
SharedName CLASS
Run PROCEDURE
  END
BVar LONG
  CODE
  BVar = 1

SharedName.Run PROCEDURE
  CODE
  BVar = 2
`;

suite('ScopeResolver — Local Derived Methods (Rule 4)', () => {
    test('a local derived method links to its declaring procedure', () => {
        const { tokens, resolver } = build(LOCAL_DERIVED);
        const method = methodImpl(tokens, 'MyClass.Run');
        const declaring = resolver.findDeclaringProcedureForMethod(method);
        assert.ok(declaring, 'should resolve a declaring procedure');
        assert.strictEqual(declaring!.label?.toUpperCase(), 'MYPROC');
    });

    test('inside the method body, the declaring procedure is in the visible chain (its local data is visible)', () => {
        const { resolver } = build(LOCAL_DERIVED);
        const chain = resolver.getVisibleScopeChain(19); // LocalX = 3, inside MyClass.Run
        const kinds = chain.map(n => n.kind);
        assert.strictEqual(kinds[0], ScopeKind.Method, 'innermost is the method');
        // The declaring procedure (MyProc) must appear so its local data is reachable.
        const declaringNode = chain.find(n => n.kind === ScopeKind.Procedure && n.token?.label?.toUpperCase() === 'MYPROC');
        assert.ok(declaringNode, 'declaring procedure MyProc should be in the visible chain');
        assert.strictEqual(kinds[kinds.length - 1], ScopeKind.Global, 'ends at global');
    });

    test('anti-broadening: with two same-named local classes, method B resolves ONLY to procedure B', () => {
        const { tokens, resolver } = build(TWO_SAME_NAME);
        const methodB = methodImpl(tokens, 'SharedName.Run', 1); // the second impl (in ProcB region)
        const declaring = resolver.findDeclaringProcedureForMethod(methodB);
        assert.ok(declaring, 'should resolve a declaring procedure');
        assert.strictEqual(declaring!.label?.toUpperCase(), 'PROCB',
            'method B must bind to ProcB, not the earlier same-named ProcA class');
    });

    test('anti-broadening: method A resolves ONLY to procedure A', () => {
        const { tokens, resolver } = build(TWO_SAME_NAME);
        const methodA = methodImpl(tokens, 'SharedName.Run', 0);
        const declaring = resolver.findDeclaringProcedureForMethod(methodA);
        assert.strictEqual(declaring!.label?.toUpperCase(), 'PROCA');
    });
});
