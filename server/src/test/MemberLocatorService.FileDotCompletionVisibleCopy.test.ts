/**
 * #732 — `File.` completion lists the fields of the copy the program compiles.
 *
 * The project index holds every include file in the project's directories, so a stray copy of a
 * dictionary include that nothing compiles is indexed beside the real one, both declaring the
 * same FILE. #728 made hover and Go to Definition prefer the copy the document can see; member
 * enumeration's structure-index tier still took the first declaration, so `Widget.` could list
 * the stray copy's fields while hover and F12 named the compiled one.
 *
 * Pins:
 *   1. From a MEMBER module, the fields come from the include its PROGRAM compiles.
 *   2. With neither copy visible, the first declaration answers as before.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { StructureDeclarationIndexer, StructureDeclarationInfo } from '../utils/StructureDeclarationIndexer';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { setServerInitialized } from '../serverState';

let tmpDir: string;

function writeFixture(name: string, lines: string[]): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, lines.join('\n'));
    return p;
}

function fileDecl(fieldName: string): string[] {
    return [
        "Widget   FILE, DRIVER('TOPSPEED'), PRE(Wdg), CREATE",
        'Key_Id                   KEY(+Wdg:Id),NOCASE,OPT,PRIMARY',
        'Record                   RECORD,PRE()',
        'Id                         LONG',
        `${fieldName}                  STRING(30)`,
        '                         END',
        '                       END',
    ];
}

suite('MemberLocatorService - FILE dot completion prefers the visible copy (#732)', () => {
    let origSdiFind: typeof StructureDeclarationIndexer.prototype.find;
    let origSdiBuild: typeof StructureDeclarationIndexer.prototype.getOrBuildIndex;
    let strayPath: string;
    let realPath: string;

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlsvis_'));
        strayPath = writeFixture('olddct.inc', fileDecl('OldField'));
        realPath = writeFixture('appdct.inc', fileDecl('NewField'));
    });

    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    setup(() => {
        origSdiFind = StructureDeclarationIndexer.prototype.find;
        origSdiBuild = StructureDeclarationIndexer.prototype.getOrBuildIndex;
        StructureDeclarationIndexer.prototype.getOrBuildIndex =
            (async () => ({})) as unknown as typeof origSdiBuild;
        const decl = (filePath: string) =>
            ({ name: 'Widget', filePath, line: 0, structureType: 'FILE', isType: false, lineContent: 'Widget FILE' } as StructureDeclarationInfo);
        // The stray copy comes FIRST, both in the same folder.
        StructureDeclarationIndexer.prototype.find = ((name: string) =>
            name.toLowerCase() === 'widget' ? [decl(strayPath), decl(realPath)] : []
        ) as typeof origSdiFind;

        const graph = FileRelationshipGraph.getInstance();
        graph.reset();
        graph.seedEdgesForTest([
            { type: 'INCLUDE', fromFile: path.join(tmpDir, 'prog.clw'), toFile: realPath },
            { type: 'MEMBER', fromFile: path.join(tmpDir, 'mod.clw'), toFile: path.join(tmpDir, 'prog.clw') },
            { type: 'MEMBER', fromFile: path.join(tmpDir, 'elsewhere.clw'), toFile: path.join(tmpDir, 'otherprog.clw') },
        ] as never);
    });

    teardown(() => {
        StructureDeclarationIndexer.prototype.find = origSdiFind;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = origSdiBuild;
        FileRelationshipGraph.getInstance().reset();
        TokenCache.getInstance().clearAllTokens();
    });

    async function enumerateFrom(file: string, programFile: string): Promise<string[]> {
        const p = writeFixture(file, [
            `  MEMBER('${programFile}')`,
            'Caller PROCEDURE',
            '  CODE',
        ]);
        const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, fs.readFileSync(p, 'utf8'));
        const members = await new MemberLocatorService().enumerateMembersInClass('Widget', doc);
        return members.map(m => m.name);
    }

    test('from a MEMBER module: the fields of the include its PROGRAM compiles', async () => {
        const names = await enumerateFrom('mod.clw', 'prog.clw');
        assert.ok(names.includes('NewField'), `the compiled copy's field must be offered, got: ${names.join(', ')}`);
        assert.ok(!names.includes('OldField'), `the stray copy's field must not be offered, got: ${names.join(', ')}`);
    });

    test('when neither copy is visible, the first declaration answers as before', async () => {
        const names = await enumerateFrom('elsewhere.clw', 'otherprog.clw');
        assert.ok(names.includes('OldField'), `got: ${names.join(', ')}`);
    });
});
