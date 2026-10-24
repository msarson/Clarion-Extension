import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { StructureDeclarationIndexer, StructureDeclarationInfo } from '../utils/StructureDeclarationIndexer';
import { TokenCache } from '../TokenCache';

/**
 * F12 on the FIELD half of a dotted reference (`Widget.Notes`) whose structure is declared in
 * ANOTHER file - a dictionary FILE in an include - resolved nothing, while hovering the same field
 * named it. #475 fixed the same-file case through findFieldInStructure; a structure in another
 * file never reached that, and two faults lined up:
 *
 * 1. On the field half the word arrives fused (`Widget.Notes`), so the dot-notation branch of
 *    findStructureFieldDefinition matched neither half. #475 found that selecting the half was
 *    not needed for a same-file structure (another call site answers); for a structure in another
 *    file nothing else does.
 * 2. That branch searched only the document's own tokens for the structure. The structure index -
 *    hover's route - was never asked.
 *
 * The class-header case also carries #726's trap: a plain field named like the FILE.
 */

let tmpRoot: string;

const DCT = [
    "Widget   FILE,DRIVER('TOPSPEED'),PRE(Wdg),CREATE,THREAD", // 0
    'Key_Id     KEY(+Wdg:Id),NOCASE,OPT,PRIMARY',               // 1
    'Record     RECORD,PRE()',                                   // 2
    'Id           LONG',                                         // 3
    'Notes        STRING(255)',                                  // 4
    '           END',                                            // 5
    '         END',                                              // 6
    '',
].join('\n');
const LINE_NOTES = 4;
const LINE_ID = 3;

const MODULE = [
    "  MEMBER('prog.clw')",
    'Work PROCEDURE()',
    '  CODE',
    '  Widget.Id = 1',
    "  Widget.Notes = 'x'",
    '',
].join('\n');

const HEADER = [
    'ItemQType  QUEUE,TYPE',
    'Widget       LONG',
    'Notes        LIKE(Widget.Notes)',
    '           END',
    '',
].join('\n');

suite('F12 on the field half of a dotted reference to a structure in another file', () => {
    let origFindFor: typeof StructureDeclarationIndexer.prototype.findFor;
    let dctPath: string;

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'f12-xfile-'));
        dctPath = path.join(tmpRoot, 'widgetdct.inc');
        fs.writeFileSync(dctPath, DCT);
        origFindFor = StructureDeclarationIndexer.prototype.findFor;
        StructureDeclarationIndexer.prototype.findFor = ((name: string) =>
            name.toLowerCase() === 'widget'
                ? [{ name: 'Widget', filePath: dctPath, line: 0, structureType: 'FILE', isType: false, lineContent: 'Widget FILE' } as StructureDeclarationInfo]
                : []) as typeof origFindFor;
    });

    teardown(() => {
        StructureDeclarationIndexer.prototype.findFor = origFindFor;
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    async function f12(fileName: string, source: string, needle: string): Promise<Location | null> {
        const file = path.join(tmpRoot, fileName);
        fs.writeFileSync(file, source);
        const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
        const doc = TextDocument.create(uri, 'clarion', 1, source);
        const lines = source.split('\n');
        const i = lines.findIndex(l => l.includes(needle));
        if (i === -1) throw new Error(`needle '${needle}' not found`);
        // The cursor on the field half: one character past the dot.
        const character = lines[i].indexOf(needle) + needle.indexOf('.') + 2;
        const result = await new DefinitionProvider().provideDefinition(doc, { line: i, character });
        return (Array.isArray(result) ? result[0] : result) as Location | null;
    }

    const assertAt = (loc: Location | null, line: number, what: string) => {
        assert.ok(loc, `${what} must resolve`);
        assert.ok(decodeURIComponent(loc!.uri).toLowerCase().endsWith('widgetdct.inc'), `${what} must land in the dictionary; got ${loc!.uri}`);
        assert.strictEqual(loc!.range.start.line, line, `${what} must land on line ${line}; got ${loc!.range.start.line}`);
    };

    test('from a module: the field in the included FILE', async () => {
        assertAt(await f12('mod.clw', MODULE, 'Widget.Notes'), LINE_NOTES, 'Widget.Notes');
        assertAt(await f12('mod2.clw', MODULE, 'Widget.Id'), LINE_ID, 'Widget.Id');
    });

    test('from a class header with a plain field named like the FILE', async () => {
        assertAt(await f12('classhdr.inc', HEADER, 'Widget.Notes'), LINE_NOTES, 'Widget.Notes in LIKE()');
    });
});
