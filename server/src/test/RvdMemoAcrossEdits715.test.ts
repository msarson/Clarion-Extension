import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { StructureDeclarationIndexer, StructureDeclarationInfo } from '../utils/StructureDeclarationIndexer';
import { validateDiscardedReturnValues, __resetRvdMemosForTest } from '../providers/diagnostics/ReturnValueDiagnostics';
import { setServerInitialized } from '../serverState';

/**
 * #715 item 2 — the discarded-return-value check memoized each receiver's type and each class's
 * members per document VERSION, so every edit re-resolved all of them: 56 receiver types and 12
 * class enumerations per pass, 2.2 s on a 61k-line generated module, which held the diagnostics of
 * an edit past a 3 s client deadline. Types and members depend on the document's declarations, not
 * on its executable code, so the memos now survive an edit that touches only code - and are
 * re-resolved when a declaration changes.
 */
let tmpDir: string;
const write = (name: string, lines: string[]) => { const p = path.join(tmpDir, name); fs.writeFileSync(p, lines.join('\n')); return p; };
const sdiEntry = (name: string, filePath: string): StructureDeclarationInfo =>
    ({ name, filePath, line: 0, structureType: 'CLASS', isType: false, lineContent: `${name} CLASS` } as StructureDeclarationInfo);
const discarded = (diags: { message: unknown; range: { start: { line: number } } }[]) => diags.filter(d => /is discarded/.test(String(d.message)));

suite('#715 the discarded-return-value memos survive an edit to code only', () => {
    let origFind: typeof StructureDeclarationIndexer.prototype.find;
    let origBuild: typeof StructureDeclarationIndexer.prototype.getOrBuildIndex;
    suiteSetup(() => { setServerInitialized(true); tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvd715_')); });
    suiteTeardown(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ } });
    setup(() => {
        origFind = StructureDeclarationIndexer.prototype.find;
        origBuild = StructureDeclarationIndexer.prototype.getOrBuildIndex;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = (async () => ({})) as unknown as typeof origBuild;
        __resetRvdMemosForTest();
    });
    teardown(() => {
        StructureDeclarationIndexer.prototype.find = origFind;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = origBuild;
        TokenCache.getInstance().clearAllTokens();
        __resetRvdMemosForTest();
    });

    function fixture(tag: string) {
        const longInc = write(`long${tag}.inc`, [`Long${tag}  CLASS,TYPE`, 'DoA            PROCEDURE(),LONG', '             END']);
        const procInc = write(`proc${tag}.inc`, [`Proc${tag}  CLASS,TYPE`, 'DoA            PROCEDURE(),LONG,PROC', '             END']);
        StructureDeclarationIndexer.prototype.find = ((name: string) => {
            const n = name.toLowerCase();
            if (n === `long${tag}`.toLowerCase()) return [sdiEntry(`Long${tag}`, longInc)];
            if (n === `proc${tag}`.toLowerCase()) return [sdiEntry(`Proc${tag}`, procInc)];
            return [];
        }) as typeof origFind;
        const lines = [
            "  MEMBER('prog.clw')",
            `  INCLUDE('long${tag}.inc'),ONCE`,
            `  INCLUDE('proc${tag}.inc'),ONCE`,
            '  MAP',
            '  END',
            `obj  Long${tag}`,
            'Caller PROCEDURE()',
            '  CODE',
            '  obj.DoA()',
        ];
        const uri = `file:///${path.join(tmpDir, `host${tag}.clw`).replace(/\\/g, '/')}`;
        fs.writeFileSync(path.join(tmpDir, `host${tag}.clw`), lines.join('\n'));
        return { lines, uri };
    }
    // A fresh locator per pass, as server.ts creates one per validation pass: only the RVD's own
    // module-level memos carry over, which is what this pins.
    const counts = { enumerations: 0, typeResolutions: 0 };
    function countingLocator(): MemberLocatorService {
        const locator = new MemberLocatorService();
        const en = locator.enumerateMembersInClass.bind(locator);
        locator.enumerateMembersInClass = ((...a: Parameters<MemberLocatorService['enumerateMembersInClass']>) => { counts.enumerations++; return en(...a); }) as MemberLocatorService['enumerateMembersInClass'];
        const rv = (locator as unknown as { resolveVariableType: (...a: unknown[]) => unknown });
        const origRv = rv.resolveVariableType.bind(locator);
        rv.resolveVariableType = (...a: unknown[]) => { counts.typeResolutions++; return origRv(...a); };
        return locator;
    }
    const pass = (uri: string, version: number, lines: string[]) => {
        const doc = TextDocument.create(uri, 'clarion', version, lines.join('\n'));
        return validateDiscardedReturnValues(TokenCache.getInstance().getTokens(doc), doc, countingLocator());
    };

    test('a statement typed in CODE, and Enter: nothing re-resolved, the warning moves with its line', async () => {
        const { lines, uri } = fixture('A');
        counts.enumerations = 0; counts.typeResolutions = 0;
        const first = discarded(await pass(uri, 1, lines));
        assert.strictEqual(first.length, 1, 'obj.DoA() returns LONG without PROC: one warning');
        assert.strictEqual(first[0].range.start.line, 8);
        const resolvedOnce = { ...counts };

        const edited = [...lines.slice(0, 8), '  ! a comment typed above the call', '  x# = 1', ...lines.slice(8)];
        const second = discarded(await pass(uri, 2, edited));
        assert.strictEqual(second.length, 1, 'the same warning after the edit');
        assert.strictEqual(second[0].range.start.line, 10, 'on the call, two lines further down');
        assert.deepStrictEqual(counts, resolvedOnce, `an edit to code re-resolved: ${JSON.stringify(counts)} after ${JSON.stringify(resolvedOnce)}`);
    });

    test('a declaration changed: the receiver is resolved again', async () => {
        const { lines, uri } = fixture('B');
        assert.strictEqual(discarded(await pass(uri, 1, lines)).length, 1);
        const edited = lines.map(l => l === 'obj  LongB' ? 'obj  ProcB' : l);
        assert.strictEqual(discarded(await pass(uri, 2, edited)).length, 0, 'ProcB.DoA is PROC: no warning once obj is re-typed');
    });
});
