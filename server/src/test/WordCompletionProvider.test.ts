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
        test('inspect tokens for simple procedure with local var', () => {
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
        test('surfaces GlobalProcedure labels', () => {
            const doc = makeDoc([
                'MyProg PROGRAM',
                '',
                'MyGlobalProc PROCEDURE()',
                'CODE',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = p.provide(doc, { line: 3, character: 4 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('MyGlobalProc'), `Expected MyGlobalProc in: ${labels.join(', ')}`);
        });

        test('surfaces MAP procedures at module level', () => {
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
            const items = p.provide(doc, { line: 10, character: 2 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('HelperProc'), `Expected HelperProc in: ${labels.join(', ')}`);
        });

        test('prefix filter reduces candidates', () => {
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
            const items = p.provide(doc, { line: 11, character: 0 }, 'Help');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('HelperProc'), 'Expected HelperProc');
            assert.ok(!labels.includes('OtherProc'), 'Did not expect OtherProc with prefix Help');
        });
    });

    suite('Local MAP procedures (procedure-scoped)', () => {
        test('surfaces local MAP procedures inside owning procedure', () => {
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
            const items = p.provide(doc, { line: 9, character: 2 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('LocalProc'), `Expected LocalProc in: ${labels.join(', ')}`);
        });

        test('does NOT surface local MAP procedures outside owning procedure', () => {
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
            const items = p.provide(doc, { line: 13, character: 2 }, '');
            const labels = items.map(i => i.label);
            assert.ok(!labels.includes('LocalProc'), `LocalProc should NOT appear outside its owning procedure. Got: ${labels.join(', ')}`);
        });
    });

    suite('Local variables', () => {
        test('surfaces local Label tokens in procedure data section', () => {
            const doc = makeDoc([
                'MyProc PROCEDURE()',
                'LocalVar  LONG',
                'CODE',
                '  LocalVar = 1',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = p.provide(doc, { line: 3, character: 2 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('LocalVar'), `Expected LocalVar in: ${labels.join(', ')}`);
        });

        test('does NOT include structure fields as standalone variables', () => {
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
            const items = p.provide(doc, { line: 5, character: 2 }, '');
            const labels = items.map(i => i.label);
            // Field1 is a structure field — should not appear as a standalone variable
            assert.ok(!labels.includes('Field1'), `Structure field Field1 should not appear as a variable. Got: ${labels.join(', ')}`);
            // MyQueue itself should appear
            assert.ok(labels.includes('MyQueue'), `Expected MyQueue in: ${labels.join(', ')}`);
        });

        test('does NOT include procedure name as a variable', () => {
            const doc = makeDoc([
                'MyProc PROCEDURE()',
                'CODE',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = p.provide(doc, { line: 1, character: 0 }, '');
            const varItems = items.filter(i => i.label === 'MyProc' && i.kind === CompletionItemKind.Variable);
            assert.strictEqual(varItems.length, 0, 'MyProc should not appear as a Variable completion item');
        });
    });

    suite('Parameters', () => {
        test('surfaces simple parameters', () => {
            const doc = makeDoc([
                'MyProc PROCEDURE(LONG pId, STRING pName)',
                'CODE',
                '  pId += 1',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = p.provide(doc, { line: 2, character: 2 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('pId'), `Expected pId in: ${labels.join(', ')}`);
            assert.ok(labels.includes('pName'), `Expected pName in: ${labels.join(', ')}`);
        });

        test('surfaces optional parameters (angle-bracket notation)', () => {
            const doc = makeDoc([
                'MyProc PROCEDURE(LONG pId, <STRING pOpt>)',
                'CODE',
                '  pId += 1',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = p.provide(doc, { line: 2, character: 2 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('pOpt'), `Expected pOpt in: ${labels.join(', ')}`);
        });

        test('surfaces colon-prefixed parameters', () => {
            const doc = makeDoc([
                'MyProc PROCEDURE(LONG LOC:TestId)',
                'CODE',
                'END',
            ].join('\n'));
            const p = makeProvider(doc);
            const items = p.provide(doc, { line: 1, character: 0 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('LOC:TestId'), `Expected LOC:TestId in: ${labels.join(', ')}`);
        });
    });

    suite('Routine scope', () => {
        test('routine sees parent procedure local variables', () => {
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
            const items = p.provide(doc, { line: 4, character: 2 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('ParentVar'), `Expected ParentVar visible in routine. Got: ${labels.join(', ')}`);
        });
    });

    suite('Constants / equates', () => {
        test('surfaces file-level constants', () => {
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
            const items = p.provide(doc, { line: 5, character: 4 }, '');
            const labels = items.map(i => i.label);
            assert.ok(labels.includes('MyConst'), `Expected MyConst in: ${labels.join(', ')}`);
        });
    });

    suite('No completions in comments or strings', () => {
        test('returns results regardless — comment guard is in CompletionProvider', () => {
            // WordCompletionProvider itself has no comment guard (CompletionProvider handles it)
            // Just verify it does not throw on edge cases
            const doc = makeDoc('! nothing here\n');
            const p = makeProvider(doc);
            assert.doesNotThrow(() => p.provide(doc, { line: 0, character: 5 }, 'n'));
        });
    });
});
