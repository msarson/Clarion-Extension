import * as assert from 'assert';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { syntheticModuleText } = require(path.join(__dirname, '..', '..', '..', '..', 'scripts', 'perf', 'synthetic-module.js'));

/**
 * #711 — a hover on an unchanged 60k-line module took 50-100 ms, nearly all of it a dozen walks over
 * every token in the document, each looking for the tokens of the ONE line under the cursor (is it a
 * comment, a string, an INCLUDE section, a file reference, a field equate...). A hover's work on the
 * token array must not grow with the document. Counted, not timed: a Proxy over the cached token
 * array counts every element read during a warm hover, at two sizes.
 */
suite('#711 a warm hover does not walk the whole token array', function () {
    this.timeout(120000);

    const readsForWarmHover = async (lines: number): Promise<number> => {
        setServerInitialized(true);
        const text: string = syntheticModuleText(lines);
        const doc = TextDocument.create(`file:///c%3A/t711/hover-${lines}.clw`, 'clarion', 1, text);
        const cache = TokenCache.getInstance();
        const tokens = cache.getTokens(doc);

        // A local read in the second procedure's CODE: `Loc:Total` on an assignment line.
        const textLines = text.split(/\r?\n/);
        let seen = 0;
        let at: Position | undefined;
        for (let i = 0; i < textLines.length && !at; i++) {
            const c = textLines[i].indexOf('Loc:Total +=');
            if (c >= 0 && ++seen === 2) at = Position.create(i, c + 3);
        }
        assert.ok(at, 'the synthetic module has a Loc:Total assignment');

        let reads = 0;
        const counted = new Proxy(tokens, {
            get(target, prop, receiver) {
                if (typeof prop === 'string' && /^\d+$/.test(prop)) reads++;
                return Reflect.get(target, prop, receiver);
            },
        });
        const entry = (cache as unknown as { cache: Map<string, { tokens: unknown }> }).cache;
        for (const e of entry.values()) if (e.tokens === tokens) e.tokens = counted;

        const provider = new HoverProvider();
        const first = await provider.provideHover(doc, at!);      // warm-up: per-version indexes
        assert.ok(first, 'the hover answers');
        reads = 0;
        await provider.provideHover(doc, at!);
        return reads;
    };

    test('bug-pin: four times the module costs a warm hover about the same token reads', async () => {
        const small = await readsForWarmHover(2000);
        const large = await readsForWarmHover(8000);
        const ratio = large / small;
        assert.ok(ratio < 2, `a warm hover read ${large} tokens at 8k lines, ${small} at 2k: ${ratio.toFixed(1)}x (a whole-document walk is ~4x)`);
    });
});
