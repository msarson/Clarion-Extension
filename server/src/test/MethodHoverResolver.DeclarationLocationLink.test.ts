import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

/**
 * resolveMethodDeclaration()'s "implementation found" footer must render as a CLICKABLE
 * markdown link via HoverFormatter.locationLink() — the same helper every other
 * declaration hover (class declaration, method call, chained call) already uses. It
 * previously hand-built `${file}:${line}` as plain text instead, so hovering a method
 * declaration showed its implementation location as dead text while a class-declaration
 * hover a few lines away in the same resolver was already clickable.
 *
 * The fixture lives on a REAL file on disk (not a `test://` URI) — locationLink only
 * produces a link for an openable `file:` URI (see HoverFormatter.LocationLink.test.ts),
 * so an in-memory-only document would make the link assertion below pass vacuously
 * regardless of whether the fix is present.
 */
const CLASS_WITH_IMPL = [
    'PROGRAM',
    '  MAP',
    '  END',
    '',
    'MyClass CLASS',
    'DoWork PROCEDURE',
    '  END',
    '',
    'MyClass.DoWork PROCEDURE',
    '  CODE',
    ''
].join('\n');

suite('MethodHoverResolver — declaration hover implementation footer is a clickable link', () => {
    let provider: HoverProvider;
    let tokenCache: TokenCache;
    let tmpRoot: string;

    suiteSetup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'method-decl-link-'));
    });

    suiteTeardown(() => {
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    setup(() => {
        provider = new HoverProvider();
        tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();
    });

    teardown(() => {
        tokenCache.clearAllTokens();
    });

    function hoverText(hover: any): string {
        if (!hover) return '';
        return typeof hover.contents === 'string'
            ? hover.contents
            : 'value' in hover.contents ? hover.contents.value : '';
    }

    test('implementation location renders as [file:line](file:///...#Lline), not plain text', async () => {
        const filePath = path.join(tmpRoot, 'class-with-impl.clw');
        fs.writeFileSync(filePath, CLASS_WITH_IMPL, 'utf8');
        const uri = `file:///${filePath.replace(/\\/g, '/')}`;
        const doc = TextDocument.create(uri, 'clarion', 1, CLASS_WITH_IMPL);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(5, 0)); // "DoWork" method declaration
        const content = hoverText(hover);

        assert.ok(!content.includes('Implementation not found'),
            `should resolve the implementation; got: ${content}`);

        const expectedLink = `[class-with-impl.clw:9](${uri}#L9)`;
        assert.ok(content.includes(expectedLink),
            `implementation footer must be a clickable markdown link, not plain text; got: ${content}`);
    });
});
