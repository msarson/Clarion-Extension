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
 *
 * A second, pre-existing gap surfaced alongside it: a Clarion label must start at column 0
 * (confirmed against the real compiler elsewhere in this codebase), but the regex this
 * resolver used to recognise a procedure implementation line accepted leading whitespace,
 * so an indented, non-compiling label still produced a full procedure card - whether or
 * not it had a MAP prototype.
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

    function moduleDoc(indentLabels = false): TextDocument {
        const label = (name: string) => (indentLabels ? ' ' : '') + name;
        const p = path.join(tmpRoot, indentLabels ? 'module-indented.clw' : 'module.clw');
        const content = [
            '  MEMBER()',
            "  INCLUDE('shared.inc'),ONCE",
            '    MAP',
            '        Helper(),LONG',
            '    END',
            '',
            `${label('Helper')}        PROCEDURE()`,
            '  CODE',
            '  RETURN 1',
            '',
            `${label('Worker')}        PROCEDURE`,
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
    const INDENT_CHAR = 3; // cursor lands inside the name after the extra leading space

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

    async function hoverWithMapIncludedPrototype(incName: string, incLines: string[]): Promise<string> {
        fs.writeFileSync(path.join(tmpRoot, incName), [...incLines, ''].join('\r\n'));
        const p = path.join(tmpRoot, `mod-${path.parse(incName).name}.clw`);
        const content = [
            '  MEMBER()',
            '  MAP',
            `    INCLUDE('${incName}')`,
            '  END',
            'Worker        PROCEDURE',
            '  CODE',
            '',
        ].join('\r\n');
        fs.writeFileSync(p, content);
        const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content);
        return hoverText(await new HoverProvider().provideHover(doc, { line: 4, character: 2 }));
    }

    test('a bare prototype in a file INCLUDEd inside the MAP keeps its declaration card', async () => {
        const text = await hoverWithMapIncludedPrototype('protos.inc', [
            'Worker        PROCEDURE',
        ]);

        assert.ok(text.includes('**Worker**'), `expected the Worker card, got:\n${text}`);
        assert.ok(text.includes('protos.inc:1'), `expected a link to the prototype in protos.inc, got:\n${text}`);
        assert.ok(!text.includes('No MAP prototype found'), `a prototype reached through the MAP's INCLUDE must not be reported missing, got:\n${text}`);
    });

    test('a MODULE-block prototype in a file INCLUDEd inside the MAP keeps its declaration card', async () => {
        const text = await hoverWithMapIncludedPrototype('modprotos.inc', [
            "  MODULE('worker.clw')",
            'Worker        PROCEDURE',
            '  END',
        ]);

        assert.ok(text.includes('**Worker**'), `expected the Worker card, got:\n${text}`);
        assert.ok(text.includes('modprotos.inc:2'), `expected a link to the prototype in modprotos.inc, got:\n${text}`);
        assert.ok(!text.includes('No MAP prototype found'), `a prototype reached through the MAP's INCLUDE must not be reported missing, got:\n${text}`);
    });

    test('an indented, non-compiling label (no MAP entry) is not answered as a procedure', async () => {
        // Falls through to the unrelated, pre-existing global-EQUATE match this PR does not
        // touch (see the PR description's Scope section) - this only pins down that the
        // resolver itself no longer claims an indented line is a valid procedure.
        const text = hoverText(await new HoverProvider().provideHover(moduleDoc(true), { line: WORKER_LINE, character: INDENT_CHAR }));
        assert.ok(!text.includes('(Procedure)'), `an indented label cannot legally declare a procedure, got:\n${text}`);
        assert.ok(!text.includes('No MAP prototype found'), `the missing-prototype note is specific to a real procedure, got:\n${text}`);
    });

    test('an indented, non-compiling label (has a MAP entry) is not answered as a procedure either', async () => {
        const hover = await new HoverProvider().provideHover(moduleDoc(true), { line: HELPER_LINE, character: INDENT_CHAR });
        assert.strictEqual(hover, null, `an indented label cannot legally declare a procedure, got:\n${hoverText(hover)}`);
    });
});
