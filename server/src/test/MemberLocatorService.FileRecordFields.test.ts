/**
 * `File.` completion lists the FILE's record fields.
 *
 * A FILE declares its data inside a nested `RECORD`. Member enumeration skips the contents of
 * nested GROUP/QUEUE/RECORD blocks (they are sub-structures of a class), so for a FILE resolved
 * through the structure index it listed only the keys and the `Record` label itself - never the
 * fields, which are what `File.` is typed to reach (`Widget.Name`).
 *
 * Pins:
 *   1. The record's fields are enumerated alongside the keys.
 *   2. The `Record` label is not offered as a member.
 *   3. A GROUP nested inside the record still hides its own children (only the FILE's own
 *      RECORD is transparent).
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { StructureDeclarationIndexer, StructureDeclarationInfo } from '../utils/StructureDeclarationIndexer';
import { setServerInitialized } from '../serverState';

let tmpDir: string;

function writeFixture(name: string, lines: string[]): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, lines.join('\n'));
    return p;
}

suite('MemberLocatorService - FILE record fields in member enumeration', () => {
    let origSdiFind: typeof StructureDeclarationIndexer.prototype.find;
    let origSdiBuild: typeof StructureDeclarationIndexer.prototype.getOrBuildIndex;
    let dctPath: string;

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlsfile_'));
        dctPath = writeFixture('widgetdct.inc', [
            "Widget   FILE, DRIVER('TOPSPEED'), PRE(Wdg), CREATE, BINDABLE, THREAD",
            'Key_Id                   KEY(+Wdg:Id),NOCASE,OPT,PRIMARY',
            'Key_Name                 KEY(+Wdg:Name),DUP,NOCASE,OPT',
            'Record                   RECORD,PRE()',
            'Id                         LONG                 ! Primary key',
            'Name                       STRING(30)           ! Display name',
            'Comment                    STRING(255)          ! Free text',
            'Stamp                      GROUP',
            'Dte                          DATE',
            'Tme                          TIME',
            '                           END',
            '                         END',
            '                       END',
        ]);
    });

    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    setup(() => {
        origSdiFind = StructureDeclarationIndexer.prototype.find;
        origSdiBuild = StructureDeclarationIndexer.prototype.getOrBuildIndex;
        StructureDeclarationIndexer.prototype.getOrBuildIndex =
            (async () => ({})) as unknown as typeof origSdiBuild;
        StructureDeclarationIndexer.prototype.find = ((name: string) =>
            name.toLowerCase() === 'widget'
                ? [{ name: 'Widget', filePath: dctPath, line: 0, structureType: 'FILE', isType: false, lineContent: 'Widget FILE' } as StructureDeclarationInfo]
                : []
        ) as typeof origSdiFind;
    });

    teardown(() => {
        StructureDeclarationIndexer.prototype.find = origSdiFind;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = origSdiBuild;
        TokenCache.getInstance().clearAllTokens();
    });

    async function enumerate(): Promise<string[]> {
        const p = writeFixture('widgetmain.clw', [
            "  MEMBER('prog.clw')",
            'Caller PROCEDURE',
            '  CODE',
        ]);
        const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, fs.readFileSync(p, 'utf8'));
        const members = await new MemberLocatorService().enumerateMembersInClass('Widget', doc);
        return members.map(m => m.name);
    }

    test('the record fields are listed alongside the keys', async () => {
        const names = await enumerate();
        for (const expected of ['Key_Id', 'Key_Name', 'Id', 'Name', 'Comment']) {
            assert.ok(names.includes(expected), `"${expected}" must be offered, got: ${names.join(', ')}`);
        }
    });

    test('the Record label itself is not offered', async () => {
        const names = await enumerate();
        assert.ok(!names.some(n => n.toLowerCase() === 'record'), `got: ${names.join(', ')}`);
    });

    test('a GROUP inside the record still hides its own children', async () => {
        const names = await enumerate();
        assert.ok(names.includes('Stamp'), 'the group itself is a field');
        assert.ok(!names.includes('Dte') && !names.includes('Tme'), `got: ${names.join(', ')}`);
    });
});
