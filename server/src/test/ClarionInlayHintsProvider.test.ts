import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { ClarionInlayHintsProvider } from '../providers/ClarionInlayHintsProvider';

/**
 * Inlay hints (new capability): inline type hints for implicit variables and parameter-name
 * hints at call sites — reusing the implicit-variable suffix rule and Token.parameters.
 */
function build(src: string) {
    const cache = TokenCache.getInstance();
    cache.clearAllTokens();
    const doc = TextDocument.create('file:///inlay.clw', 'clarion', 1, src);
    const tokens = cache.getTokens(doc);
    return { doc, tokens };
}

function fullRange(src: string): Range {
    return { start: { line: 0, character: 0 }, end: { line: src.split('\n').length, character: 0 } };
}

const label = (l: any): string => (typeof l === 'string' ? l : (l ?? []).map((p: any) => p.value).join(''));

suite('ClarionInlayHintsProvider', () => {
    const provider = new ClarionInlayHintsProvider();

    test('implicit-variable type hints (# → LONG, $ → REAL) shown once per distinct name', () => {
        const src = [
            'MyProc PROCEDURE',
            '  CODE',
            '  Counter# = 1',
            '  Counter# += 1',   // same implicit — should NOT get a second hint
            '  Pct$ = 0.5',
        ].join('\n');
        const { doc, tokens } = build(src);
        const hints = provider.provideInlayHints(doc, fullRange(src), tokens);
        const byLabel = hints.filter(h => label(h.label).trim().startsWith(':'))
            .map(h => label(h.label).trim()).sort();
        // one LONG (deduped despite two Counter# uses) + one REAL.
        assert.deepStrictEqual(byLabel, [': LONG', ': REAL'],
            `expected one type hint per distinct implicit var; got ${JSON.stringify(byLabel)}`);
    });

    test('parameter-name hints at a same-file MAP procedure call', () => {
        const src = [
            '  PROGRAM',
            '  MAP',
            'Save PROCEDURE(STRING pName, LONG pFlags)',
            '  END',
            '  CODE',
            "  Save('report', 3)",
        ].join('\n');
        const { doc, tokens } = build(src);
        const hints = provider.provideInlayHints(doc, fullRange(src), tokens);
        const paramHints = hints.filter(h => label(h.label).trim().endsWith(':')).map(h => label(h.label).trim());
        assert.ok(paramHints.includes('pName:'), `expected pName: hint; got ${JSON.stringify(paramHints)}`);
        assert.ok(paramHints.includes('pFlags:'), `expected pFlags: hint; got ${JSON.stringify(paramHints)}`);
    });

    test('does not emit parameter-name hints for overloaded procedures', () => {
        const src = [
            '  PROGRAM',
            '  MAP',
            'Set PROCEDURE(STRING s)',
            'Set PROCEDURE(LONG n)',
            '  END',
            '  CODE',
            "  Set('x')",
        ].join('\n');
        const { doc, tokens } = build(src);
        const hints = provider.provideInlayHints(doc, fullRange(src), tokens);
        assert.strictEqual(hints.filter(h => label(h.label).trim().endsWith(':')).length, 0,
            'overloaded call should not get parameter-name hints (ambiguous)');
    });
});
