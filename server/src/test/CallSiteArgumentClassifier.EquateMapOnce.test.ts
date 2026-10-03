import * as assert from 'assert';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { CallSiteArgumentClassifier } from '../utils/CallSiteArgumentClassifier';

/**
 * classifyArguments rebuilt its EQUATE name → value map (#240) on every call, walking every
 * token in the document. The by-reference diagnostic and the inlay hints classify every call
 * in the document, so a document pass cost calls x tokens, paid again on every re-validation
 * after an edit. Now built once per token array. Counted with a Proxy over the token array,
 * a warm call at two sizes.
 */
suite('CallSiteArgumentClassifier builds the EQUATE map once per document', function () {
    this.timeout(60000);

    const source = (calls: number): string => {
        const lines = [
            '  PROGRAM',
            'MaxItems  EQUATE(100)',
            'Greeting  EQUATE(\'hi\')',
            '  MAP',
            'Foo  PROCEDURE(LONG pN)',
            '  END',
            'Count  LONG',
            '  CODE',
        ];
        for (let i = 0; i < calls; i++) lines.push(i % 2 ? '  Foo(MaxItems)' : '  Foo(Count)');
        lines.push('  RETURN', '');
        return lines.join('\r\n');
    };

    const callIndices = (tokens: Token[]): number[] => {
        const out: number[] = [];
        for (let i = 0; i + 1 < tokens.length; i++) {
            if (tokens[i].value.toUpperCase() === 'FOO' && tokens[i + 1].type === TokenType.Delimiter &&
                tokens[i + 1].value === '(' && tokens[i + 1].line === tokens[i].line) out.push(i);
        }
        return out;
    };

    const readsForWarmCall = (calls: number): number => {
        const tokens = new ClarionTokenizer(source(calls)).tokenize();
        const idx = callIndices(tokens);
        assert.strictEqual(idx.length, calls, 'every Foo(...) call is found');
        let reads = 0;
        const counted = new Proxy(tokens, {
            get(target, prop, receiver) {
                if (typeof prop === 'string' && /^\d+$/.test(prop)) reads++;
                return Reflect.get(target, prop, receiver);
            },
        });
        const classifier = new CallSiteArgumentClassifier();
        classifier.classifyArguments(counted, idx[0]); // warm-up: the per-array map
        reads = 0;
        classifier.classifyArguments(counted, idx[idx.length - 1]);
        return reads;
    };

    test('bug-pin: four times the calls costs a warm call about the same token reads', () => {
        const small = readsForWarmCall(500);
        const large = readsForWarmCall(2000);
        assert.ok(large <= Math.max(50, small * 2),
            `a warm call read ${large} tokens with 2000 calls, ${small} with 500 (rebuilt per call it grows ~4x)`);
    });

    test('an EQUATE argument still classifies by its value once the map is cached', () => {
        const tokens = new ClarionTokenizer(source(4)).tokenize();
        const classifier = new CallSiteArgumentClassifier();
        const kinds = callIndices(tokens).map(i => classifier.classifyArguments(tokens, i)![0].kind);
        // Calls alternate Foo(Count), Foo(MaxItems): a variable, then the EQUATE's numeric value.
        assert.deepStrictEqual(kinds, ['variable', 'literal_numeric', 'variable', 'literal_numeric']);
    });

    test("one document's EQUATEs do not answer for another's", () => {
        const classifier = new CallSiteArgumentClassifier();
        const withEquate = new ClarionTokenizer(source(2)).tokenize();
        assert.strictEqual(classifier.classifyArguments(withEquate, callIndices(withEquate)[1])![0].kind, 'literal_numeric');
        const without = new ClarionTokenizer(source(2).replace(/^MaxItems .*$/m, 'MaxItems  LONG')).tokenize();
        assert.strictEqual(classifier.classifyArguments(without, callIndices(without)[1])![0].kind, 'variable');
    });
});
