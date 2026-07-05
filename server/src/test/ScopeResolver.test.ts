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

function procByLabel(tokens: Token[], label: string): Token {
    const t = tokens.find(t =>
        (t.subType === TokenType.GlobalProcedure || t.subType === TokenType.MethodImplementation) &&
        t.label?.toUpperCase() === label.toUpperCase());
    assert.ok(t, `procedure/method '${label}' not found`);
    return t!;
}

// A PROGRAM with a global GROUP(PRE), a global var, one procedure containing local data,
// a routine (with its own DATA), and code both before and inside the routine.
const PROC_WITH_ROUTINE = `PROGRAM
  MAP
  END

TGLO GROUP,PRE(TGLO)
Name STRING(20)
  END

GlobalVar LONG

  CODE

MyProc PROCEDURE
LocalA LONG
  CODE
  LocalA = 1
  DO MyRoutine

MyRoutine ROUTINE
  DATA
RtnVar LONG
  CODE
  RtnVar = 2
`;
// line map (0-based):
// 12 MyProc PROCEDURE
// 13 LocalA LONG
// 14 CODE
// 15 LocalA = 1
// 16 DO MyRoutine
// 18 MyRoutine ROUTINE
// 20 RtnVar LONG
// 22 RtnVar = 2

suite('ScopeResolver', () => {
    suite('Rule 1 — executable extent (codeFinishesAt)', () => {
        test('1a: a procedure with a ROUTINE has codeFinishesAt < finishesAt (extent stops before the routine)', () => {
            const { tokens } = build(PROC_WITH_ROUTINE);
            const proc = procByLabel(tokens, 'MyProc');
            assert.ok(proc.finishesAt !== undefined, 'finishesAt should be set');
            assert.ok(proc.codeFinishesAt !== undefined, 'codeFinishesAt should be set');
            assert.ok(proc.codeFinishesAt! < proc.finishesAt!,
                `codeFinishesAt(${proc.codeFinishesAt}) should be < finishesAt(${proc.finishesAt})`);
            // Routine begins at line 18 → executable extent ends at 17.
            assert.strictEqual(proc.codeFinishesAt, 17);
        });

        test('1b: a procedure with no ROUTINE has codeFinishesAt === finishesAt', () => {
            const { tokens } = build(`MyProc PROCEDURE
LocalVar LONG
  CODE
  LocalVar = 5
`);
            const proc = procByLabel(tokens, 'MyProc');
            assert.strictEqual(proc.codeFinishesAt, proc.finishesAt);
        });

        test('1c: the routine itself has codeFinishesAt === finishesAt', () => {
            const { tokens } = build(PROC_WITH_ROUTINE);
            const routine = tokens.find(t => t.subType === TokenType.Routine && t.label?.toUpperCase() === 'MYROUTINE');
            assert.ok(routine, 'routine not found');
            assert.strictEqual(routine!.codeFinishesAt, routine!.finishesAt);
        });
    });

    suite('resolveScopeAt — Rule 1 aware innermost scope', () => {
        test('data-section line resolves to the Procedure', () => {
            const { resolver } = build(PROC_WITH_ROUTINE);
            assert.strictEqual(resolver.resolveScopeAt(13).kind, ScopeKind.Procedure);
        });

        test('executable line before the first ROUTINE resolves to the Procedure', () => {
            const { resolver } = build(PROC_WITH_ROUTINE);
            assert.strictEqual(resolver.resolveScopeAt(16).kind, ScopeKind.Procedure);
        });

        test('a line inside the ROUTINE resolves to the Routine (NOT the procedure tail)', () => {
            const { resolver } = build(PROC_WITH_ROUTINE);
            const node = resolver.resolveScopeAt(22);
            assert.strictEqual(node.kind, ScopeKind.Routine, 'should be routine scope');
            assert.strictEqual(node.parent?.kind, ScopeKind.Procedure, 'routine parent should be the procedure');
        });
    });

    suite('getVisibleScopeChain — Rule 5 tier ordering', () => {
        test('from a routine body: Routine → Procedure → Global', () => {
            const { resolver } = build(PROC_WITH_ROUTINE);
            const kinds = resolver.getVisibleScopeChain(22).map(n => n.kind);
            assert.deepStrictEqual(kinds, [ScopeKind.Routine, ScopeKind.Procedure, ScopeKind.Global]);
        });

        test('from procedure CODE: Procedure → Global', () => {
            const { resolver } = build(PROC_WITH_ROUTINE);
            const kinds = resolver.getVisibleScopeChain(15).map(n => n.kind);
            assert.deepStrictEqual(kinds, [ScopeKind.Procedure, ScopeKind.Global]);
        });

        test('MEMBER file yields a Module tier instead of Global', () => {
            const { resolver } = build(`MEMBER('Main')

ModuleVar LONG

MyProc PROCEDURE
LocalV LONG
  CODE
  LocalV = 1
`);
            const kinds = resolver.getVisibleScopeChain(7).map(n => n.kind);
            assert.deepStrictEqual(kinds, [ScopeKind.Procedure, ScopeKind.Module]);
        });
    });
});
