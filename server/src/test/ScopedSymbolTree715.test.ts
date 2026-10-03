import * as assert from 'assert';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { TokenType } from '../ClarionTokenizer';
import { setServerInitialized } from '../serverState';
import { ClarionDocumentSymbol, ClarionDocumentSymbolProvider } from '../providers/ClarionDocumentSymbolProvider';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';

/**
 * #715 step 3 — a local-variable lookup built the symbol tree of the whole document after every
 * edit (about 85 ms on a 60k-line module that is one giant procedure), to search one procedure's
 * declarations. It now builds the procedure from its data sections only: its own (header to
 * CODE) and each ROUTINE's DATA section. The procedure symbol it searches must be the same one
 * the whole-document tree gives, down to every descendant.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { syntheticModuleText } = require(path.join(__dirname, '..', '..', '..', '..', 'scripts', 'perf', 'synthetic-module.js'));

const flatten = (s: ClarionDocumentSymbol | null): string[] => {
    if (!s) return ['(none)'];
    const out: string[] = [];
    const walk = (x: ClarionDocumentSymbol, depth: number) => {
        out.push(`${depth}|${x.kind}|${x.name}|${x.range.start.line}-${x.range.end.line}|${x._clarionVarName ?? ''}|${(x._possibleReferences ?? []).join(',')}`);
        for (const c of x.children ?? []) walk(c as ClarionDocumentSymbol, depth + 1);
    };
    walk(s, 0);
    return out;
};

suite('#715 the local-variable lookup builds only the procedure it searches', function () {
    this.timeout(120000);
    suiteSetup(() => setServerInitialized(true));

    for (const [shape, lines] of [['procedures', 3000], ['giant', 6000]] as const) {
        test(`every procedure of the ${shape} module: the scoped symbol equals the whole-document one`, () => {
            const text: string = syntheticModuleText(lines, { shape });
            const doc = TextDocument.create(`file:///c%3A/scoped715/${shape}.clw`, 'clarion', 1, text);
            const cache = TokenCache.getInstance();
            const tokens = cache.getTokens(doc);
            const finder = new SymbolFinderService(cache, new ScopeAnalyzer(cache, undefined as never));
            const internals = finder as unknown as {
                findProcedureContainingLine(symbols: ClarionDocumentSymbol[], line: number): ClarionDocumentSymbol | null;
                scopedProcedureSymbol(tokens: unknown, document: TextDocument, line: number): ClarionDocumentSymbol | null | undefined;
            };
            const full = new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, doc.uri, doc);
            const procedures = tokens.filter(t => t.subType === TokenType.GlobalProcedure || t.subType === TokenType.Procedure || t.subType === TokenType.MethodImplementation);
            assert.ok(procedures.length >= 12, `found ${procedures.length} procedures`);
            let compared = 0;
            for (const proc of procedures) {
                // a line in the data section, one just after CODE, and the procedure's last line
                for (const line of [proc.line + 2, (proc.executionMarker?.line ?? proc.line) + 1, (proc.finishesAt ?? proc.line) - 1]) {
                    const expected = flatten(internals.findProcedureContainingLine(full, line));
                    const scoped = internals.scopedProcedureSymbol(tokens, doc, line);
                    assert.notStrictEqual(scoped, undefined, `line ${line}: fell back to the whole-document tree`);
                    assert.deepStrictEqual(flatten(scoped ?? null), expected, `${proc.value} line ${line}`);
                    compared++;
                }
            }
            assert.ok(compared > 0);
            cache.clearTokens(doc.uri);
        });
    }
});
