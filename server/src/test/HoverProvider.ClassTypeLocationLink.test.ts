import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';

/**
 * HoverProvider._checkClassTypeHoverInternal (the bare type-name hover, e.g.
 * hovering `LinesGroupType` in `LIKE(LinesGroupType)`) used to hand-build its
 * "Defined in" footer as `${fileName} at line ${line}` plain text, with a
 * "(F12 to navigate to definition)" hint standing in for the missing link —
 * unlike every other declaration hover, which already uses
 * HoverFormatter.locationLink() to render a clickable footer. Fixed to call
 * locationLink() too; the now-redundant F12 hint is dropped since the location
 * links directly.
 *
 * Fixture mirrors HoverTypeIncludeChain.test.ts's disk-based #184 setup: a
 * loose `.clw` (no solution loaded) that INCLUDEs a `.inc` declaring a TYPE.
 */
let tmpRoot = '';
let savedSm: unknown;

suite('HoverProvider — bare type-name hover "Defined in" footer is a clickable link', () => {
    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'classtype-link-'));
        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = null;
        StructureDeclarationIndexer.getInstance().clearCache();
        TokenCache.getInstance().clearAllTokens();

        fs.writeFileSync(path.join(tmpRoot, 'types.inc'), [
            'LinesGroupType  CLASS,TYPE',
            'count             LONG',
            '                END',
            '',
        ].join('\n'));
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
        StructureDeclarationIndexer.getInstance().clearCache();
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test('"Defined in" footer renders as [file:line](file:///...#Lline), not plain text', async () => {
        const consumerPath = path.join(tmpRoot, 'consumer.clw');
        const consumerContent = [
            '  MEMBER()',
            "  INCLUDE('types.inc'),ONCE",
            '',
        ].join('\n');
        fs.writeFileSync(consumerPath, consumerContent);
        const uri = `file:///${consumerPath.replace(/\\/g, '/')}`;
        const doc = TextDocument.create(uri, 'clarion', 1, consumerContent);
        TokenCache.getInstance().getTokens(doc);

        const provider = new HoverProvider();
        // skipIncludeCheck=true: this test is about the footer's link shape, not
        // the separate include-verification guard.
        const hover = await (provider as unknown as {
            checkClassTypeHover(word: string, document: TextDocument, skipIncludeCheck?: boolean): Promise<{ contents: { value: string } } | null>;
        }).checkClassTypeHover('LinesGroupType', doc, true);

        assert.ok(hover, 'expected a hover card for the type');
        const text = hover!.contents.value;
        assert.ok(/\[types\.inc:1\]\(file:\/\/\/.*types\.inc#L1\)/i.test(text),
            `"Defined in" location must be a clickable markdown link, not plain text; got: ${text}`);
        assert.ok(!/F12/.test(text),
            `redundant F12 hint should be dropped now the location links directly; got: ${text}`);
    });
});
