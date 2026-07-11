import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import ClarionFoldingProvider from '../ClarionFoldingProvider';

/**
 * #259 — folding must never mutate the shared cached tokens.
 *
 * The provider used to assign `token.finishesAt` in a "finishesAt inference"
 * fallback — a cross-provider contamination channel (TokenCache's incremental
 * expandToDependencies READS finishesAt to decide re-tokenize scope). The
 * fallback turned out to be unreachable dead code (its gate required a subType
 * that is never assigned) and was deleted. This sentinel pins the invariant so
 * a future folding change can't silently reintroduce shared-token writes:
 * only DocumentStructure.process() may mutate cached tokens.
 */
suite('ClarionFoldingProvider — no shared-token mutation (#259)', () => {

    test('computeFoldingRanges leaves every cached token field-identical', () => {
        const source = [
            '   PROGRAM',
            '   MAP',
            'Foo      PROCEDURE()',
            '   END',
            'MyGroup    GROUP',
            'Field1       STRING(10)',
            '           END',
            '   CODE',
            '   RETURN',
            '',
            'Foo      PROCEDURE()',
            'Local      LONG',
            '   CODE',
            'MyRoutine  ROUTINE',
            '   RETURN',
        ].join('\n');

        TokenCache.getInstance().clearAllTokens();
        const doc = TextDocument.create('file:///t259-fold.clw', 'clarion', 1, source);
        const tokens = TokenCache.getInstance().getTokens(doc);

        // Snapshot the mutation-prone scalar fields per token (by identity).
        const before = tokens.map(t => ({
            type: t.type, subType: t.subType, value: t.value,
            line: t.line, start: t.start, finishesAt: t.finishesAt, label: t.label
        }));

        const provider = new ClarionFoldingProvider(tokens, doc);
        const ranges = provider.computeFoldingRanges();
        assert.ok(ranges.length > 0, 'fixture precondition: folding produces ranges');

        tokens.forEach((t, i) => {
            const b = before[i];
            assert.strictEqual(t.finishesAt, b.finishesAt,
                `token '${t.value}'(L${t.line}) finishesAt mutated: ${b.finishesAt} → ${t.finishesAt}`);
            assert.strictEqual(t.type, b.type, `token '${t.value}' type mutated`);
            assert.strictEqual(t.subType, b.subType, `token '${t.value}' subType mutated`);
            assert.strictEqual(t.line, b.line, `token '${t.value}' line mutated`);
            assert.strictEqual(t.start, b.start, `token '${t.value}' start mutated`);
            assert.strictEqual(t.label, b.label, `token '${t.value}' label mutated`);
        });
    });
});
