import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { TokenType } from '../tokenizer/TokenTypes';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { ReferencesProvider } from '../providers/ReferencesProvider';

/**
 * #546 — `Name (args)` with whitespace before the paren (NetTalk's generated
 * `NetDebugTrace ('…')`, and `EQUATE (5)`, `DIM (5)`, `IF (x)` in a data section) was
 * lexed as ONE FunctionArgumentParameter token holding the name, the space and the
 * arguments, because the Function pattern required the paren to follow immediately.
 * Every token-typed consumer then missed the call: Find All References matched no
 * value, the call classifier saw no Function, and #509/#517 read the name out of the
 * token as a stopgap.
 *
 * Whitespace before the paren now tokenizes exactly as no whitespace does.
 */
suite('A call with a space before its paren tokenizes like one without (#546)', () => {

    const shapes = (line: string) => new ClarionTokenizer(['P PROCEDURE()', '  CODE', line, '  RETURN'].join('\n'))
        .tokenize().filter(t => t.line === 2).map(t => `${TokenType[t.type]}:${t.value}`);

    test('bug-pin: `Gone (\'x\')` is Function, delimiter, string, delimiter — the same as `Gone(\'x\')`', () => {
        assert.deepStrictEqual(shapes("  Gone ('x')"), shapes("  Gone('x')"));
        assert.deepStrictEqual(shapes("  Gone ('x')"), ["Function:Gone", "Delimiter:(", "String:'x'", "Delimiter:)"]);
    });

    test('the NetTalk shape, with a bracketed string and two arguments', () => {
        assert.deepStrictEqual(
            shapes("  NetDebugTrace ('[Nettalk Template] x', 1)"),
            shapes("  NetDebugTrace('[Nettalk Template] x', 1)")
        );
        assert.strictEqual(shapes("  NetDebugTrace ('[Nettalk Template] x', 1)")[0], 'Function:NetDebugTrace');
    });

    test('a spaced call inside an expression', () => {
        assert.deepStrictEqual(shapes('  x = Helper (1) + Other(2)'), shapes('  x = Helper(1) + Other(2)'));
    });

    test('no FunctionArgumentParameter token is produced for a spaced call, in code or in data', () => {
        const src = ['P PROCEDURE()', 'Eq   EQUATE (5)', 'Arr  LONG, DIM (5)', '  CODE', "  Gone ('x')", '  RETURN'].join('\n');
        const leftovers = new ClarionTokenizer(src).tokenize().filter(t => t.type === TokenType.FunctionArgumentParameter);
        assert.deepStrictEqual(leftovers.map(t => t.value), []);
    });

    test('a spaced EQUATE still reads as an EQUATE declaration, a spaced STRING as a type', () => {
        const toks = new ClarionTokenizer(['Eq   EQUATE (5)', 'S    STRING (20)'].join('\n')).tokenize();
        assert.deepStrictEqual(toks.filter(t => t.line === 0).map(t => `${TokenType[t.type]}:${t.value}`), ['Label:Eq', 'Function:EQUATE', 'Delimiter:(', 'Number:5', 'Delimiter:)']);
        assert.deepStrictEqual(toks.filter(t => t.line === 1).map(t => `${TokenType[t.type]}:${t.value}`), ['Label:S', 'Type:STRING', 'Delimiter:(', 'Number:20', 'Delimiter:)']);
    });

    test('Find All References sees a spaced call site', async () => {
        setServerInitialized(true);
        const src = [
            '  PROGRAM',                     // 0
            '  MAP',                         // 1
            'Helper  PROCEDURE(STRING s)',   // 2
            '  END',                         // 3
            '  CODE',                        // 4
            "  Helper ('spaced')",           // 5
            "  Helper('plain')",             // 6
            '  RETURN',                      // 7
            'Helper PROCEDURE(STRING s)',    // 8
            '  CODE',                        // 9
            '  RETURN',                      // 10
        ].join('\n');
        const doc = TextDocument.create('file:///c:/spaced546/main.clw', 'clarion', 1, src);
        TokenCache.getInstance().getTokens(doc);
        const refs = await new ReferencesProvider().provideReferences(doc, { line: 8, character: 1 }, { includeDeclaration: false });
        const lines = (refs ?? []).map(r => r.range.start.line).sort((a, b) => a - b);
        assert.ok(lines.includes(5), `the spaced call at line 5 must be a reference; got ${lines}`);
        assert.ok(lines.includes(6), `the plain call at line 6 must be a reference; got ${lines}`);
    });
});
