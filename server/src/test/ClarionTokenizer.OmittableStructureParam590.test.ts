import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

/**
 * #590 — an omittable parameter whose type is a structure keyword lost the first
 * letter of the type: `<FILE f>` tokenized as Variable "ILE", `<REPORT R>` as
 * "EPORT", and `DoIt(a,QUEUE q)` as "UEUE".
 *
 * The Structure branch skipped a keyword preceded by ':' '.' ',' or '<' with a
 * bare `continue`. After it no structure pattern matched, so the word fell through
 * to the Variable pattern — which EXCLUDES structure keywords and therefore matches
 * from the second character on.
 *
 * This is the same failure #416 fixed a few lines below, where the
 * isInsideParamsOrTemplate branch emits a Keyword token instead of falling through
 * (its comment names the `QUEUE -> "UEUE"` symptom). The prevChar guard ran first,
 * so ',' and '<' never reached it.
 *
 * ':' and '.' are deliberately NOT changed: they introduce qualified names
 * (`nts:case`, `obj.case`), which the StructurePrefix/StructureField patterns match
 * whole, with no character loss. The controls below pin that.
 *
 * Keyword (not Variable) is the right token: the document-symbol and structure
 * builders ignore keywords, so a keyword-named parameter type does not become a
 * spurious outline declaration, and it cannot open an unterminated structure.
 */

const mapProg = (proto: string) => `PROGRAM\n  MAP\n    ${proto}\n  END\n  CODE\n  RETURN\n`;
const PROTO_LINE = 2;

function protoTokens(proto: string) {
    return new ClarionTokenizer(mapProg(proto)).tokenize().filter(t => t.line === PROTO_LINE);
}

/** The token whose text starts at the column of `needle` in the prototype. */
function tokenAt(proto: string, needle: string) {
    const col = mapProg(proto).split('\n')[PROTO_LINE].indexOf(needle);
    assert.ok(col >= 0, `fixture problem: "${needle}" not in the prototype`);
    return protoTokens(proto).find(t => t.start === col);
}

suite('ClarionTokenizer — omittable structure-typed parameters (#590)', () => {

    const cases: Array<[string, string]> = [
        ['DoIt(<FILE f>)', 'FILE'],
        ['DoIt(<QUEUE q>)', 'QUEUE'],
        ['DoIt(<GROUP g>)', 'GROUP'],
        ['DoIt(<VIEW v>)', 'VIEW'],
        ['DoIt(<REPORT R>)', 'REPORT'],
        ['DoIt(<WINDOW w>)', 'WINDOW'],
    ];

    for (const [proto, keyword] of cases) {
        test(`<${keyword} x> keeps its first letter`, () => {
            const tok = tokenAt(proto, keyword);
            assert.ok(tok, `a token starts at the '${keyword}' column`);
            assert.strictEqual(tok!.value, keyword, `'${keyword}' must not lose its leading character`);
            assert.strictEqual(TokenType[tok!.type], 'Keyword',
                'a parameter type is a Keyword reference, not a Structure opener and not a Variable');
        });
    }

    test('a structure keyword directly after a comma keeps its first letter', () => {
        const tok = tokenAt('DoIt(a,QUEUE q)', 'QUEUE');
        assert.ok(tok);
        assert.strictEqual(tok!.value, 'QUEUE');
        assert.strictEqual(TokenType[tok!.type], 'Keyword');
    });

    test('the real generated-app shape tokenizes whole', () => {
        const proto = 'Init PROCEDURE(ProcessClass PC,<REPORT R>,<PrintPreviewClass PV>)';
        const report = tokenAt(proto, 'REPORT');
        assert.strictEqual(report!.value, 'REPORT');
        assert.strictEqual(TokenType[report!.type], 'Keyword');
        // the class-typed parameter beside it was always correct and stays so
        const cls = tokenAt(proto, 'PrintPreviewClass');
        assert.strictEqual(cls!.value, 'PrintPreviewClass');
    });

    test('an omittable structure parameter opens no structure', () => {
        const toks = protoTokens('DoIt(<FILE f>,<QUEUE q>)');
        const structures = toks.filter(t => t.type === TokenType.Structure);
        assert.deepStrictEqual(structures.map(t => t.value), [],
            'a parameter type must not be read as a structure declaration');
    });

    // ---- controls: what must NOT change

    test('control — a simple omittable type is unchanged', () => {
        const tok = tokenAt('DoIt(<LONG a>)', 'LONG');
        assert.strictEqual(tok!.value, 'LONG');
        assert.strictEqual(TokenType[tok!.type], 'Type');
    });

    test('control — the same keyword after "(" is unchanged', () => {
        const tok = tokenAt('DoIt(FILE f)', 'FILE');
        assert.strictEqual(tok!.value, 'FILE');
        assert.strictEqual(TokenType[tok!.type], 'Keyword');
    });

    test('control — a qualified name keeps its colon form', () => {
        const toks = new ClarionTokenizer('PROGRAM\n  MAP\n  END\n  CODE\n  x = nts:case\n').tokenize()
            .filter(t => t.line === 4);
        assert.ok(toks.some(t => t.value === 'nts:case'),
            'nts:case stays one StructurePrefix token — the ":" guard must not change');
    });

    test('control — a qualified name keeps its dotted form', () => {
        const toks = new ClarionTokenizer('PROGRAM\n  MAP\n  END\n  CODE\n  x = obj.case\n').tokenize()
            .filter(t => t.line === 4);
        assert.ok(toks.some(t => t.value === 'obj.case'),
            'obj.case stays one StructureField token — the "." guard must not change');
    });

    test('control — a name that merely STARTS with a structure keyword is not split', () => {
        for (const [proto, name] of [['DoIt(<QUEUEDItem q>)', 'QUEUEDItem'], ['DoIt(a,FILESpec s)', 'FILESpec']] as const) {
            const tok = tokenAt(proto, name);
            assert.ok(tok, `a token starts at the '${name}' column`);
            assert.strictEqual(tok!.value, name,
                `'${name}' is one name, not the keyword plus a remainder`);
        }
    });

    test('control — a prefixed name after a comma keeps its colon form', () => {
        const tok = tokenAt('DoIt(a,QUE:Field f)', 'QUE:Field');
        assert.ok(tok);
        assert.strictEqual(tok!.value, 'QUE:Field');
    });

    // These two came out of the corpus A/B: the first version of the fix reclassified 2,195 real
    // references and 2 qualified calls, which F12 and Find All References would have stopped
    // resolving. After ',' a bare keyword is only a parameter type when a parameter NAME follows.

    test('control — a structure passed as an ARGUMENT stays a variable', () => {
        const src = `PROGRAM\n  MAP\n  END\n  CODE\n  INIMgr.Fetch('Main',Window)\n`;
        const toks = new ClarionTokenizer(src).tokenize().filter(t => t.line === 4);
        const win = toks.find(t => t.value.toUpperCase() === 'WINDOW');
        assert.ok(win, 'the Window argument is still a token of its own');
        assert.notStrictEqual(TokenType[win!.type], 'Keyword',
            'passing a WINDOW as an argument is a reference, not a parameter type');
    });

    test('control — a qualified call after a comma is not split', () => {
        const src = `PROGRAM\n  MAP\n  END\n  CODE\n  x = self.Div(p_id,class.GetValue())\n`;
        const toks = new ClarionTokenizer(src).tokenize().filter(t => t.line === 4);
        assert.ok(toks.some(t => t.value === 'class.GetValue'),
            'class.GetValue stays one qualified token');
    });

    test('control — "<" as a comparison is not read as a parameter bracket', () => {
        const src = `PROGRAM\n  MAP\n  END\n  CODE\n  IF a<Window THEN b = 1.\n`;
        const toks = new ClarionTokenizer(src).tokenize().filter(t => t.line === 4);
        const win = toks.find(t => t.value.toUpperCase() === 'WINDOW');
        assert.ok(win);
        assert.notStrictEqual(TokenType[win!.type], 'Keyword',
            'a less-than comparison does not open an optional parameter');
    });

    test('the abbreviated omittable form (no parameter name) is still whole', () => {
        const tok = tokenAt('ReportWizard(queue,<byte>,<queue>)', '<queue>'.slice(1, -1));
        assert.ok(tok, 'the abbreviated <queue> parameter is one token');
        assert.strictEqual(tok!.value.toUpperCase(), 'QUEUE');
    });

    test('control — a real structure declaration still opens a structure', () => {
        const toks = new ClarionTokenizer('MyQ  QUEUE,PRE(Q)\nF      LONG\n     END\n').tokenize()
            .filter(t => t.line === 0 && t.type === TokenType.Structure);
        assert.deepStrictEqual(toks.map(t => t.value), ['QUEUE'],
            'a labelled QUEUE declaration is still a structure opener');
    });
});
