import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Position } from 'vscode-languageserver-protocol';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * #265 item 1 — hover/F12 variable-resolution agreement.
 *
 * F12's `findSymbolDefinition` predates SymbolFinderService and re-implements
 * variable lookup. Its Local Derived Method branch scans EVERY GlobalProcedure's
 * data section in file order — the exact broad scan Rule 4 (#233) removed from
 * the hover path (SymbolFinderService resolves the single declaring procedure
 * via ScopeResolver.findDeclaringProcedureForMethod).
 *
 * Shadowing suite (bidirectional pin per feedback_bidirectional_pin_assertion):
 *   an unrelated earlier procedure declares the same local name. Hover resolves
 *   the declaring procedure's local; F12 must agree — the unrelated procedure's
 *   declaration must NOT be the target.
 *
 * Sentinel suite (non-regression, must stay green through the migration):
 *   a bare field name that exists only inside a PRE()'d QUEUE must NOT resolve
 *   to the queue field (Clarion requires LOC:Name); with a same-named global
 *   present, F12 resolves the global. This pins the prefix-rejection semantics
 *   the legacy code enforces so the SymbolFinderService migration cannot
 *   silently trade it away.
 */

function lineOf(source: string, needle: string): number {
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(needle)) return i;
    }
    throw new Error(`lineOf: '${needle}' not found in fixture`);
}

function cursorOn(source: string, needle: string): Position {
    const line = lineOf(source, needle);
    const character = source.split(/\r?\n/)[line].indexOf(needle);
    return { line, character };
}

function asLocation(result: unknown): Location {
    assert.ok(result, 'expected a definition result, got null');
    const loc = (Array.isArray(result) ? result[0] : result) as Location;
    assert.ok(loc?.uri, 'expected a Location with a uri');
    return loc;
}

function hoverText(hover: { contents: unknown } | null): string {
    assert.ok(hover, 'expected a hover result, got null');
    const contents = (hover as { contents: { value?: string } | string }).contents;
    return typeof contents === 'string' ? contents : (contents.value ?? '');
}

suite('Hover/F12 variable agreement (#265 item 1)', () => {

    // Local Derived Method: Worker CLASS is declared in ProcB's local data, so
    // Worker.DoIt shares ONLY ProcB's scope (Rule 4). ProcA's same-named local
    // exists purely as shadowing bait for the broad every-GlobalProcedure scan.
    const shadowingSource =
        "  PROGRAM\n" +
        "  MAP\n" +
        "  END\n" +
        "  CODE\n" +
        "  RETURN\n" +
        "\n" +
        "ProcA  PROCEDURE\n" +
        "Target   LONG\n" +
        "  CODE\n" +
        "  RETURN\n" +
        "\n" +
        "ProcB  PROCEDURE\n" +
        "Target   STRING(10)\n" +
        "Worker   CLASS\n" +
        "DoIt       PROCEDURE()\n" +
        "         END\n" +
        "  CODE\n" +
        "  Worker.DoIt()\n" +
        "  RETURN\n" +
        "\n" +
        "Worker.DoIt  PROCEDURE()\n" +
        "  CODE\n" +
        "  Target = 'x'\n" +
        "  RETURN\n";

    const shadowingUri = 'file:///f%3A/inmem/shadowing265.clw';

    test('F12 in Local Derived Method resolves the DECLARING procedure local, not an unrelated procedure', async () => {
        const doc = TextDocument.create(shadowingUri, 'clarion', 1, shadowingSource);
        const provider = new DefinitionProvider();

        const result = await provider.provideDefinition(doc, cursorOn(shadowingSource, "Target = 'x'"));
        const loc = asLocation(result);

        const rightLine = lineOf(shadowingSource, 'Target   STRING(10)'); // ProcB's local
        const wrongLine = lineOf(shadowingSource, 'Target   LONG');       // ProcA's local

        // Negative first: the pre-Rule-4 broad scan lands here.
        assert.notStrictEqual(loc.range.start.line, wrongLine,
            "F12 must NOT resolve to the unrelated ProcA local (pre-Rule-4 broad GlobalProcedure scan)");
        // Positive: the declaring procedure's local.
        assert.strictEqual(loc.range.start.line, rightLine,
            `F12 must resolve to ProcB's local at line ${rightLine}, got line ${loc.range.start.line}`);
    });

    test('hover in Local Derived Method shows the declaring procedure local (agreement baseline)', async () => {
        const doc = TextDocument.create(shadowingUri, 'clarion', 1, shadowingSource);
        const provider = new HoverProvider();

        const hover = await provider.provideHover(doc, cursorOn(shadowingSource, "Target = 'x'"));
        const text = hoverText(hover);

        assert.ok(text.includes('STRING(10)'),
            `hover must show ProcB's STRING(10) declaration; got:\n${text}`);
        assert.ok(!text.includes('LONG'),
            `hover must not leak ProcA's LONG declaration; got:\n${text}`);
    });

    // Bare name declared globally AND as a field inside a PRE()'d QUEUE local to
    // the procedure. Clarion resolves the bare name to the GLOBAL — the field is
    // only reachable as LOC:Counter.
    const bareFieldSource =
        "  PROGRAM\n" +
        "Counter  LONG\n" +
        "  MAP\n" +
        "  END\n" +
        "  CODE\n" +
        "  RETURN\n" +
        "\n" +
        "MyProc  PROCEDURE\n" +
        "LocQ     QUEUE,PRE(LOC)\n" +
        "Counter    LONG\n" +
        "         END\n" +
        "  CODE\n" +
        "  Counter += 1\n" +
        "  RETURN\n";

    const bareFieldUri = 'file:///f%3A/inmem/barefield265.clw';

    test('F12 on bare name resolves the global, never the PRE()d queue field (prefix-rejection sentinel)', async () => {
        const doc = TextDocument.create(bareFieldUri, 'clarion', 1, bareFieldSource);
        const provider = new DefinitionProvider();

        const result = await provider.provideDefinition(doc, cursorOn(bareFieldSource, 'Counter += 1'));
        const loc = asLocation(result);

        const globalLine = lineOf(bareFieldSource, 'Counter  LONG');    // global decl
        const fieldLine = lineOf(bareFieldSource, 'Counter    LONG');   // queue field

        assert.notStrictEqual(loc.range.start.line, fieldLine,
            'F12 must NOT resolve a bare name to a PRE()d structure field (needs LOC: prefix)');
        assert.strictEqual(loc.range.start.line, globalLine,
            `F12 must resolve the bare name to the global at line ${globalLine}, got line ${loc.range.start.line}`);
    });

    test('hover on bare name shows the global, never the PRE()d queue field (agreement)', async () => {
        const doc = TextDocument.create(bareFieldUri, 'clarion', 1, bareFieldSource);
        const provider = new HoverProvider();

        const hover = await provider.provideHover(doc, cursorOn(bareFieldSource, 'Counter += 1'));
        const text = hoverText(hover);

        const globalLineDisplay = lineOf(bareFieldSource, 'Counter  LONG') + 1;  // 1-based in hover
        const fieldLineDisplay = lineOf(bareFieldSource, 'Counter    LONG') + 1;

        assert.ok(!text.includes(`:${fieldLineDisplay}`),
            `hover must NOT show the PRE()d queue field (line ${fieldLineDisplay}); got:\n${text}`);
        assert.ok(text.includes(`:${globalLineDisplay}`),
            `hover must show the global declaration (line ${globalLineDisplay}); got:\n${text}`);
    });
});
