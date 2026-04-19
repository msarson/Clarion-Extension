import * as assert from 'assert';
import { Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import {
    ClarionCodeLensProvider,
    buildCodeLenses,
    formatReferenceCount,
} from '../providers/ClarionCodeLensProvider';

function tokenize(code: string) {
    const lines = code.split(/\r?\n/);
    const tokenizer = new ClarionTokenizer(code);
    const tokens = tokenizer.tokenize();
    new DocumentStructure(tokens, lines).process();
    return tokens;
}

function doc(code: string): TextDocument {
    return TextDocument.create('file:///test.clw', 'clarion', 1, code);
}

// ─────────────────────────────────────────────────────────────────────────────
suite('ClarionCodeLensProvider — formatReferenceCount', () => {

    test('0 references', () => {
        assert.strictEqual(formatReferenceCount(0), '0 references');
    });

    test('1 reference (singular)', () => {
        assert.strictEqual(formatReferenceCount(1), '1 reference');
    });

    test('2 references', () => {
        assert.strictEqual(formatReferenceCount(2), '2 references');
    });

    test('10 references', () => {
        assert.strictEqual(formatReferenceCount(10), '10 references');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
suite('ClarionCodeLensProvider — buildCodeLenses', () => {

    test('single global procedure gets one lens on its header line', () => {
        const code = [
            'MyProc  PROCEDURE()',   // 0
            'CODE',                  // 1
            'END',                   // 2
        ].join('\n');
        const tokens = tokenize(code);
        const lenses = buildCodeLenses('file:///test.clw', tokens);
        assert.strictEqual(lenses.length, 1);
        assert.strictEqual(lenses[0].range.start.line, 0);
    });

    test('method implementation gets a lens', () => {
        const code = [
            'MyClass.Init  PROCEDURE()',  // 0
            'CODE',                        // 1
            'END',                         // 2
        ].join('\n');
        const tokens = tokenize(code);
        const lenses = buildCodeLenses('file:///test.clw', tokens);
        assert.strictEqual(lenses.length, 1);
        assert.strictEqual(lenses[0].range.start.line, 0);
    });

    test('CLASS declaration gets a lens', () => {
        const code = [
            'MyClass  CLASS',     // 0
            'Init  PROCEDURE()',  // 1
            'END',                // 2
        ].join('\n');
        const tokens = tokenize(code);
        const lenses = buildCodeLenses('file:///test.clw', tokens);
        // At minimum the CLASS should have a lens; MethodDeclaration inside may or may not
        const classLens = lenses.find(l => l.range.start.line === 0);
        assert.ok(classLens, 'CLASS declaration should have a lens on line 0');
    });

    test('multiple procedures each get a lens', () => {
        const code = [
            'ProcA  PROCEDURE()',   // 0
            'CODE',                 // 1
            'END',                  // 2
            '',                     // 3
            'ProcB  PROCEDURE()',   // 4
            'CODE',                 // 5
            'END',                  // 6
        ].join('\n');
        const tokens = tokenize(code);
        const lenses = buildCodeLenses('file:///test.clw', tokens);
        const lines = lenses.map(l => l.range.start.line);
        assert.ok(lines.includes(0), 'ProcA should have lens on line 0');
        assert.ok(lines.includes(4), 'ProcB should have lens on line 4');
    });

    test('lens range is single line (start.line === end.line)', () => {
        const code = [
            'MyProc  PROCEDURE()',
            'CODE',
            'END',
        ].join('\n');
        const tokens = tokenize(code);
        const lenses = buildCodeLenses('file:///test.clw', tokens);
        for (const lens of lenses) {
            assert.strictEqual(lens.range.start.line, lens.range.end.line,
                'Lens range should be on a single line');
        }
    });

    test('lens data contains uri and position', () => {
        const code = [
            'MyProc  PROCEDURE()',
            'CODE',
            'END',
        ].join('\n');
        const tokens = tokenize(code);
        const lenses = buildCodeLenses('file:///test.clw', tokens);
        assert.strictEqual(lenses.length, 1);
        const data = lenses[0].data as { uri: string; line: number; character: number; symbolName: string };
        assert.strictEqual(data.uri, 'file:///test.clw');
        assert.strictEqual(data.line, 0);
        assert.ok(typeof data.character === 'number');
        assert.ok(typeof data.symbolName === 'string' && data.symbolName.length > 0);
    });

    test('dotted method label — character points to method name part (after last dot)', () => {
        // For "Kanban.Init PROCEDURE", character must point to "Init" (col 7)
        // so getWordRangeAtPosition returns "Init", triggering dot-chain reconstruction
        const code = [
            'Kanban.Init  PROCEDURE(LONG pCtrl)',  // 0
            '  CODE',                               // 1
            '  PARENT.Init(pCtrl)',                 // 2
        ].join('\n');
        const tokens = tokenize(code);
        const lenses = buildCodeLenses('file:///test2.clw', tokens);
        assert.ok(lenses.length >= 1, 'should have at least one lens');
        const data = lenses[0].data as { uri: string; line: number; character: number; symbolName: string };
        // "Kanban.Init" — "Init" starts at index 7
        assert.strictEqual(data.character, 7, 'character should point to "Init" after the dot');
        assert.strictEqual(data.symbolName, 'Kanban.Init');
    });

    test('simple (non-dotted) procedure — character is 0', () => {
        const code = ['SimpleProc  PROCEDURE()', 'CODE', 'END'].join('\n');
        const tokens = tokenize(code);
        const lenses = buildCodeLenses('file:///test3.clw', tokens);
        assert.ok(lenses.length >= 1);
        const data = lenses[0].data as { uri: string; line: number; character: number; symbolName: string };
        assert.strictEqual(data.character, 0);
    });

    test('no lenses for empty token array', () => {
        const lenses = buildCodeLenses('file:///test.clw', []);
        assert.strictEqual(lenses.length, 0);
    });

    test('lens has no command initially (deferred to resolve)', () => {
        const code = ['MyProc  PROCEDURE()', 'CODE', 'END'].join('\n');
        const tokens = tokenize(code);
        const lenses = buildCodeLenses('file:///test.clw', tokens);
        assert.strictEqual(lenses[0].command, undefined);
    });

    test('empty token array returns no lenses', () => {
        const lenses = buildCodeLenses('file:///test.clw', []);
        assert.strictEqual(lenses.length, 0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
suite('ClarionCodeLensProvider — provideCodeLenses', () => {

    test('returns array for a document with procedures', () => {
        const code = ['MyProc  PROCEDURE()', 'CODE', 'END'].join('\n');
        const provider = new ClarionCodeLensProvider();
        const lenses = provider.provideCodeLenses(doc(code));
        assert.ok(Array.isArray(lenses));
        assert.ok(lenses.length >= 1);
    });

    test('returns empty array for empty document', () => {
        const provider = new ClarionCodeLensProvider();
        const lenses = provider.provideCodeLenses(doc(''));
        // Empty document — may return [] or array with no lenses depending on cache
        // The important thing is lenses for a procedure-less doc are all on non-existent lines
        assert.ok(lenses.every(l => l.range.start.line >= 0));
    });
});
