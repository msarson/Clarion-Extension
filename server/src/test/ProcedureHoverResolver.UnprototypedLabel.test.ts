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
 * Hover on the label of a procedure implementation that has no MAP prototype.
 *
 * With no prototype to show and the cursor already on the implementation, the procedure
 * card had nothing to add after its header, so no card was built and the hover fell through
 * to the variable tiers. Those match the bare name against anything reachable, and an
 * EQUATE of the same name in an INCLUDEd file (here an ITEMIZE entry) was presented as the
 * word under the cursor.
 */

let tmpRoot = '';
let savedSm: SolutionManager | null = null;

function hoverText(hover: any): string {
    if (!hover) return '';
    return typeof hover.contents === 'string'
        ? hover.contents
        : 'value' in hover.contents ? hover.contents.value : '';
}

suite('Procedure label hover without a MAP prototype', () => {

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'unprototyped-proc-'));
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = null;
        StructureDeclarationIndexer.getInstance().clearCache();
        TokenCache.getInstance().clearAllTokens();

        fs.writeFileSync(path.join(tmpRoot, 'shared.inc'), [
            '  ITEMIZE',
            'Worker    EQUATE',
            'Other     EQUATE',
            '  END',
            '',
        ].join('\r\n'));
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        savedSm = null;
        StructureDeclarationIndexer.getInstance().clearCache();
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    function moduleDoc(): TextDocument {
        const p = path.join(tmpRoot, 'module.clw');
        const content = [
            '  MEMBER()',
            "  INCLUDE('shared.inc'),ONCE",
            '    MAP',
            '        Helper(),LONG',
            '    END',
            '',
            'Helper        PROCEDURE()',
            '  CODE',
            '  RETURN 1',
            '',
            'Worker        PROCEDURE',
            'Count           LONG',
            '  CODE',
            '  Count = Helper()',
            '',
        ].join('\r\n');
        fs.writeFileSync(p, content);
        return TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content);
    }

    const WORKER_LINE = 10;
    const HELPER_LINE = 6;

    test('the label answers as the procedure, not a same-named EQUATE from an include', async () => {
        const text = hoverText(await new HoverProvider().provideHover(moduleDoc(), { line: WORKER_LINE, character: 2 }));

        assert.ok(text.includes('**Worker**'), `expected the Worker card, got:\n${text}`);
        assert.ok(text.includes('Procedure'), `expected a procedure card, got:\n${text}`);
        assert.ok(!text.includes('EQUATE'), `the include's EQUATE must not answer for the label, got:\n${text}`);
        assert.ok(text.includes('No MAP prototype found'), `expected the missing-prototype note, got:\n${text}`);
    });

    test('a prototyped procedure label keeps its MAP declaration card', async () => {
        const text = hoverText(await new HoverProvider().provideHover(moduleDoc(), { line: HELPER_LINE, character: 2 }));

        assert.ok(text.includes('**Helper**'), `expected the Helper card, got:\n${text}`);
        assert.ok(text.includes('Helper(),LONG'), `expected the MAP prototype preview, got:\n${text}`);
        assert.ok(!text.includes('No MAP prototype found'), `a prototyped procedure must not carry the note, got:\n${text}`);
    });
});
