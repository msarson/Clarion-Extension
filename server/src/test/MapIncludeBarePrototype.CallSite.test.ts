import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { createF12Resolver } from '../providers/diagnostics/UnresolvedProcedureCallDiagnostics';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';

/**
 * #649 — a call to a procedure whose prototype is bare (not in a MODULE block) in a file
 * INCLUDEd inside a MAP. The INCLUDE puts the file's text into that MAP, so the prototype
 * belongs to a procedure of the module whose MAP it is. The include walk (#313) accepted
 * only MODULE-block prototypes at the call site, so hover answered from the variable tier,
 * F12 landed on the implementation, Go to Implementation found nothing and the
 * unresolved-call diagnostic reported the call.
 */

let tmpRoot = '';
let savedSm: SolutionManager | null = null;

function write(name: string, lines: string[]): string {
    const p = path.join(tmpRoot, name);
    fs.writeFileSync(p, [...lines, ''].join('\r\n'));
    return p;
}

function open(p: string): TextDocument {
    return TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, fs.readFileSync(p, 'utf8'));
}

function hoverText(hover: any): string {
    if (!hover) return '';
    return typeof hover.contents === 'string' ? hover.contents : hover.contents.value ?? '';
}

function target(location: any): { file: string; line: number } | null {
    const l = Array.isArray(location) ? location[0] : location;
    if (!l) return null;
    const uri: string = l.uri ?? l.targetUri;
    const range = l.range ?? l.targetSelectionRange;
    return { file: path.basename(decodeURIComponent(uri)).toLowerCase(), line: range.start.line };
}

// The module calls Worker on line 8; Worker is implemented on line 4.
const MODULE_LINES = [
    '  MEMBER()',
    '  MAP',
    "    INCLUDE('protos.inc')",
    '  END',
    'Worker        PROCEDURE',      // 4
    '  CODE',
    'Caller        PROCEDURE',
    '  CODE',
    '  Worker()',                   // 8
];
const CALL = { line: 8, character: 4 };

suite('#649 call to a bare prototype in a MAP-included file', () => {

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'map-include-bare-'));
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = null;
        StructureDeclarationIndexer.getInstance().clearCache();
        TokenCache.getInstance().clearAllTokens();
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        savedSm = null;
        StructureDeclarationIndexer.getInstance().clearCache();
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test('hover links the prototype and the implementation', async () => {
        write('protos.inc', ['Worker        PROCEDURE']);
        const doc = open(write('mod.clw', MODULE_LINES));
        const text = hoverText(await new HoverProvider().provideHover(doc, CALL));
        assert.ok(/\[protos\.inc:1\]\([^)]*\) → \[mod\.clw:5\]/.test(text), `expected protos.inc:1 → mod.clw:5, got:\n${text}`);
    });

    test('F12 goes to the prototype', async () => {
        write('protos.inc', ['Worker        PROCEDURE']);
        const doc = open(write('mod.clw', MODULE_LINES));
        const t = target(await new DefinitionProvider().provideDefinition(doc, CALL));
        assert.deepStrictEqual(t, { file: 'protos.inc', line: 0 });
    });

    test('Go to Implementation goes to the procedure', async () => {
        write('protos.inc', ['Worker        PROCEDURE']);
        const doc = open(write('mod.clw', MODULE_LINES));
        const t = target(await new ImplementationProvider().provideImplementation(doc, CALL as any));
        assert.deepStrictEqual(t, { file: 'mod.clw', line: 4 });
    });

    test('the unresolved-call check resolves the call', async () => {
        write('protos.inc', ['Worker        PROCEDURE']);
        const doc = open(write('mod.clw', MODULE_LINES));
        const tokens = TokenCache.getInstance().getTokens(doc);
        assert.strictEqual(await createF12Resolver(tokens, doc)('Worker'), 'resolved');
    });

    test('included in the MEMBER parent\'s MAP, the procedure is the parent\'s', async () => {
        write('protos.inc', ['Worker        PROCEDURE']);
        write('prog.clw', [
            '  PROGRAM',
            '  MAP',
            "    INCLUDE('protos.inc')",
            '  END',
            '  CODE',
            '  RETURN',
            'Worker        PROCEDURE',  // 6
            '  CODE',
        ]);
        const doc = open(write('mod.clw', [
            "  MEMBER('prog.clw')",
            'Caller        PROCEDURE',
            '  CODE',
            '  Worker()',               // 3
        ]));
        const call = { line: 3, character: 4 };
        const impl = target(await new ImplementationProvider().provideImplementation(doc, call as any));
        assert.deepStrictEqual(impl, { file: 'prog.clw', line: 6 });
        const def = target(await new DefinitionProvider().provideDefinition(doc, call));
        assert.deepStrictEqual(def, { file: 'protos.inc', line: 0 });
        const text = hoverText(await new HoverProvider().provideHover(doc, call));
        assert.ok(/\[protos\.inc:1\]\([^)]*\) → \[prog\.clw:7\]/.test(text), `expected protos.inc:1 → prog.clw:7, got:\n${text}`);
    });

    test('a MODULE-block prototype in the included file is unchanged', async () => {
        write('protos.inc', ["  MODULE('mod.clw')", 'Worker        PROCEDURE', '  END']);
        const doc = open(write('mod.clw', MODULE_LINES));
        const text = hoverText(await new HoverProvider().provideHover(doc, CALL));
        assert.ok(/\[protos\.inc:2\]\([^)]*\) → \[mod\.clw:5\]/.test(text), `expected protos.inc:2 → mod.clw:5, got:\n${text}`);
        assert.deepStrictEqual(target(await new DefinitionProvider().provideDefinition(doc, CALL)), { file: 'protos.inc', line: 1 });
        assert.deepStrictEqual(target(await new ImplementationProvider().provideImplementation(doc, CALL as any)), { file: 'mod.clw', line: 4 });
    });
});
