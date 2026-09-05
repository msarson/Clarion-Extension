import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { BuiltinFunctionService } from '../utils/BuiltinFunctionService';
import * as builtinsData from '../data/clarion-builtins.json';

/**
 * clarion-builtins.json is authored in two shapes: the documented
 * `params`/`description`-per-signature shape, and an alternate
 * `parameters`/`documentation` shape used by the later doc-import batches
 * (INRANGE, INLIST, CHOICE, RUN, POPUP, …).
 *
 * BuiltinFunctionService used to read only the first shape, so every entry in
 * the second one produced a signature with zero parameters and an undefined
 * description — hover rendered `**Keyword: inrange**` followed by the literal
 * string "undefined". These tests pin the normalization.
 */
suite('Built-in signature shape normalization', () => {
    function hoverText(hover: any): string {
        return typeof hover.contents === 'string'
            ? hover.contents
            : 'value' in hover.contents ? hover.contents.value : '';
    }

    test('INRANGE hovers as a built-in function with its parameters and description', async () => {
        const provider = new HoverProvider();
        const tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();

        const code = `MyProc PROCEDURE()
r LONG
x LONG
CODE
  IF inrange(x, 0, 10)
    r = 1
  END
  RETURN`;
        const doc = TextDocument.create('test://inrange.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(4, 8));
        assert.ok(hover, 'INRANGE should produce a hover');

        const content = hoverText(hover);
        assert.ok(content.includes('Built-in Function'), `expected a built-in card, got: ${content}`);
        assert.ok(!content.includes('undefined'), `hover leaked "undefined": ${content}`);
        assert.ok(content.includes('inclusive range'), 'should render the authored description');
        assert.ok(content.includes('expression'), 'should list the expression parameter');

        tokenCache.clearAllTokens();
    });

    test('every built-in yields signatures with a non-empty description', () => {
        const service = BuiltinFunctionService.getInstance();
        const data = builtinsData as unknown as { functions: { name: string }[] };

        const broken: string[] = [];
        for (const func of data.functions) {
            for (const sig of service.getSignatures(func.name)) {
                const doc = sig.documentation;
                const value = typeof doc === 'string' ? doc : doc?.value;
                if (!value) {
                    broken.push(func.name);
                    break;
                }
            }
        }

        assert.deepStrictEqual(broken, [], `built-ins with an empty signature description: ${broken.join(', ')}`);
    });

    test('alternate-shape entries expose their parameters', () => {
        const service = BuiltinFunctionService.getInstance();

        // INRANGE(expression, low, high) and INLIST(searchstring, liststring...)
        // are both authored in the alternate shape.
        const inrange = service.getSignatures('INRANGE');
        assert.strictEqual(inrange.length, 1);
        assert.deepStrictEqual(
            inrange[0].parameters?.map(p => p.label),
            ['expression', 'low', 'high']
        );

        const inlist = service.getSignatures('INLIST');
        assert.ok(inlist[0].parameters && inlist[0].parameters.length > 0, 'INLIST should expose parameters');
    });
});
