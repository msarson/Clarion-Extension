import * as assert from 'assert';
import { CallSiteArgumentClassifier } from '../utils/CallSiteArgumentClassifier';
import { ClarionTokenizer } from '../ClarionTokenizer';

/**
 * Issue #242 — `classifyArgumentText` classifies a single argument given as raw text (a
 * signature-help partial segment), reusing the full per-argument inference (literals,
 * EQUATE #240, implicit #241) with the document tokens for EQUATE lookup and an optional
 * resolver for typed variables. This lets signature help highlight the type-matching
 * overload as you type, instead of the previous literal-only text heuristic.
 */
suite('CallSiteArgumentClassifier — classifyArgumentText (#242)', () => {
    let classifier: CallSiteArgumentClassifier;
    setup(() => { classifier = new CallSiteArgumentClassifier(); });

    const docTokens = new ClarionTokenizer(`  PROGRAM
  MAP
  END
MaxRows  EQUATE(100)
myLong   LONG
  CODE
`).tokenize();

    test('EQUATE identifier → literal_numeric LONG (via document tokens)', () => {
        const a = classifier.classifyArgumentText('MaxRows', docTokens);
        assert.strictEqual(a.kind, 'literal_numeric');
        assert.strictEqual(a.inferredType, 'LONG');
    });

    test('implicit variable → variable LONG', () => {
        const a = classifier.classifyArgumentText('Counter#', docTokens);
        assert.strictEqual(a.kind, 'variable');
        assert.strictEqual(a.inferredType, 'LONG');
    });

    test('string literal → literal_string STRING', () => {
        const a = classifier.classifyArgumentText("'hi'", docTokens);
        assert.strictEqual(a.kind, 'literal_string');
        assert.strictEqual(a.inferredType, 'STRING');
    });

    test('numeric literal → literal_numeric LONG', () => {
        const a = classifier.classifyArgumentText('42', docTokens);
        assert.strictEqual(a.kind, 'literal_numeric');
        assert.strictEqual(a.inferredType, 'LONG');
    });

    test('typed variable → variable with resolver-supplied type', () => {
        const ctx = { resolveSymbolType: (name: string) => name === 'myLong' ? 'LONG' : undefined };
        const a = classifier.classifyArgumentText('myLong', docTokens, ctx);
        assert.strictEqual(a.kind, 'variable');
        assert.strictEqual(a.inferredType, 'LONG');
    });

    test('empty / whitespace → unknown', () => {
        assert.strictEqual(classifier.classifyArgumentText('   ', docTokens).kind, 'unknown');
    });
});
