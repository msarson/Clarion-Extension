import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range } from 'vscode-languageserver/node';
import {
    findContinuationPipe,
    flattenGroup,
    findGroupRange,
    FlattenCodeActionProvider,
} from '../providers/FlattenCodeActionProvider';

function doc(code: string): TextDocument {
    return TextDocument.create('file:///test.clw', 'clarion', 1, code);
}

/** Cursor-only range (no selection) */
function cursor(line: number, char = 0): Range {
    return Range.create(line, char, line, char);
}

/** Selection range */
function sel(startLine: number, startChar: number, endLine: number, endChar: number): Range {
    return Range.create(startLine, startChar, endLine, endChar);
}

// ─────────────────────────────────────────────────────────────────────────────
suite('FlattenCodeActionProvider — findContinuationPipe', () => {

    test('pipe outside string returns its index', () => {
        assert.strictEqual(findContinuationPipe('hello | world'), 6);
    });

    test('pipe at start of line', () => {
        assert.strictEqual(findContinuationPipe('|rest'), 0);
    });

    test('pipe at end of line', () => {
        const line = "AT(,,300,200),GRAY |";
        assert.strictEqual(findContinuationPipe(line), line.length - 1);
    });

    test('pipe inside string returns -1', () => {
        assert.strictEqual(findContinuationPipe("FORMAT('51L(2)|M~IP~@s30@')"), -1);
    });

    test('pipe after string returns index', () => {
        // 'test' |
        const line = "'test' |";
        assert.strictEqual(findContinuationPipe(line), 7);
    });

    test('doubled-quote escape inside string: pipe still inside string', () => {
        // 'it''s' | → pipe at index 8, outside string
        const line = "'it''s' |";
        assert.strictEqual(findContinuationPipe(line), 8);
    });

    test('pipe inside string with doubled-quote returns -1', () => {
        // 'a|b''c' → pipe at index 2 is INSIDE the string
        assert.strictEqual(findContinuationPipe("'a|b''c'"), -1);
    });

    test('no pipe returns -1', () => {
        assert.strictEqual(findContinuationPipe("Window  WINDOW('Test'),AT(,,300,200)"), -1);
    });

    test('empty string returns -1', () => {
        assert.strictEqual(findContinuationPipe(''), -1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
suite('FlattenCodeActionProvider — flattenGroup', () => {

    test('two-line continuation joined', () => {
        const lines = [
            "Window  WINDOW('My Window'),AT(,,453,319),FONT('Segoe UI',10,,FONT:regular, |",
            "          CHARSET:ANSI),DOUBLE,AUTO,GRAY",
        ];
        const result = flattenGroup(lines);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(
            result[0],
            "Window  WINDOW('My Window'),AT(,,453,319),FONT('Segoe UI',10,,FONT:regular, CHARSET:ANSI),DOUBLE,AUTO,GRAY"
        );
    });

    test('three-line chain flattened to one', () => {
        const lines = [
            'a |',
            'b |',
            'c',
        ];
        const result = flattenGroup(lines);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0], 'a b c');
    });

    test('no continuations: lines unchanged', () => {
        const lines = ['alpha', 'beta', 'gamma'];
        const result = flattenGroup(lines);
        assert.deepStrictEqual(result, ['alpha', 'beta', 'gamma']);
    });

    test('adjacent string literals collapsed after join', () => {
        const lines = [
            "FORMAT('51L(2)|M~IP Address~@s30@' & |",
            "  '28L(2)|M~Socket~@n7@')",
        ];
        const result = flattenGroup(lines);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0], "FORMAT('51L(2)|M~IP Address~@s30@28L(2)|M~Socket~@n7@')");
    });

    test('chained string literals collapsed: a & b & c → abc', () => {
        const lines = [
            "'a' & |",
            "'b' & |",
            "'c'",
        ];
        const result = flattenGroup(lines);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0], "'abc'");
    });

    test('trailing continuation at end of input: strip pipe', () => {
        const lines = ['hello |'];
        const result = flattenGroup(lines);
        assert.strictEqual(result[0], 'hello');
    });

    test('mixed: first group has continuation, second does not', () => {
        const lines = [
            'a |',
            'b',
            'c',
            'd',
        ];
        const result = flattenGroup(lines);
        assert.deepStrictEqual(result, ['a b', 'c', 'd']);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
suite('FlattenCodeActionProvider — findGroupRange', () => {

    test('cursor on first and only continuation line', () => {
        const lines = ['a |', 'b'];
        const { start, end } = findGroupRange(lines, 0);
        assert.strictEqual(start, 0);
        assert.strictEqual(end, 1);
    });

    test('cursor on last line of group (continuation line)', () => {
        const lines = ['a |', 'b'];
        const { start, end } = findGroupRange(lines, 1);
        assert.strictEqual(start, 0);
        assert.strictEqual(end, 1);
    });

    test('cursor in middle of three-line group', () => {
        const lines = ['a |', 'b |', 'c'];
        const { start, end } = findGroupRange(lines, 1);
        assert.strictEqual(start, 0);
        assert.strictEqual(end, 2);
    });

    test('cursor on standalone line (no continuation)', () => {
        const lines = ['a', 'b', 'c'];
        const { start, end } = findGroupRange(lines, 1);
        assert.strictEqual(start, 1);
        assert.strictEqual(end, 1);
    });

    test('two separate groups: cursor in second group', () => {
        const lines = ['x |', 'y', 'a |', 'b'];
        const { start, end } = findGroupRange(lines, 2);
        assert.strictEqual(start, 2);
        assert.strictEqual(end, 3);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
suite('FlattenCodeActionProvider — provideCodeActions', () => {

    const provider = new FlattenCodeActionProvider();

    test('returns action when cursor is on a line with pipe', () => {
        const code = "a |\nb";
        const actions = provider.provideCodeActions(doc(code), cursor(0));
        assert.strictEqual(actions.length, 1);
        assert.ok(actions[0].title.toLowerCase().includes('flatten'));
    });

    test('returns action when cursor is on a continuation line (prev has pipe)', () => {
        const code = "a |\nb";
        const actions = provider.provideCodeActions(doc(code), cursor(1));
        assert.strictEqual(actions.length, 1);
    });

    test('returns no action on normal line with no continuation context', () => {
        const code = "alpha\nbeta\ngamma";
        const actions = provider.provideCodeActions(doc(code), cursor(1));
        assert.strictEqual(actions.length, 0);
    });

    test('WorkspaceEdit replaces correct line range', () => {
        const code = "prefix\na |\nb\nsuffix";
        const actions = provider.provideCodeActions(doc(code), cursor(1));
        assert.strictEqual(actions.length, 1);
        const edit = actions[0].edit!;
        const changes = edit.changes!['file:///test.clw'];
        assert.ok(changes && changes.length === 1);
        // Group is lines 1–2; replace from (1,0) to (2, len('b'))
        assert.strictEqual(changes[0].range.start.line, 1);
        assert.strictEqual(changes[0].range.end.line, 2);
        assert.strictEqual(changes[0].newText, 'a b');
    });

    test('WorkspaceEdit replacement text is flattened', () => {
        const code = [
            "Window  WINDOW('Test'),AT(,,300,200),FONT('Segoe UI',9),GRAY, |",
            "        MAX,RESIZE",
        ].join('\n');
        const actions = provider.provideCodeActions(doc(code), cursor(0));
        assert.strictEqual(actions.length, 1);
        const newText = actions[0].edit!.changes!['file:///test.clw'][0].newText;
        assert.ok(!newText.includes('|'), 'Flattened text should not contain pipe');
        assert.ok(!newText.includes('\n'), 'Flattened text should be single line');
    });

    test('selection mode: flattens only selected lines', () => {
        const code = "prefix\na |\nb\nsuffix\nc |\nd";
        // Select lines 1–2 only
        const selection = sel(1, 0, 2, 1);
        const actions = provider.provideCodeActions(doc(code), selection);
        assert.strictEqual(actions.length, 1);
        const changes = actions[0].edit!.changes!['file:///test.clw'];
        assert.strictEqual(changes[0].range.start.line, 1);
        assert.strictEqual(changes[0].range.end.line, 2);
        assert.strictEqual(changes[0].newText, 'a b');
    });

    test('selection mode: no action if selected lines have no continuation', () => {
        const code = "alpha\nbeta\ngamma";
        const selection = sel(0, 0, 1, 4);
        const actions = provider.provideCodeActions(doc(code), selection);
        assert.strictEqual(actions.length, 0);
    });

    test('code action kind is RefactorRewrite', () => {
        const code = "a |\nb";
        const actions = provider.provideCodeActions(doc(code), cursor(0));
        assert.strictEqual(actions[0].kind, 'refactor.rewrite');
    });
});
