import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateMissingConstants } from '../providers/diagnostics/MissingIncludeDiagnostics';
import { StructureDeclarationIndexer, StructureDeclarationInfo } from '../utils/StructureDeclarationIndexer';
import { IncludeVerifier } from '../utils/IncludeVerifier';
import { SolutionManager } from '../solution/solutionManager';

/**
 * Issue #335 — the project-constants check behind `missing-define-constants`
 * (and the missing-include message suffix) recognized ONLY cwproj
 * `DefineConstants` entries. Shops that define `_ABCDllMode_`-style compile
 * constants as EQUATEs in an INCLUDEd source file (Edin's
 * `INCLUDE('Globals.inc'),ONCE` layout) were told the constants are "not
 * defined" even though the compiler accepts EQUATEs for OMIT/COMPILE
 * evaluation.
 *
 * Fix under test: `ProjectConstantsChecker.isConstantSatisfied` — cwproj tier
 * first, then the structure declaration index's EQUATE/ITEMIZE_EQUATE tier.
 *
 * SDI + IncludeVerifier are prototype-stubbed (the #312 pattern) so the seam
 * under test is exactly the constants decision; ClassConstantParser and
 * ProjectConstantsChecker parse real temp files.
 */

let tmpRoot = '';
let savedSm: unknown;
let origIsIndexed: typeof StructureDeclarationIndexer.prototype.isIndexed;
let origGetOrBuild: typeof StructureDeclarationIndexer.prototype.getOrBuildIndex;
let origFind: typeof StructureDeclarationIndexer.prototype.find;
let origIsClassIncluded: typeof IncludeVerifier.prototype.isClassIncluded;

function classInc(name: string, linkConstant: string): string {
    return [
        `${name}                CLASS(BaseClass),TYPE,MODULE('${name}.clw'),LINK('${name}.clw',${linkConstant}),DLL(_ABCDllMode_)`,
        'DoIt                     PROCEDURE()',
        '                       END',
        '',
    ].join('\r\n');
}

suite('Issue #335 — constants satisfied by INCLUDEd EQUATEs', () => {

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), '335-equates-'));

        fs.writeFileSync(path.join(tmpRoot, 'CopyPaste.inc'), classInc('CopyPasteManager', '_ABCLinkMode_'));
        fs.writeFileSync(path.join(tmpRoot, 'CwprojClass.inc'), classInc('CwprojClass', '_InCwproj_'));
        fs.writeFileSync(path.join(tmpRoot, 'Missing.inc'), classInc('MissingClass', '_NotAnywhere_'));

        // Real cwproj: defines _InCwproj_ and _ABCDllMode_ but NOT _ABCLinkMode_ / _NotAnywhere_.
        fs.writeFileSync(path.join(tmpRoot, 'TestApp.cwproj'), [
            '<Project>',
            '  <PropertyGroup>',
            '    <DefineConstants>_InCwproj_=&gt;1%3b_ABCDllMode_=&gt;1</DefineConstants>',
            '  </PropertyGroup>',
            '</Project>',
        ].join('\n'));

        const cwprojPath = path.join(tmpRoot, 'TestApp.cwproj');
        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = {
            findProjectForFile: () => ({ path: tmpRoot }),
            getProjectCwprojForFile: () => cwprojPath,
            solution: { projects: [{ path: tmpRoot }] },
        };

        const classDefs: Record<string, string> = {
            copypastemanager: 'CopyPaste.inc',
            cwprojclass: 'CwprojClass.inc',
            missingclass: 'Missing.inc',
        };
        // _ABCLinkMode_ is declared as an EQUATE in an INCLUDEd Globals.inc —
        // represented here by an SDI EQUATE entry, which is how the index sees it.
        const equates = new Set(['_abclinkmode_']);

        origIsIndexed = StructureDeclarationIndexer.prototype.isIndexed;
        origGetOrBuild = StructureDeclarationIndexer.prototype.getOrBuildIndex;
        origFind = StructureDeclarationIndexer.prototype.find;
        StructureDeclarationIndexer.prototype.isIndexed = (() => true) as typeof origIsIndexed;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = (async () => []) as unknown as typeof origGetOrBuild;
        StructureDeclarationIndexer.prototype.find = ((name: string): StructureDeclarationInfo[] => {
            const lower = name.toLowerCase();
            if (classDefs[lower]) {
                return [{ name, filePath: path.join(tmpRoot, classDefs[lower]), line: 0, structureType: 'CLASS', isType: true, lineContent: '' }];
            }
            if (equates.has(lower)) {
                return [{ name, filePath: path.join(tmpRoot, 'Globals.inc'), line: 0, structureType: 'EQUATE', isType: false, lineContent: `${name}  EQUATE(1)` }];
            }
            return [];
        }) as typeof origFind;

        origIsClassIncluded = IncludeVerifier.prototype.isClassIncluded;
        IncludeVerifier.prototype.isClassIncluded = (async () => true) as typeof origIsClassIncluded;
    });

    teardown(() => {
        StructureDeclarationIndexer.prototype.isIndexed = origIsIndexed;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = origGetOrBuild;
        StructureDeclarationIndexer.prototype.find = origFind;
        IncludeVerifier.prototype.isClassIncluded = origIsClassIncluded;
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best effort */ }
    });

    async function runValidator(): Promise<{ message: string }[]> {
        const code = [
            '  PROGRAM',
            '  MAP',
            '  END',
            'cp                   CopyPasteManager',
            'cw                   CwprojClass',
            'mm                   MissingClass',
            '  CODE',
            '  RETURN',
        ].join('\r\n');
        const docPath = path.join(tmpRoot, 'main.clw');
        const doc = TextDocument.create(`file:///${docPath.replace(/\\/g, '/')}`, 'clarion', 1, code);
        const tokens = new ClarionTokenizer(code).tokenize();
        const diags = await validateMissingConstants(tokens, doc);
        return diags.map(d => ({ message: typeof d.message === 'string' ? d.message : '' }));
    }

    test('constant declared as EQUATE in an INCLUDEd file — no missing-constants diagnostic (Edin shape)', async () => {
        const diags = await runValidator();
        const onCopyPaste = diags.find(d => d.message.includes("'CopyPasteManager'"));
        assert.strictEqual(
            onCopyPaste, undefined,
            `_ABCLinkMode_ is an EQUATE in Globals.inc and _ABCDllMode_ is in the cwproj — nothing is missing; got: ${JSON.stringify(diags)}`);
    });

    test('regression: constant defined in cwproj DefineConstants — no diagnostic', async () => {
        const diags = await runValidator();
        const onCwproj = diags.find(d => d.message.includes("'CwprojClass'"));
        assert.strictEqual(
            onCwproj, undefined,
            `_InCwproj_ is in DefineConstants; got: ${JSON.stringify(diags)}`);
    });

    test('sentinel: constant in neither cwproj nor any EQUATE — still reported', async () => {
        const diags = await runValidator();
        const onMissing = diags.find(d => d.message.includes("'MissingClass'"));
        assert.ok(
            onMissing,
            `_NotAnywhere_ is genuinely undefined and must be reported; got: ${JSON.stringify(diags)}`);
        assert.ok(onMissing!.message.includes('_NotAnywhere_'), `message must name the constant; got: ${onMissing!.message}`);
        assert.ok(!onMissing!.message.includes('_ABCDllMode_'), '_ABCDllMode_ is in the cwproj and must not be listed');
    });
});
