import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItemKind } from 'vscode-languageserver/node';
import { WordCompletionProvider } from '../providers/WordCompletionProvider';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';

let docCounter = 0;
function makeDoc(content: string): TextDocument {
    return TextDocument.create(`file:///test-wc-${++docCounter}.clw`, 'clarion', 1, content);
}

function makeProvider(document: TextDocument): WordCompletionProvider {
    const cache = TokenCache.getInstance();
    cache.getTokens(document); // prime the cache
    const scopeAnalyzer = new ScopeAnalyzer(cache, SolutionManager.getInstance());
    return new WordCompletionProvider(cache, scopeAnalyzer);
}

suite('WordCompletionProvider', () => {

    suite('Debug — token inspection', () => {
        test('inspect tokens for simple procedure with local var', async () => {
            const doc = makeDoc([
                'MyProc PROCEDURE(LONG pId)',
                'LocalVar  LONG',
                'CODE',
                '  LocalVar = 1',
                'END',
            ].join('\n'));
            const cache = TokenCache.getInstance();
            const tokens = cache.getTokens(doc);
            const tokenInfo = tokens.map(t => `L${t.line} type=${t.type} sub=${t.subType ?? '-'} val="${t.value}" label="${t.label ?? '-'}" start=${t.start} isField=${t.isStructureField ?? false} finishesAt=${t.finishesAt ?? '-'} execMarker=${t.executionMarker?.line ?? '-'}`);
            console.log('\n--- Token dump ---');
            for (const ti of tokenInfo) console.log(ti);
            // Dump scope for cursor at line 3
            const { ScopeAnalyzer: SA } = require('../utils/ScopeAnalyzer');
            const { SolutionManager: SM } = require('../solution/solutionManager');
            const sa = new SA(cache, SM.getInstance());
            const scope = sa.getTokenScope(doc, { line: 3, character: 2 });
            console.log(`Scope: type=${scope?.type}, containingProc.line=${scope?.containingProcedure?.line ?? 'none'}, containingRoutine=${scope?.containingRoutine?.line ?? 'none'}`);
            console.log('------------------\n');
            assert.ok(tokens.length > 0, 'Expected tokens');
        });
    });

    suite('Global MAP procedures', () => {
        test('surfaces GlobalProcedure labels', async () => {
            const doc = makeDoc([
                'MyProg PROGRAM',
                '',
                'MyGlobalProc PROCEDURE()',
                'CODE',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = await p.provide(doc, { line: 3, character: 4 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('MyGlobalProc'), `Expected MyGlobalProc in: ${labels.join(', ')}`);
        });

        test('surfaces MAP procedures at module level', async () => {
            const doc = makeDoc([
                'MyProg PROGRAM',
                '',
                '  MAP',
                '    MODULE(\'helpers.clw\')',
                '      HelperProc PROCEDURE()',
                '    END',
                '  END',
                '',
                'MyGlobalProc PROCEDURE()',
                'CODE',
                '  HelperProc()',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = await p.provide(doc, { line: 10, character: 2 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('HelperProc'), `Expected HelperProc in: ${labels.join(', ')}`);
        });

        test('prefix filter reduces candidates', async () => {
            const doc = makeDoc([
                'MyProg PROGRAM',
                '',
                '  MAP',
                '    MODULE(\'helpers.clw\')',
                '      HelperProc  PROCEDURE()',
                '      OtherProc   PROCEDURE()',
                '    END',
                '  END',
                '',
                'MyGlobalProc PROCEDURE()',
                'CODE',
                '',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = await p.provide(doc, { line: 11, character: 0 }, 'Help');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('HelperProc'), 'Expected HelperProc');
            assert.ok(!labels.includes('OtherProc'), 'Did not expect OtherProc with prefix Help');
        });
    });

    suite('Local MAP procedures (procedure-scoped)', () => {
        test('surfaces local MAP procedures inside owning procedure', async () => {
            const doc = makeDoc([
                'MyProg PROGRAM',
                '',
                'OuterProc PROCEDURE()',
                '  MAP',
                '    MODULE(\'local.clw\')',
                '      LocalProc PROCEDURE()',
                '    END',
                '  END',
                'CODE',
                '  LocalProc()',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            // Cursor in OuterProc CODE section
            const items = await p.provide(doc, { line: 9, character: 2 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('LocalProc'), `Expected LocalProc in: ${labels.join(', ')}`);
        });

        test('does NOT surface local MAP procedures outside owning procedure', async () => {
            const doc = makeDoc([
                'MyProg PROGRAM',
                '',
                'OuterProc PROCEDURE()',
                '  MAP',
                '    MODULE(\'local.clw\')',
                '      LocalProc PROCEDURE()',
                '    END',
                '  END',
                'CODE',
                'END',
                '',
                'AnotherProc PROCEDURE()',
                'CODE',
                '  ! LocalProc should NOT be visible here',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            // Cursor inside AnotherProc
            const items = await p.provide(doc, { line: 13, character: 2 }, '');
            const labels = items.map(i => i.label);
            assert.ok(!labels.includes('LocalProc'), `LocalProc should NOT appear outside its owning procedure. Got: ${labels.join(', ')}`);
        });
    });

    suite('Local variables', () => {
        test('surfaces local Label tokens in procedure data section', async () => {
            const doc = makeDoc([
                'MyProc PROCEDURE()',
                'LocalVar  LONG',
                'CODE',
                '  LocalVar = 1',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = await p.provide(doc, { line: 3, character: 2 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('LocalVar'), `Expected LocalVar in: ${labels.join(', ')}`);
        });

        test('does NOT include structure fields as standalone variables', async () => {
            const doc = makeDoc([
                'MyProc PROCEDURE()',
                'MyQueue QUEUE',
                'Field1  LONG',
                'END',
                'CODE',
                '  MyQueue.Field1 = 1',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = await p.provide(doc, { line: 5, character: 2 }, '');
            const labels = items.map(i => i.label);
            // Field1 is a structure field — should not appear as a standalone variable
            assert.ok(!labels.includes('Field1'), `Structure field Field1 should not appear as a variable. Got: ${labels.join(', ')}`);
            // MyQueue itself should appear
            assert.ok(labels.includes('MyQueue'), `Expected MyQueue in: ${labels.join(', ')}`);
        });

        test('does NOT include procedure name as a variable', async () => {
            const doc = makeDoc([
                'MyProc PROCEDURE()',
                'CODE',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = await p.provide(doc, { line: 1, character: 0 }, '');
            const varItems = items.filter(i => i.label === 'MyProc' && i.kind === CompletionItemKind.Variable);
            assert.strictEqual(varItems.length, 0, 'MyProc should not appear as a Variable completion item');
        });
    });

    suite('Parameters', () => {
        test('surfaces simple parameters', async () => {
            const doc = makeDoc([
                'MyProc PROCEDURE(LONG pId, STRING pName)',
                'CODE',
                '  pId += 1',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = await p.provide(doc, { line: 2, character: 2 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('pId'), `Expected pId in: ${labels.join(', ')}`);
            assert.ok(labels.includes('pName'), `Expected pName in: ${labels.join(', ')}`);
        });

        test('surfaces optional parameters (angle-bracket notation)', async () => {
            const doc = makeDoc([
                'MyProc PROCEDURE(LONG pId, <STRING pOpt>)',
                'CODE',
                '  pId += 1',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = await p.provide(doc, { line: 2, character: 2 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('pOpt'), `Expected pOpt in: ${labels.join(', ')}`);
        });

        test('surfaces colon-prefixed parameters', async () => {
            const doc = makeDoc([
                'MyProc PROCEDURE(LONG LOC:TestId)',
                'CODE',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = await p.provide(doc, { line: 1, character: 0 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('LOC:TestId'), `Expected LOC:TestId in: ${labels.join(', ')}`);
        });
    });

    suite('Routine scope', () => {
        test('routine sees parent procedure local variables', async () => {
            const doc = makeDoc([
                'MyProc PROCEDURE()',
                'ParentVar  LONG',
                'CODE',
                'MyRoutine ROUTINE',
                '  ParentVar = 42',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            // Cursor inside the routine
            const items = await p.provide(doc, { line: 4, character: 2 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('ParentVar'), `Expected ParentVar visible in routine. Got: ${labels.join(', ')}`);
        });

        test('routine sees parent procedure PRE-qualified fields with qualifier completion', async () => {
            const doc = makeDoc([
                'MyProc PROCEDURE()',
                'TestGloGroup GROUP,PRE(TGLO)',
                'Var1 LONG',
                'Var2 STRING(20)',
                'END',
                'CODE',
                'MyRoutine ROUTINE',
                '  CODE',
                '  TGLO:',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = await p.provide(doc, { line: 8, character: 7 }, 'TGLO:');
            const labels = items.map(i => i.label);

            assert.ok(labels.includes('TGLO:Var1'), `Expected TGLO:Var1 in: ${labels.join(', ')}`);
            assert.ok(labels.includes('TGLO:Var2'), `Expected TGLO:Var2 in: ${labels.join(', ')}`);
        });
    });

    suite('Constants / equates', () => {
        test('surfaces file-level constants', async () => {
            const doc = makeDoc([
                'MyProg PROGRAM',
                'MyConst EQUATE(42)',
                '',
                'MyProc PROCEDURE()',
                'CODE',
                '  x = MyConst',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = await p.provide(doc, { line: 5, character: 4 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('MyConst'), `Expected MyConst in: ${labels.join(', ')}`);
        });

        test('user EQUATE label appears as Constant kind with value in detail', async () => {
            const doc = makeDoc([
                'MyProg PROGRAM',
                'MAX_ROWS EQUATE(100)',
                '',
                'MyProc PROCEDURE()',
                'CODE',
                '  x = MAX_ROWS',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = await p.provide(doc, { line: 5, character: 4 }, '');
            const item = items.find(i => i.label === 'MAX_ROWS');
            assert.ok(item, `Expected MAX_ROWS in completions. Got: ${items.map(i => i.label).join(', ')}`);
            assert.strictEqual(item!.kind, CompletionItemKind.Constant, `Expected Constant kind, got ${item!.kind}`);
            assert.strictEqual(item!.detail, 'EQUATE(100)', `Expected detail 'EQUATE(100)', got '${item!.detail}'`);
        });

        test('procedure-local EQUATE label appears as Constant kind', async () => {
            const doc = makeDoc([
                'MyProc PROCEDURE()',
                'LOC_MAX EQUATE(50)',
                'CODE',
                '  x = LOC_MAX',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = await p.provide(doc, { line: 3, character: 4 }, '');
            const item = items.find(i => i.label === 'LOC_MAX');
            assert.ok(item, `Expected LOC_MAX in completions. Got: ${items.map(i => i.label).join(', ')}`);
            assert.strictEqual(item!.kind, CompletionItemKind.Constant, `Expected Constant kind, got ${item!.kind}`);
            assert.strictEqual(item!.detail, 'EQUATE(50)', `Expected detail 'EQUATE(50)', got '${item!.detail}'`);
        });
    });

    suite('Cross-file global data (PROGRAM -> MEMBER)', () => {
        test('surfaces PROGRAM globals with prefix names in MEMBER file', async () => {
            const programUri = 'file:///C:/temp/testingdirectsecureserver.clw';
            const memberUri = 'file:///C:/temp/testingdirectsecureserver001.clw';

            const programDoc = TextDocument.create(programUri, 'clarion', 1, [
                'TestingDirectSecureServer PROGRAM',
                'GLO:SessionId   STRING(20)',
                'SrvData         GROUP,PRE(TGLO)',
                'PageReceived    LONG',
                'SocketCount     LONG',
                '               END',
                '',
                'Main PROCEDURE()',
                'CODE',
                'END',
            ].join('\n'));

            const memberDoc = TextDocument.create(memberUri, 'clarion', 1, [
                '  MEMBER(\'C:\\temp\\testingdirectsecureserver.clw\')',
                '',
                'Worker PROCEDURE()',
                'CODE',
                '  GLO:',
                '  TGLO:',
                'END',
            ].join('\n'));

            const cache = TokenCache.getInstance();
            cache.getTokens(programDoc);
            cache.getTokens(memberDoc);

            const scopeAnalyzer = new ScopeAnalyzer(cache, SolutionManager.getInstance());
            const provider = new WordCompletionProvider(cache, scopeAnalyzer);

            const gloItems = await provider.provide(memberDoc, { line: 4, character: 6 }, 'GLO:');
            const tgloItems = await provider.provide(memberDoc, { line: 5, character: 7 }, 'TGLO:');
            const gloLabels = gloItems.map(i => i.label);
            const tgloLabels = tgloItems.map(i => i.label);
            const gloItem = gloItems.find(i => i.label === 'GLO:SessionId');
            const tgloItem = tgloItems.find(i => i.label === 'TGLO:PageReceived');

            assert.ok(gloLabels.includes('GLO:SessionId'), `Expected GLO:SessionId in: ${gloLabels.join(', ')}`);
            assert.ok(tgloLabels.includes('TGLO:PageReceived'), `Expected TGLO:PageReceived in: ${tgloLabels.join(', ')}`);
            assert.ok(tgloLabels.includes('TGLO:SocketCount'), `Expected TGLO:SocketCount in: ${tgloLabels.join(', ')}`);
            assert.strictEqual(gloItem?.insertText, 'SessionId', `Expected suffix insertText for GLO:, got: ${gloItem?.insertText}`);
            assert.strictEqual(tgloItem?.insertText, 'PageReceived', `Expected suffix insertText for TGLO:, got: ${tgloItem?.insertText}`);
        });
    });

    suite('Qualifier completion respects typed qualifier', () => {
        test('procedure-local PRE-qualified fields appear for exact qualifier', async () => {
            const doc = makeDoc([
                'MyProc PROCEDURE()',
                'TestGloGroup GROUP,PRE(TGLO)',
                'Var1 LONG',
                'Var2 STRING(20)',
                'END',
                'CODE',
                '  TGLO:',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);

            const items = await p.provide(doc, { line: 6, character: 7 }, 'TGLO:');
            const labels = items.map(i => i.label);
            const tgloVar1 = items.find(i => i.label === 'TGLO:Var1');
            const tgloVar2 = items.find(i => i.label === 'TGLO:Var2');

            assert.ok(labels.includes('TGLO:Var1'), `Expected TGLO:Var1 in: ${labels.join(', ')}`);
            assert.ok(labels.includes('TGLO:Var2'), `Expected TGLO:Var2 in: ${labels.join(', ')}`);
            assert.strictEqual(tgloVar1?.insertText, 'Var1', `Expected Var1 suffix insertText, got: ${tgloVar1?.insertText}`);
            assert.strictEqual(tgloVar2?.insertText, 'Var2', `Expected Var2 suffix insertText, got: ${tgloVar2?.insertText}`);
        });

        test('TGLO: still resolves from token-range fallback when scope analyzer has no containing procedure', async () => {
            const doc = makeDoc([
                'ThisWindow.Init PROCEDURE()',
                'TestGloGroup GROUP,PRE(TGLO)',
                'Var1 LONG',
                'END',
                'CODE',
                '  TGLO:',
                'END',
            ].join('\n'));
            const p = makeProvider(doc) as unknown as { provide: WordCompletionProvider['provide']; scopeAnalyzer: { getTokenScope: () => undefined } };
            p.scopeAnalyzer.getTokenScope = () => undefined;

            const items = await p.provide(doc, { line: 5, character: 7 }, 'TGLO:');
            const labels = items.map(i => i.label);

            assert.ok(labels.includes('TGLO:Var1'), `Expected TGLO:Var1 in: ${labels.join(', ')}`);
        });

        test('TGLO: only returns TGLO-prefixed members', async () => {
            const doc = makeDoc([
                'MyProg PROGRAM',
                'GLO:SessionId   STRING(20)',
                'TestGloGroup GROUP,PRE(TGLO)',
                'Var1 LONG',
                'Var2 STRING(20)',
                'GLO:TGLO LONG',
                'END',
                '',
                'Worker PROCEDURE()',
                'LocalVar LONG',
                'CODE',
                '  TGLO:',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);

            const items = await p.provide(doc, { line: 11, character: 7 }, 'TGLO:');
            const labels = items.map(i => i.label);
            const tgloVar1 = items.find(i => i.label === 'TGLO:Var1');
            const tgloVar2 = items.find(i => i.label === 'TGLO:Var2');
            const tgloNested = items.find(i => i.label === 'TGLO:GLO:TGLO');

            assert.ok(labels.includes('TGLO:Var1'), `Expected TGLO:Var1 in: ${labels.join(', ')}`);
            assert.ok(labels.includes('TGLO:Var2'), `Expected TGLO:Var2 in: ${labels.join(', ')}`);
            assert.ok(labels.includes('TGLO:GLO:TGLO'), `Expected TGLO:GLO:TGLO in: ${labels.join(', ')}`);
            assert.ok(!labels.includes('TGLO:TGLO'), `Did not expect duplicate split form TGLO:TGLO. Got: ${labels.join(', ')}`);
            assert.ok(!labels.includes('GLO:SessionId'), `Did not expect GLO:SessionId for TGLO qualifier. Got: ${labels.join(', ')}`);
            assert.ok(!labels.includes('LocalVar'), `Did not expect LocalVar for TGLO qualifier. Got: ${labels.join(', ')}`);
            assert.strictEqual(tgloVar1?.insertText, 'Var1', `Expected Var1 suffix insertText, got: ${tgloVar1?.insertText}`);
            assert.strictEqual(tgloVar2?.insertText, 'Var2', `Expected Var2 suffix insertText, got: ${tgloVar2?.insertText}`);
            assert.strictEqual(tgloNested?.insertText, 'GLO:TGLO', `Expected nested suffix insertText, got: ${tgloNested?.insertText}`);
        });

        test('typed unknown qualifier returns no items', async () => {
            const doc = makeDoc([
                'MyProg PROGRAM',
                'GLO:SessionId   STRING(20)',
                '',
                'Worker PROCEDURE()',
                'LocalVar LONG',
                'CODE',
                '  ANY:',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);

            const items = await p.provide(doc, { line: 6, character: 6 }, 'ANY:');
            assert.strictEqual(items.length, 0, `Expected no completions for unknown qualifier. Got: ${items.map(i => i.label).join(', ')}`);
        });

        test('method and routine see procedure-scope PRE-qualified fields', async () => {
            const doc = makeDoc([
                'ThisWindow.Init PROCEDURE',
                'TestGloGroup GROUP,PRE(TGLO)',
                'Var1 LONG',
                'GLO:TGLO LONG',
                'END',
                '',
                'CODE',
                '  TGLO:',
                '  DoStuff',
                'END',
                '',
                'DoStuff ROUTINE',
                '  TGLO:',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);

            const methodItems = await p.provide(doc, { line: 7, character: 7 }, 'TGLO:');
            const routineItems = await p.provide(doc, { line: 12, character: 7 }, 'TGLO:');
            const methodLabels = methodItems.map(i => i.label);
            const routineLabels = routineItems.map(i => i.label);

            assert.ok(methodLabels.includes('TGLO:Var1'), `Expected TGLO:Var1 in method scope: ${methodLabels.join(', ')}`);
            assert.ok(methodLabels.includes('TGLO:GLO:TGLO'), `Expected TGLO:GLO:TGLO in method scope: ${methodLabels.join(', ')}`);
            assert.ok(routineLabels.includes('TGLO:Var1'), `Expected TGLO:Var1 in routine scope: ${routineLabels.join(', ')}`);
            assert.ok(routineLabels.includes('TGLO:GLO:TGLO'), `Expected TGLO:GLO:TGLO in routine scope: ${routineLabels.join(', ')}`);
        });
    });

    suite('No completions in comments or strings', () => {
        test('returns results regardless — comment guard is in CompletionProvider', async () => {
            // WordCompletionProvider itself has no comment guard (CompletionProvider handles it)
            // Just verify it does not throw on edge cases
            const doc = makeDoc('! nothing here\n');
            const p = makeProvider(doc);
            await assert.doesNotReject(async () => { await p.provide(doc, { line: 0, character: 5 }, 'n'); });
        });
    });
});
