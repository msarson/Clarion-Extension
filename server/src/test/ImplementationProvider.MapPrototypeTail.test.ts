import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { ClarionPatterns } from '../utils/ClarionPatterns';

/**
 * Follow-up to #466 — Go to Implementation (Ctrl+F12) on a MAP prototype.
 *
 * #466 taught `DocumentStructure` which prototype shapes are declarations, which fixed
 * the diagnostic and go-to-DEFINITION. `ImplementationProvider` and the MAP hover do
 * not read that subtype: they re-match the line with
 * `ClarionPatterns.MAP_PROCEDURE_DECLARATION`, which still demanded a `(` or the
 * PROCEDURE keyword after the name. So on
 *
 *     AttributeProto,NAME('_mapattr')
 *
 * F12 jumped to the implementation and Ctrl+F12 did nothing — the same prototype,
 * two different answers, which is exactly how it was reported.
 *
 * The pattern now also accepts a comma tail or nothing at all. Both callers gate on
 * the cursor being inside a MAP/MODULE block, where a lone identifier can only be a
 * prototype; the keyword guard is what keeps `END` and `MODULE('f.clw')` from being
 * read as procedure names now that a bare word matches.
 */

let tmpRoot: string;

const PARENT = [
    '  PROGRAM',
    '',
    '  MAP',
    "    MODULE('member.clw')",
    '      BareProto',
    '      ReturnTypeProto,LONG',
    "      AttributeProto,NAME('_mapattr')",
    '      ParensProto(),LONG',
    '    END',
    '  END',
    '',
    '  CODE',
    '  RETURN',
    ''
].join('\n');

const MEMBER = [
    "  MEMBER('parent.clw')",
    '',
    'BareProto            PROCEDURE',
    '  CODE',
    '  RETURN',
    '',
    'ReturnTypeProto      PROCEDURE',
    '  CODE',
    '  RETURN(0)',
    '',
    'AttributeProto       PROCEDURE',
    '  CODE',
    '  RETURN',
    '',
    'ParensProto          PROCEDURE()',
    '  CODE',
    '  RETURN(0)',
    ''
].join('\n');

/** 0-based implementation lines in member.clw. */
const IMPL_LINE: Record<string, number> = {
    BareProto: 2,
    ReturnTypeProto: 6,
    AttributeProto: 10,
    ParensProto: 14
};

async function implementationOf(name: string): Promise<Location | null> {
    fs.writeFileSync(path.join(tmpRoot, 'member.clw'), MEMBER);
    const parentFile = path.join(tmpRoot, 'parent.clw');
    fs.writeFileSync(parentFile, PARENT);

    const uri = 'file:///' + parentFile.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
    const doc = TextDocument.create(uri, 'clarion', 1, PARENT);
    const lines = PARENT.split('\n');
    const line = lines.findIndex(l => l.trim().startsWith(name));
    assert.ok(line >= 0, `prototype '${name}' not found in the fixture`);
    const character = lines[line].indexOf(name) + 1;

    const result = await new ImplementationProvider().provideImplementation(doc, { line, character });
    return (Array.isArray(result) ? result[0] : result) as Location | null;
}

suite('Go to Implementation on a MAP prototype with an attribute tail (#466 follow-up)', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'impl-proto-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    for (const name of ['BareProto', 'ReturnTypeProto', 'AttributeProto', 'ParensProto']) {
        test(`Ctrl+F12 on ${name} reaches its implementation`, async () => {
            const loc = await implementationOf(name);
            assert.ok(loc, `Go to Implementation must resolve '${name}'`);
            assert.ok(loc!.uri.toLowerCase().endsWith('member.clw'),
                `must land in the MEMBER file; got ${loc!.uri}`);
            assert.strictEqual(loc!.range.start.line, IMPL_LINE[name],
                `must land on the implementation of ${name}`);
        });
    }

    // ── the pattern's own guard ───────────────────────────────────────────────
    test('the declaration pattern accepts every keyword-less tail', () => {
        const P = ClarionPatterns.MAP_PROCEDURE_DECLARATION;
        for (const line of [
            '      MyProc',
            '      MyProc,LONG',
            "      MyProc,NAME('_x')",
            '      MyProc(LONG),LONG',
            '      MyProc    PROCEDURE',
            '      MyProc    FUNCTION(LONG)',
            '      MyProc            ! trailing comment'
        ]) {
            const m = line.match(P);
            assert.ok(m, `should match: ${line}`);
            assert.strictEqual(m![1], 'MyProc', `should capture the name from: ${line}`);
        }
    });

    test('block keywords are not captured as procedure names', () => {
        const P = ClarionPatterns.MAP_PROCEDURE_DECLARATION;
        for (const line of ['    END', '  MAP', "    MODULE('member.clw')", '  END']) {
            assert.strictEqual(line.match(P), null,
                `a bare word now matches, so this must be excluded explicitly: ${line}`);
        }
    });
});
