import { DocumentSymbol } from 'vscode-languageserver-protocol';

/**
 * The slice of {@link SymbolElementRegistry} the visibility walk needs. Declared
 * structurally so this module stays free of the `vscode` API and can be unit
 * tested in plain mocha (per the repo's vscode-API-free client test convention).
 */
export interface SymbolVisibilityRegistry {
    getElementKey(element: DocumentSymbol): string;
    setVisible(symbolKey: string, visible: boolean): void;
    getAllKeys(): string[];
}

/** Case-insensitive substring test. An empty filter matches everything. */
export function substringMatch(text: string, filter: string): boolean {
    return text.toLowerCase().indexOf(filter.toLowerCase()) !== -1;
}

/**
 * Marks each symbol's visibility against the Structure View's filter box.
 *
 * A symbol is visible when it matches the filter by NAME, when an ancestor
 * matched, or when a descendant matched — so filtering on `DoWork` shows the
 * `DoWork` procedure, everything declared inside it, and (for a nested hit) the
 * chain of parents needed to reach it.
 *
 * The subtree half of that used to happen by accident. Every variable carried a
 * `detail` of `in <Parent>`, and the old walk matched `name` OR `detail`, so a
 * procedure's locals matched on their parent's name via that string. #418/#426
 * dropped the `in <Parent>` detail as redundant display text, which would have
 * silently narrowed this filter to name-only matches. Propagating an ancestor
 * match down the tree restores the behaviour deliberately, and no longer matches
 * an unrelated variable just because its parent's name contains the filter text.
 *
 * Also drops the previous `symbolOrDescendantsMatch` helper, which re-walked the
 * whole subtree at every node (quadratic) to compute what this single pass gets
 * from its own recursion.
 *
 * Mutates visibility state on `registry`; it does not reorder or copy symbols.
 */
export function markSymbolVisibility(
    symbols: DocumentSymbol[],
    filterText: string,
    registry: SymbolVisibilityRegistry
): void {
    if (!symbols || symbols.length === 0) {
        return;
    }

    const normalizedFilter = filterText.toLowerCase();

    // Reset every known key first: a symbol that has dropped out of the tree
    // since the last filter must not keep a stale `true`.
    registry.getAllKeys().forEach(key => registry.setVisible(key, false));

    const mark = (symbol: DocumentSymbol, ancestorMatched: boolean): boolean => {
        const key = registry.getElementKey(symbol);
        const selfMatches = ancestorMatched || substringMatch(symbol.name, normalizedFilter);

        let hasVisibleChild = false;
        if (symbol.children && symbol.children.length > 0) {
            for (const child of symbol.children) {
                // Not short-circuited: every descendant still needs its own flag set.
                if (mark(child, selfMatches)) {
                    hasVisibleChild = true;
                }
            }
        }

        const isVisible = selfMatches || hasVisibleChild;
        registry.setVisible(key, isVisible);
        return isVisible;
    };

    for (const symbol of symbols) {
        mark(symbol, false);
    }
}
