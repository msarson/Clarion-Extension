import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Position } from 'vscode-languageserver-protocol';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { ReferencesProvider } from '../providers/ReferencesProvider';

/**
 * #321 stretch — BREAK/CYCLE loop labels (the issue's last checkbox).
 *
 * Language rules (BREAK/CYCLE docs): the label names an ENCLOSING labelled
 * LOOP (or ACCEPT) — lexical nesting, so a site can only reference a label
 * whose structure range contains it. That range check alone excludes
 * same-name labels in other procedures (the ProcB decoy).
 *
 * Probe findings (pre-fix): F12 from BREAK/CYCLE sites and FAR FROM A SITE
 * already worked via the generic tiers; the gap was FAR FROM THE LOOP LABEL,
 * which Route G intercepted and scanned only GOTO sites — BREAK/CYCLE
 * references were dropped. Route G now collects all three site families with
 * per-hit re-resolution.
 */

const SOURCE =
    "  PROGRAM\n" +                                    // 0
    "  MAP\n" +                                        // 1
    "  END\n" +                                        // 2
    "  CODE\n" +                                       // 3
    "  RETURN\n" +                                     // 4
    "\n" +                                             // 5
    "ProcA  PROCEDURE\n" +                             // 6
    "I      LONG\n" +                                  // 7
    "J      LONG\n" +                                  // 8
    "  CODE\n" +                                       // 9
    "OuterLoop LOOP I = 1 TO 10\n" +                   // 10 — labelled LOOP
    "            LOOP J = 1 TO 10\n" +                 // 11
    "              IF J = 5 THEN CYCLE OuterLoop.\n" + // 12
    "              IF I = 9 THEN BREAK OuterLoop.\n" + // 13
    "            END\n" +                              // 14
    "          END\n" +                                // 15
    "  RETURN\n" +                                     // 16
    "\n" +                                             // 17
    "ProcB  PROCEDURE\n" +                             // 18
    "K      LONG\n" +                                  // 19
    "  CODE\n" +                                       // 20
    "OuterLoop LOOP K = 1 TO 3\n" +                    // 21 — same-name decoy
    "            BREAK OuterLoop\n" +                  // 22
    "          END\n" +                                // 23
    "  RETURN\n";                                      // 24

const URI = 'file:///f%3A/inmem/breakcycle321.clw';

function pos(line: number, needle: string, offset = 1): Position {
    const text = SOURCE.split('\n')[line];
    const idx = text.indexOf(needle);
    if (idx === -1) throw new Error(`'${needle}' not on line ${line}`);
    return { line, character: idx + offset };
}

function makeDoc(): TextDocument {
    return TextDocument.create(URI, 'clarion', 1, SOURCE);
}

function lines(locs: Location[] | null | undefined): number[] {
    return (locs ?? []).map(l => l.range.start.line).sort((a, b) => a - b);
}

suite('BREAK/CYCLE loop labels — FAR/F12 (#321 stretch)', () => {

    test('FAR from the LOOP label returns label + CYCLE + BREAK sites (the gap)', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            makeDoc(), pos(10, 'OuterLoop'), { includeDeclaration: true });
        assert.deepStrictEqual(lines(refs), [10, 12, 13],
            'label-side FAR must include the BREAK/CYCLE sites and exclude ProcB\'s decoys');
    });

    test('FAR from a BREAK site returns the same set (site/label agreement)', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            makeDoc(), pos(13, 'OuterLoop'), { includeDeclaration: true });
        assert.deepStrictEqual(lines(refs), [10, 12, 13]);
    });

    test('bidirectional decoy: ProcB\'s BREAK site resolves to ProcB\'s loop only', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            makeDoc(), pos(22, 'OuterLoop'), { includeDeclaration: true });
        assert.deepStrictEqual(lines(refs), [21, 22],
            'ProcB\'s references must not bleed into ProcA\'s loop family');
    });

    test('F12 from BREAK and CYCLE sites lands on the labelled LOOP', async () => {
        const provider = new DefinitionProvider();
        const fromBreak = await provider.provideDefinition(makeDoc(), pos(13, 'OuterLoop'));
        const b = Array.isArray(fromBreak) ? fromBreak[0] : fromBreak;
        assert.strictEqual(b?.range.start.line, 10);

        const fromCycle = await provider.provideDefinition(makeDoc(), pos(12, 'OuterLoop'));
        const c = Array.isArray(fromCycle) ? fromCycle[0] : fromCycle;
        assert.strictEqual(c?.range.start.line, 10);
    });

    test('F12 decoy: ProcB\'s BREAK site lands on ProcB\'s loop', async () => {
        const result = await new DefinitionProvider().provideDefinition(makeDoc(), pos(22, 'OuterLoop'));
        const loc = Array.isArray(result) ? result[0] : result;
        assert.strictEqual(loc?.range.start.line, 21);
    });
});
