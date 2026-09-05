import { describe, it } from 'mocha';
import * as assert from 'assert';
import { DocumentSymbol, SymbolKind, Range, Position } from 'vscode-languageserver-protocol';
import { SymbolElementRegistry } from '../utils/SymbolElementRegistry';
import { markSymbolVisibility, substringMatch } from '../utils/SymbolFilter';

/**
 * Structure View filter-box visibility.
 *
 * Before #418/#426 every variable carried a `detail` of `in <Parent>`, and the
 * filter matched `name` OR `detail` — so filtering on a procedure's name kept
 * its locals visible via that string. Dropping the redundant detail would have
 * silently narrowed the filter to name-only matches; `markSymbolVisibility`
 * propagates an ancestor match down its subtree instead, which is deliberate
 * rather than incidental and no longer matches an unrelated variable just
 * because its parent's name contains the filter text.
 */
describe('SymbolFilter — Structure View filter visibility', () => {

    let line = 0;
    function sym(name: string, kind: SymbolKind, children?: DocumentSymbol[], detail?: string): DocumentSymbol {
        const pos = Position.create(line++, 0);
        const s = DocumentSymbol.create(name, detail, kind, Range.create(pos, pos), Range.create(pos, pos));
        if (children) { s.children = children; }
        return s;
    }

    /** Builds a fresh tree + registry with every node registered. */
    function build() {
        line = 0;
        const counter = sym('Counter LONG', SymbolKind.Variable);
        const flag = sym('Flag BYTE', SymbolKind.Variable);
        const doWork = sym('DoWork', SymbolKind.Function, [counter, flag]);

        const other = sym('OtherLocal LONG', SymbolKind.Variable);
        const unrelated = sym('Unrelated', SymbolKind.Function, [other]);

        const roots = [doWork, unrelated];
        const registry = new SymbolElementRegistry();
        registry.trackHierarchy(roots);
        return { roots, registry, doWork, counter, flag, unrelated, other };
    }

    const visible = (registry: SymbolElementRegistry, s: DocumentSymbol) =>
        registry.isVisible(registry.getElementKey(s)) === true;

    it('a matching procedure keeps its own locals visible (the behaviour the "in <Parent>" detail used to give)', () => {
        const { roots, registry, doWork, counter, flag } = build();

        markSymbolVisibility(roots, 'DoWork', registry);

        assert.strictEqual(visible(registry, doWork), true, 'the matched procedure itself');
        assert.strictEqual(visible(registry, counter), true, 'its local Counter');
        assert.strictEqual(visible(registry, flag), true, 'its local Flag');
    });

    it('a non-matching sibling subtree stays hidden', () => {
        const { roots, registry, unrelated, other } = build();

        markSymbolVisibility(roots, 'DoWork', registry);

        assert.strictEqual(visible(registry, unrelated), false);
        assert.strictEqual(visible(registry, other), false);
    });

    it('a matching descendant keeps its ancestors visible, without dragging in its siblings', () => {
        const { roots, registry, doWork, counter, flag } = build();

        markSymbolVisibility(roots, 'Counter', registry);

        assert.strictEqual(visible(registry, counter), true, 'the match');
        assert.strictEqual(visible(registry, doWork), true, 'its parent, so the match is reachable');
        assert.strictEqual(visible(registry, flag), false, 'an unmatched sibling of the match');
    });

    it('does not consult detail — a variable whose parent name only appears in its detail stays hidden', () => {
        line = 0;
        const stale = sym('Counter LONG', SymbolKind.Variable, undefined, 'in DoWork');
        const holder = sym('Holder', SymbolKind.Function, [stale]);
        const registry = new SymbolElementRegistry();
        registry.trackHierarchy([holder]);

        markSymbolVisibility([holder], 'DoWork', registry);

        assert.strictEqual(visible(registry, stale), false, 'detail must not be matched');
        assert.strictEqual(visible(registry, holder), false);
    });

    it('is case-insensitive', () => {
        const { roots, registry, doWork, counter } = build();

        markSymbolVisibility(roots, 'dowork', registry);

        assert.strictEqual(visible(registry, doWork), true);
        assert.strictEqual(visible(registry, counter), true);
    });

    it('an empty filter shows everything', () => {
        const { roots, registry, doWork, counter, unrelated, other } = build();

        markSymbolVisibility(roots, '', registry);

        for (const s of [doWork, counter, unrelated, other]) {
            assert.strictEqual(visible(registry, s), true);
        }
    });

    it('clears stale visibility from a previous filter', () => {
        const { roots, registry, doWork, counter } = build();

        markSymbolVisibility(roots, 'DoWork', registry);
        assert.strictEqual(visible(registry, counter), true);

        markSymbolVisibility(roots, 'Unrelated', registry);
        assert.strictEqual(visible(registry, doWork), false, 'previously visible, must be cleared');
        assert.strictEqual(visible(registry, counter), false);
    });

    it('substringMatch is case-insensitive and treats an empty filter as a match', () => {
        assert.strictEqual(substringMatch('DoWork', 'work'), true);
        assert.strictEqual(substringMatch('DoWork', 'WORK'), true);
        assert.strictEqual(substringMatch('DoWork', ''), true);
        assert.strictEqual(substringMatch('DoWork', 'missing'), false);
    });
});
