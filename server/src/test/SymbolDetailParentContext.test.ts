import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { setServerInitialized } from '../serverState';

/**
 * #418 — document symbols no longer carry the redundant "in <Parent>" detail.
 *
 * The detail was set at three sites in ClarionDocumentSymbolProvider: on every variable as it was
 * created, again once its real parent was known, and as a last resort in addSymbolToParent() for a
 * symbol that arrived with no detail of its own. The tree, the breadcrumb dropdown and
 * WorkspaceSymbolProvider (which derives its own containerName from the parent's name) all already
 * carry the parent, so the text only ever repeated what was on screen.
 *
 * What must NOT change: the details that mean something — "Method Implementation",
 * "Global Procedure", describeSubType() — and the method-detection path in addSymbolToParent(),
 * which reads symbol.detail?.includes("Method") to route methods into the Methods container.
 */
suite('#418 - redundant "in <Parent>" symbol detail', () => {

    setup(() => {
        setServerInitialized(true);
    });

    const code = `
MyClass       CLASS,TYPE
Counter         LONG
Init            PROCEDURE(LONG pId)
Kill            PROCEDURE
              END

MyClass.Init  PROCEDURE(LONG pId)
LocalCount      LONG
Settings        GROUP,PRE(SET)
Timeout           LONG
              END
Win             WINDOW('Test'),AT(,,200,100)
                  ENTRY(@s20),AT(10,10,80,10)
                END
  CODE
  SELF.Counter = pId

MyClass.Kill  PROCEDURE
  CODE
  RETURN

MyGlobalProc  PROCEDURE()
GlobalLocal     STRING(20)
  CODE
  RETURN
    `.trim();

    function buildSymbols(): ClarionDocumentSymbol[] {
        const tokens = new ClarionTokenizer(code).tokenize();
        return new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://in-parent.clw');
    }

    /** Every symbol in the tree, flattened, each paired with the path that reaches it. */
    function flatten(symbols: ClarionDocumentSymbol[], path: string = ''): Array<{ symbol: ClarionDocumentSymbol, path: string }> {
        const all: Array<{ symbol: ClarionDocumentSymbol, path: string }> = [];
        for (const symbol of symbols) {
            const here = path ? `${path} > ${symbol.name}` : symbol.name;
            all.push({ symbol, path: here });
            if (symbol.children && symbol.children.length > 0) {
                all.push(...flatten(symbol.children as ClarionDocumentSymbol[], here));
            }
        }
        return all;
    }

    function find(symbols: ClarionDocumentSymbol[], name: string): ClarionDocumentSymbol | undefined {
        return flatten(symbols).find(entry => entry.symbol.name === name || entry.symbol.name.startsWith(`${name} `))?.symbol;
    }

    test('no symbol anywhere in the tree carries an "in <Parent>" detail', () => {
        const offenders = flatten(buildSymbols())
            .filter(entry => /^in\s/i.test(entry.symbol.detail ?? ''))
            .map(entry => `${entry.path} → detail="${entry.symbol.detail}"`);

        assert.deepStrictEqual(offenders, [],
            `No symbol should carry parent context in its detail, but found:\n  ${offenders.join('\n  ')}`);
    });

    test('a USE-less WINDOW control carries no detail either (the addSymbolToParent fallback)', () => {
        // ENTRY maps to SymbolKind.Variable and USE() is optional, so this was the one symbol that
        // actually reached the addSymbolToParent() fallback with an empty detail.
        const entry = find(buildSymbols(), 'ENTRY(@s20)');

        assert.ok(entry, 'Should find the USE-less ENTRY control');
        assert.strictEqual(entry.detail ?? '', '', `USE-less ENTRY should have no detail, got "${entry.detail}"`);
    });

    test('variables keep the type information consumers actually read', () => {
        // HoverProvider and SymbolFinderService read `_clarionType || detail` — dropping the detail
        // must not touch the first half of that, or a variable's hover loses its type.
        const localCount = find(buildSymbols(), 'LocalCount');

        assert.ok(localCount, 'Should find LocalCount');
        assert.strictEqual(localCount.detail ?? '', '', `LocalCount should have no detail, got "${localCount.detail}"`);
        assert.strictEqual((localCount as any)._clarionType?.toUpperCase(), 'LONG',
            `LocalCount should still know its type, got "${(localCount as any)._clarionType}"`);
    });

    test('the details that mean something are untouched', () => {
        const symbols = buildSymbols();

        const init = find(symbols, 'MyClass.Init');
        assert.ok(init, 'Should find the MyClass.Init implementation');
        assert.strictEqual(init.detail, 'Method Implementation',
            `MyClass.Init should still read "Method Implementation", got "${init.detail}"`);

        const globalProc = find(symbols, 'MyGlobalProc');
        assert.ok(globalProc, 'Should find MyGlobalProc');
        assert.strictEqual(globalProc.detail, 'Global Procedure',
            `MyGlobalProc should still read "Global Procedure", got "${globalProc.detail}"`);
    });

    test('method detection still routes declarations under their class', () => {
        // addSymbolToParent() classifies with symbol.detail?.includes("Method") — the one reader of
        // `detail` that drives structure rather than display. It keys off "Method Implementation"
        // and describeSubType()'s "Method (...)", never off the parent context, so the routing has
        // to survive: both declarations stay under the CLASS, and the implementation's own locals
        // stay under the implementation.
        const paths = flatten(buildSymbols()).map(entry => entry.path);

        assert.ok(paths.some(p => /^CLASS \(MyClass\) > Init$/.test(p)),
            `Init should still be routed under the CLASS, tree was:\n  ${paths.join('\n  ')}`);
        assert.ok(paths.some(p => /^CLASS \(MyClass\) > Kill$/.test(p)),
            `Kill should still be routed under the CLASS, tree was:\n  ${paths.join('\n  ')}`);
        assert.ok(paths.some(p => /^MyClass\.Init .* > LocalCount LONG$/.test(p)),
            `LocalCount should still hang off the method implementation, tree was:\n  ${paths.join('\n  ')}`);
    });

    test('method declarations keep their signature as detail', () => {
        const init = flatten(buildSymbols()).find(entry => entry.path === 'CLASS (MyClass) > Init')?.symbol;

        assert.ok(init, 'Should find the Init declaration under the CLASS');
        assert.ok((init.detail ?? '').includes('LONG pId'),
            `Init's declaration detail should still be its signature, got "${init.detail}"`);
    });
});
