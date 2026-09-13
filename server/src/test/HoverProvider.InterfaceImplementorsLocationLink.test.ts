import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

/**
 * HoverProvider.buildInterfaceHover()'s "classes implement this interface in
 * this file" footer used to hand-build each entry as `` `label` (line N) ``
 * plain text instead of calling HoverFormatter.locationLink() — unlike every
 * other declaration hover, which already renders a clickable footer.
 *
 * Fixture is the same CSocketConn/IConn shape InterfaceFeatures.test.ts's
 * "IMPLEMENTS references" suite already uses.
 */
const CODE = [
    'IConn  INTERFACE,TYPE',                                            // line 0
    '  CloseSocket  PROCEDURE',                                         // line 1
    'END',                                                              // line 2
    '',                                                                 // line 3
    "CSocketConn  CLASS,IMPLEMENTS(IConn),TYPE,MODULE('test.clw')",     // line 4
    '  CloseSocket  PROCEDURE,VIRTUAL',                                 // line 5
    'END',                                                              // line 6
].join('\n');

const URI = 'file:///implementors-link-test.clw';

suite('HoverProvider — INTERFACE implementors footer is a clickable link', () => {
    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });

    function makeDoc(): TextDocument {
        const doc = TextDocument.create(URI, 'clarion', 1, CODE);
        TokenCache.getInstance().getTokens(doc);
        return doc;
    }

    test('implementing class is listed as [file:line](file:///...#Lline), not plain text', async () => {
        const doc = makeDoc();
        const provider = new HoverProvider();

        // Cursor on "IConn" in "IConn  INTERFACE,TYPE" (line 0) — hovering the
        // interface's own declaration triggers buildInterfaceHover with the
        // implementors footer.
        const hover = await provider.provideHover(doc, { line: 0, character: 2 });

        assert.ok(hover, 'expected a hover card for the INTERFACE');
        const contents = (hover as { contents: { value?: string } | string }).contents;
        const text = typeof contents === 'string' ? contents : (contents.value ?? '');

        assert.ok(text.includes('CSocketConn'),
            `footer must name the implementing class; got:\n${text}`);
        const expectedLink = `[implementors-link-test.clw:5](${URI}#L5)`;
        assert.ok(text.includes(expectedLink),
            `implementor location must be a clickable markdown link, not plain text; got:\n${text}`);
    });
});
