import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { validateAttributeApplicability } from '../providers/diagnostics/AttributeDiagnostics';
import { ClarionTokenizer } from '../ClarionTokenizer';

/**
 * #179 (reopened) — faithful regression pin from the REAL regenerated
 * Frame_AcctsMap.clw (F:\jenkins-workspaces\...\genfiles\source\Frame_AcctsMap.clw).
 *
 * Phase A result (Alice, 2026-06-22): the reported `RegionXxxFEQ = CREATE(0,CREATE:Region)`
 * false positive is ALREADY FIXED on version-0.9.7 — running validateAttributeApplicability
 * over the ENTIRE real file yields ZERO invalid-attribute-context diagnostics. The original
 * May line numbers (7778…) had drifted because the file was Jenkins-regenerated; the real
 * shape now lives at line 4217 (FileLookup setup code) and lines 8981-9023 (8 consecutive
 * CREATE(0,CREATE:Region) inside `ThisWindow.TakeWindowEvent` → `OF EVENT:OpenWindow`).
 *
 * These regions are CREATEd at RUNTIME (no declared REGION control is in scope), so the
 * enclosing context is a CODE/event-handler section where getControlContextAt correctly
 * returns null. The first `CREATE` is the built-in function call (tokenized Attribute);
 * the `CREATE:Region` arg's `Region` WindowElement is `:`-suffixed and skipped by the
 * #179 isCompoundNameSuffix guard. Net: no 'CREATE not applicable to REGION'.
 *
 * This pin is VERBATIM real content (both contexts) so the fix can't silently regress.
 * Bidirectional: a genuine misapplied CREATE on a real REGION declaration STILL fires.
 */

function tokenize(text: string) {
    const doc = TextDocument.create('file:///create-region-repro.clw', 'clarion', 1, text);
    return { doc, tokens: new ClarionTokenizer(doc.getText()).tokenize() };
}

function createRegionDiags(text: string) {
    const { doc, tokens } = tokenize(text);
    return validateAttributeApplicability(tokens, doc)
        .filter(d => d.code === 'invalid-attribute-context');
}

suite('#179 (reopened) — real Frame_AcctsMap.clw CREATE(0,CREATE:Region) regression pin', () => {

    // Verbatim from the real file: ThisWindow.TakeWindowEvent → OF EVENT:OpenWindow
    // (lines 8852-9029, all 8 consecutive runtime-region CREATE blocks).
    const EVENT_HANDLER = [
        'ThisWindow.TakeWindowEvent PROCEDURE',
        '',
        'ReturnValue          BYTE,AUTO',
        '',
        'Looped BYTE',
        '  CODE',
        '  CASE EVENT()',
        '    OF EVENT:OpenWindow',
        '          RegionLeftFEQ = CREATE(0,CREATE:Region)',
        '          IF RegionLeftFEQ ',
        '            RegionLeftFEQ{PROP:Imm} = True ',
        '            RegionLeftFEQ{PROP:Cursor} = CURSOR:SizeWE',
        '            UNHIDE(RegionLeftFEQ)',
        '          END !IF',
        '          RegionRightFEQ = CREATE(0,CREATE:Region)',
        '          IF RegionRightFEQ',
        '            RegionRightFEQ{PROP:Imm} = True ',
        '            UNHIDE(RegionRightFEQ)',
        '          END !IF',
        '          RegionBottomFEQ = CREATE(0,CREATE:Region)',
        '          IF RegionBottomFEQ',
        '            RegionBottomFEQ{PROP:Imm} = True',
        '            UNHIDE(RegionBottomFEQ)',
        '          END !IF',
        '          RegionTopFEQ = CREATE(0,CREATE:Region)',
        '          IF RegionTopFEQ',
        '            RegionTopFEQ{PROP:Imm} = True',
        '            UNHIDE(RegionTopFEQ)',
        '          END !IF ',
        '          RegionTopLeftFEQ = CREATE(0,CREATE:Region)',
        '          RegionTopRightFEQ = CREATE(0,CREATE:Region)',
        '          RegionBottomLeftFEQ = CREATE(0,CREATE:Region)',
        '          RegionBottomRightFEQ = CREATE(0,CREATE:Region)',
        '    END',
        '  RETURN ReturnValue',
    ].join('\n');

    // Verbatim from the real file: FileLookup setup code (lines 4217-4224) — a
    // CREATE:Region immediately followed by a CREATE:Button in the same code section.
    const FILELOOKUP_CODE = [
        'SetupLookups PROCEDURE',
        'DragRegionFEQ   LONG',
        'WindowCloseFEQ  LONG',
        '  CODE',
        '      DragRegionFEQ = CREATE(0,CREATE:Region)',
        '      IF DragRegionFEQ',
        '        DragRegionFEQ{PROP:Imm} = True',
        '        DragRegionFEQ{PROP:Cursor} = Cursor:Size ',
        '        UNHIDE(DragRegionFEQ)',
        '      END !IF',
        '      WindowCloseFEQ = CREATE(0,CREATE:Button)',
        '      WindowCloseFEQ{PROP:Trn} = True ',
        '  RETURN',
    ].join('\n');

    test('event-handler block — 8 consecutive runtime CREATE(0,CREATE:Region) produce NO diagnostic', () => {
        const diags = createRegionDiags(EVENT_HANDLER);
        assert.strictEqual(diags.length, 0,
            `Expected NO invalid-attribute-context diagnostics in the runtime-region event handler; got: ` +
            JSON.stringify(diags.map(d => `L${d.range.start.line}:${d.message}`)));
    });

    test('FileLookup setup code — CREATE:Region + CREATE:Button produce NO diagnostic', () => {
        const diags = createRegionDiags(FILELOOKUP_CODE);
        assert.strictEqual(diags.length, 0,
            `Expected NO invalid-attribute-context diagnostics in the FileLookup setup code; got: ` +
            JSON.stringify(diags.map(d => `L${d.range.start.line}:${d.message}`)));
    });

    // Bidirectional: detection must NOT be wholesale-suppressed — a genuine misapplied
    // CREATE attribute on a REAL REGION control declaration STILL fires.
    test('negative sentinel — misapplied CREATE on a real REGION control STILL fires', () => {
        const diags = createRegionDiags([
            'MyWin WINDOW',
            '  REGION,AT(0,0,100,100),CREATE',
            'END',
        ].join('\n'));
        assert.ok(diags.length > 0,
            'a genuine misapplied CREATE on a real REGION declaration must STILL fire — ' +
            'real control-context detection must survive');
    });
});
