import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Position } from 'vscode-languageserver-protocol';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * #327 row 2 — qualified-reference shape pins.
 *
 * The line-start colon form is pinned by HoverF12.VariableAgreement.test.ts.
 * These lock the shapes the deleted findStructureFieldDefinition prefix
 * branch was nominally written for (mid-line colon) plus the Field
 * Qualification dot form — proving the downstream paths
 * (SymbolDefinitionResolver.findAllLabelCandidates with the #265 qualifier
 * validation, SymbolFinderService.findPrefixedField) cover them, so the dead
 * branch's deletion cannot silently lose a shape.
 */

function lineOf(source: string, needle: string): number {
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(needle)) return i;
    }
    throw new Error(`lineOf: '${needle}' not found in fixture`);
}

function cursorOn(source: string, needle: string, offset = 0): Position {
    const line = lineOf(source, needle);
    return { line, character: source.split(/\r?\n/)[line].indexOf(needle) + offset };
}

function asLocation(result: unknown): Location {
    assert.ok(result, 'expected a definition result, got null');
    const loc = (Array.isArray(result) ? result[0] : result) as Location;
    assert.ok(loc?.uri, 'expected a Location with a uri');
    return loc;
}

suite('Qualified reference shapes — mid-line colon and dot (#327)', () => {

    // Global decoy with the same field name keeps the pins bidirectional:
    // a qualified reference must hit the FIELD, never the global.
    const midLineSource =
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
        "  X# = LOC:Counter\n" +
        "  RETURN\n";

    const dotSource = midLineSource.replace('X# = LOC:Counter', 'X# = LocQ.Counter');

    test('F12 on mid-line LOC:Counter resolves the queue field', async () => {
        const doc = TextDocument.create('file:///f%3A/inmem/midline327.clw', 'clarion', 1, midLineSource);
        const provider = new DefinitionProvider();

        // Cursor on the "Counter" segment of the fused reference.
        const result = await provider.provideDefinition(doc, cursorOn(midLineSource, 'LOC:Counter', 5));
        const loc = asLocation(result);

        const fieldLine = lineOf(midLineSource, 'Counter    LONG');
        const globalLine = lineOf(midLineSource, 'Counter  LONG');

        assert.notStrictEqual(loc.range.start.line, globalLine,
            'mid-line qualified reference must NOT resolve to the global');
        assert.strictEqual(loc.range.start.line, fieldLine,
            `mid-line LOC:Counter must resolve to the queue field at line ${fieldLine}, got ${loc.range.start.line}`);
    });

    test('hover on mid-line LOC:Counter shows the queue field', async () => {
        const doc = TextDocument.create('file:///f%3A/inmem/midline327.clw', 'clarion', 1, midLineSource);
        const provider = new HoverProvider();

        const hover = await provider.provideHover(doc, cursorOn(midLineSource, 'LOC:Counter', 5));
        assert.ok(hover, 'expected a hover result');
        const contents = (hover as { contents: { value?: string } | string }).contents;
        const text = typeof contents === 'string' ? contents : (contents.value ?? '');

        const fieldLineDisplay = lineOf(midLineSource, 'Counter    LONG') + 1;
        const globalLineDisplay = lineOf(midLineSource, 'Counter  LONG') + 1;

        assert.ok(!text.includes(`:${globalLineDisplay}`),
            `hover must NOT show the global (line ${globalLineDisplay}); got:\n${text}`);
        assert.ok(text.includes(`:${fieldLineDisplay}`),
            `hover must show the queue field (line ${fieldLineDisplay}); got:\n${text}`);
    });

    test('F12 on mid-line LocQ.Counter (Field Qualification form) resolves the queue field', async () => {
        const doc = TextDocument.create('file:///f%3A/inmem/dotmid327.clw', 'clarion', 1, dotSource);
        const provider = new DefinitionProvider();

        const result = await provider.provideDefinition(doc, cursorOn(dotSource, 'LocQ.Counter', 6));
        const loc = asLocation(result);

        const fieldLine = lineOf(dotSource, 'Counter    LONG');
        const globalLine = lineOf(dotSource, 'Counter  LONG');

        assert.notStrictEqual(loc.range.start.line, globalLine,
            'dot-qualified reference must NOT resolve to the global');
        assert.strictEqual(loc.range.start.line, fieldLine,
            `LocQ.Counter must resolve to the queue field at line ${fieldLine}, got ${loc.range.start.line}`);
    });
});
