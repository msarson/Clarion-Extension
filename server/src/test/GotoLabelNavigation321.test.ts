import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Position } from 'vscode-languageserver-protocol';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { ReferencesProvider } from '../providers/ReferencesProvider';

/**
 * #321 — GOTO statement labels: FAR / F12 / hover.
 *
 * Language rules (Language Reference, GOTO): the target is the label of
 * another EXECUTABLE STATEMENT; it must not be a ROUTINE or PROCEDURE label;
 * and the scope is exactly the currently executing ROUTINE or PROCEDURE —
 * one unit, no chain. Route G mirrors #320's Route R (per-hit re-resolution
 * gives the scoping for free), but with the tighter one-unit rule.
 *
 * Fixture geography: ProcA and ProcB both carry a statement label named
 * `Snag`, and ProcB also has a routine whose body carries `Snag` — the
 * same-name decoys pin the unit scoping bidirectionally.
 */

const SOURCE =
    "  PROGRAM\n" +                          // 0
    "  MAP\n" +                              // 1
    "  END\n" +                              // 2
    "  CODE\n" +                             // 3
    "  RETURN\n" +                           // 4
    "\n" +                                   // 5
    "ProcA  PROCEDURE(Level)\n" +            // 6
    "  CODE\n" +                             // 7
    "  IF Level = 0\n" +                     // 8
    "    GOTO Snag\n" +                      // 9
    "  END\n" +                              // 10
    "  RETURN(999)\n" +                      // 11
    "Snag  RETURN(1)\n" +                    // 12
    "\n" +                                   // 13
    "ProcB  PROCEDURE\n" +                   // 14
    "  CODE\n" +                             // 15
    "  GOTO Snag\n" +                        // 16
    "  RETURN\n" +                           // 17
    "Snag  RETURN\n" +                       // 18
    "Cleanup  ROUTINE\n" +                   // 19
    "  GOTO Snag\n" +                        // 20
    "  EXIT\n" +                             // 21
    "Snag  EXIT\n";                          // 22

const URI = 'file:///f%3A/inmem/goto321.clw';

const PROCA_GOTO_LINE = 9;
const PROCA_LABEL_LINE = 12;
const PROCB_GOTO_LINE = 16;
const PROCB_LABEL_LINE = 18;
const ROUTINE_GOTO_LINE = 20;
const ROUTINE_LABEL_LINE = 22;

function pos(line: number, source: string, needle: string, offset = 0): Position {
    const text = source.split(/\r?\n/)[line];
    const idx = text.indexOf(needle);
    if (idx === -1) throw new Error(`'${needle}' not on line ${line}`);
    return { line, character: idx + offset };
}

function sortedLines(locs: Location[]): number[] {
    return locs.map(l => l.range.start.line).sort((a, b) => a - b);
}

suite('GOTO statement labels — FAR/F12/hover (#321)', () => {

    function makeDoc(): TextDocument {
        return TextDocument.create(URI, 'clarion', 1, SOURCE);
    }

    test('FAR from the GOTO site returns the label + the GOTO site, nothing else', async () => {
        const doc = makeDoc();
        const provider = new ReferencesProvider();
        const refs = await provider.provideReferences(
            doc, pos(PROCA_GOTO_LINE, SOURCE, 'Snag', 1), { includeDeclaration: true });

        assert.ok(refs && refs.length > 0, 'FAR from a GOTO site must not be empty (#321 RED)');
        assert.deepStrictEqual(sortedLines(refs), [PROCA_GOTO_LINE, PROCA_LABEL_LINE],
            `expected exactly ProcA's GOTO site + label; got lines ${sortedLines(refs)}`);
    });

    test('FAR from the statement label returns the same set (agreement)', async () => {
        const doc = makeDoc();
        const provider = new ReferencesProvider();
        const refs = await provider.provideReferences(
            doc, pos(PROCA_LABEL_LINE, SOURCE, 'Snag', 1), { includeDeclaration: true });

        assert.ok(refs && refs.length > 0, 'FAR from the label must not be empty');
        assert.deepStrictEqual(sortedLines(refs), [PROCA_GOTO_LINE, PROCA_LABEL_LINE],
            `label-side FAR must match GOTO-side FAR and exclude ProcB/routine decoys; got ${sortedLines(refs)}`);
    });

    test('FAR inside the routine scopes to the routine unit only', async () => {
        const doc = makeDoc();
        const provider = new ReferencesProvider();
        const refs = await provider.provideReferences(
            doc, pos(ROUTINE_GOTO_LINE, SOURCE, 'Snag', 1), { includeDeclaration: true });

        assert.ok(refs && refs.length > 0, 'FAR from a routine-body GOTO site must not be empty');
        assert.deepStrictEqual(sortedLines(refs), [ROUTINE_GOTO_LINE, ROUTINE_LABEL_LINE],
            `routine-unit GOTO must exclude ProcB's own statement label (docs: one-unit scope); got ${sortedLines(refs)}`);
    });

    test("FAR in ProcB's procedure code excludes the routine-interior label", async () => {
        const doc = makeDoc();
        const provider = new ReferencesProvider();
        const refs = await provider.provideReferences(
            doc, pos(PROCB_GOTO_LINE, SOURCE, 'Snag', 1), { includeDeclaration: true });

        assert.ok(refs && refs.length > 0, 'FAR from ProcB GOTO site must not be empty');
        assert.deepStrictEqual(sortedLines(refs), [PROCB_GOTO_LINE, PROCB_LABEL_LINE],
            `procedure-unit GOTO must exclude the routine-interior label and ProcA; got ${sortedLines(refs)}`);
    });

    test('F12 on the GOTO target resolves the same-unit statement label', async () => {
        const doc = makeDoc();
        const provider = new DefinitionProvider();
        const result = await provider.provideDefinition(doc, pos(PROCA_GOTO_LINE, SOURCE, 'Snag', 1));

        assert.ok(result, 'F12 on GOTO target must resolve');
        const loc = (Array.isArray(result) ? result[0] : result) as Location;
        assert.strictEqual(loc.range.start.line, PROCA_LABEL_LINE,
            `F12 must land on ProcA's Snag (line ${PROCA_LABEL_LINE}), got ${loc.range.start.line}`);
    });

    test('F12 inside the routine resolves the routine-unit label, not the procedure one', async () => {
        const doc = makeDoc();
        const provider = new DefinitionProvider();
        const result = await provider.provideDefinition(doc, pos(ROUTINE_GOTO_LINE, SOURCE, 'Snag', 1));

        assert.ok(result, 'F12 on routine-body GOTO target must resolve');
        const loc = (Array.isArray(result) ? result[0] : result) as Location;
        assert.notStrictEqual(loc.range.start.line, PROCB_LABEL_LINE,
            "routine-unit GOTO must NOT resolve to ProcB's procedure-level label");
        assert.strictEqual(loc.range.start.line, ROUTINE_LABEL_LINE,
            `F12 must land on the routine's Snag (line ${ROUTINE_LABEL_LINE}), got ${loc.range.start.line}`);
    });

    test('hover on the GOTO target shows the statement label', async () => {
        const doc = makeDoc();
        const provider = new HoverProvider();
        const hover = await provider.provideHover(doc, pos(PROCA_GOTO_LINE, SOURCE, 'Snag', 1));

        assert.ok(hover, 'hover on GOTO target must resolve');
        const contents = (hover as { contents: { value?: string } | string }).contents;
        const text = typeof contents === 'string' ? contents : (contents.value ?? '');
        assert.ok(/label/i.test(text) && text.includes('Snag'),
            `hover must present the statement label; got:\n${text}`);
        assert.ok(text.includes(`${PROCA_LABEL_LINE + 1}`),
            `hover must cite the label's line ${PROCA_LABEL_LINE + 1}; got:\n${text}`);
    });
});
