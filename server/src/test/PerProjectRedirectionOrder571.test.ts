import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';
import { setServerInitialized } from '../serverState';
import { TokenCache } from '../TokenCache';

/**
 * #571 — in a solution with more than one project, class lookups used the FIRST project's
 * redirection order whichever project the open document belonged to. The declaration index is
 * per project and holds each project's order correctly, but `find(name)` without a project returns
 * the first project index with a hit, and the include-chain walks resolved INCLUDEs without the
 * originating file, i.e. through the first project too.
 *
 * Fixture: a real two-project solution. ProjA's Clarion110.red lists dir1 then dir2; ProjB's lists
 * dir2 then dir1. Both folders hold widget.inc declaring WidgetClass (OneOnly in dir1, TwoOnly in
 * dir2) and IWidget (OneI / TwoI). Each project compiles caller.clw, which INCLUDEs widget.inc.
 * The compiler binds ProjA to dir1's copy and ProjB to dir2's.
 */
function defineSuite(title: string, withExtra: boolean, body: (ctx: () => Fixture) => void): void {
suite(title, () => {
    let tmp = '';
    let dir1 = '';
    let dir2 = '';
    let projA = '';
    let projB = '';
    let docA: TextDocument;
    let docB: TextDocument;
    let saved: Record<string, unknown> = {};
    let savedSm: unknown;

    const widget = (member: string, iface: string) =>
        `WidgetClass  CLASS,TYPE\r\n${member}        PROCEDURE()\r\n             END\r\n` +
        `IWidget      INTERFACE\r\n${iface}          PROCEDURE()\r\n             END\r\n`;
    const callerText = "  MEMBER('prog.clw')\r\n  INCLUDE('widget.inc'),ONCE\r\nCaller PROCEDURE\r\n  CODE\r\n";
    const docFor = (projDir: string) => {
        const file = path.join(projDir, 'caller.clw');
        return TextDocument.create(`file:///${file.replace(/\\/g, '/')}`, 'clarion', 1, callerText);
    };

    suiteSetup(async () => {
        setServerInitialized(true);
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'red571-'));
        dir1 = path.join(tmp, 'dir1');
        dir2 = path.join(tmp, 'dir2');
        projA = path.join(tmp, 'ProjA');
        projB = path.join(tmp, 'ProjB');
        for (const d of [dir1, dir2, projA, projB]) fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(dir1, 'widget.inc'), widget('OneOnly', 'OneI'));
        fs.writeFileSync(path.join(dir2, 'widget.inc'), widget('TwoOnly', 'TwoI'));
        if (withExtra) {
            fs.writeFileSync(path.join(dir1, 'extra.inc'), 'WidgetClass  CLASS,TYPE\r\nExtraOnly      PROCEDURE()\r\n             END\r\n');
        }
        fs.writeFileSync(path.join(projA, 'Clarion110.red'), `[Common]\r\n*.inc = ${dir1}; ${dir2}\r\n*.clw = .\r\n`);
        fs.writeFileSync(path.join(projB, 'Clarion110.red'), `[Common]\r\n*.inc = ${dir2}; ${dir1}\r\n*.clw = .\r\n`);

        const sln = path.join(tmp, 'Probe.sln');
        const guidA = '{57100000-0000-0000-0000-00000000000A}';
        const guidB = '{57100000-0000-0000-0000-00000000000B}';
        fs.writeFileSync(sln, [
            'Microsoft Visual Studio Solution File, Format Version 12.00',
            `Project("{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}") = "ProjA", "ProjA\\ProjA.cwproj", "${guidA}"`,
            'EndProject',
            `Project("{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}") = "ProjB", "ProjB\\ProjB.cwproj", "${guidB}"`,
            'EndProject', ''].join('\r\n'));
        for (const [dir, name, guid] of [[projA, 'ProjA', guidA], [projB, 'ProjB', guidB]]) {
            fs.writeFileSync(path.join(dir, 'caller.clw'), callerText);
            fs.writeFileSync(path.join(dir, `${name}.cwproj`), [
                '<?xml version="1.0" encoding="utf-8"?>',
                '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
                `  <PropertyGroup><ProjectGuid>${guid}</ProjectGuid><OutputType>Exe</OutputType></PropertyGroup>`,
                '  <ItemGroup><Compile Include="caller.clw" /></ItemGroup>',
                '</Project>', ''].join('\r\n'));
        }

        saved = {
            redirectionFile: serverSettings.redirectionFile,
            libsrcPaths: serverSettings.libsrcPaths,
            solutionFilePath: serverSettings.solutionFilePath,
            configuration: serverSettings.configuration,
        };
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];
        serverSettings.solutionFilePath = sln;
        serverSettings.configuration = 'Debug';
        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = null;
        await SolutionManager.create(sln);

        // ProjA's index first, as the solution lists it: an unscoped lookup answers with ProjA's order.
        const sdi = StructureDeclarationIndexer.getInstance();
        sdi.clearCache();
        await sdi.getOrBuildIndex(projA);
        await sdi.getOrBuildIndex(projB);

        docA = docFor(projA);
        docB = docFor(projB);
    });

    suiteTeardown(() => {
        StructureDeclarationIndexer.getInstance().clearCache();
        TokenCache.getInstance().clearAllTokens();
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
        Object.assign(serverSettings, saved);
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    body(() => ({ dir1, dir2, projA, projB, docA, docB }));
});
}

interface Fixture { dir1: string; dir2: string; projA: string; projB: string; docA: TextDocument; docB: TextDocument }

const folderOf = (file: string | undefined) => (file ? path.basename(path.dirname(file)) : '(none)');
const memberNames = async (doc: TextDocument) =>
    (await new MemberLocatorService().enumerateMembersInClass('WidgetClass', doc, 'WidgetClass')).map(m => m.name).join(',');

defineSuite('Class lookups follow the open document\'s project redirection (#571)', false, fx => {
    test('precondition: each project index holds its own redirection order', () => {
        const sdi = StructureDeclarationIndexer.getInstance();
        assert.deepStrictEqual(sdi.find('WidgetClass', fx().projA).map(i => folderOf(i.filePath)), ['dir1', 'dir2']);
        assert.deepStrictEqual(sdi.find('WidgetClass', fx().projB).map(i => folderOf(i.filePath)), ['dir2', 'dir1']);
    });

    test('the index lookup on behalf of a file uses that file\'s project', () => {
        const sdi = StructureDeclarationIndexer.getInstance();
        assert.strictEqual(folderOf(sdi.findFor('WidgetClass', path.join(fx().projA, 'caller.clw'))[0]?.filePath), 'dir1');
        assert.strictEqual(folderOf(sdi.findFor('WidgetClass', path.join(fx().projB, 'caller.clw'))[0]?.filePath), 'dir2');
        assert.strictEqual(folderOf(sdi.findFor('WidgetClass', fx().docB.uri)[0]?.filePath), 'dir2', 'a file URI works too');
    });

    test('a name only another project indexes still resolves', () => {
        const sdi = StructureDeclarationIndexer.getInstance();
        const onlyInA = (sdi as unknown as { indexes: Map<string, { byName: Map<string, unknown[]> }> }).indexes;
        const keyB = [...onlyInA.keys()].find(k => k.toLowerCase() === path.normalize(fx().projB).toLowerCase())!;
        const saveB = onlyInA.get(keyB)!.byName.get('widgetclass');
        onlyInA.get(keyB)!.byName.delete('widgetclass');
        try {
            assert.strictEqual(folderOf(sdi.findFor('WidgetClass', path.join(fx().projB, 'caller.clw'))[0]?.filePath), 'dir1');
        } finally {
            onlyInA.get(keyB)!.byName.set('widgetclass', saveB!);
        }
    });

    test('dot completion members come from the copy each project binds to', async () => {
        assert.strictEqual(await memberNames(fx().docA), 'OneOnly');
        assert.strictEqual(await memberNames(fx().docB), 'TwoOnly');
    });

    test('a member is found in the copy the document\'s project binds to', async () => {
        const locator = new MemberLocatorService();
        assert.strictEqual(folderOf((await locator.findMemberInClass('WidgetClass', 'TwoOnly', fx().docB))?.file), 'dir2');
        assert.strictEqual(folderOf((await locator.findMemberInClass('WidgetClass', 'OneOnly', fx().docA))?.file), 'dir1');
    });

    test('the declaring file of a type is the copy the document\'s project binds to', async () => {
        const locator = new MemberLocatorService();
        assert.strictEqual(folderOf((await locator.resolveSdiDeclaration('WidgetClass', fx().projB, path.join(fx().projB, 'caller.clw')))?.filePath), 'dir2');
        assert.strictEqual(folderOf((await locator.resolveSdiDeclaration('WidgetClass', fx().projA, path.join(fx().projA, 'caller.clw')))?.filePath), 'dir1');
    });

    test('a member of a named structure resolves in the document\'s project copy', async () => {
        const resolver = new ClassMemberResolver();
        assert.strictEqual(folderOf((await resolver.findMemberInNamedStructure('TwoOnly', 'WidgetClass', fx().docB))?.file), 'dir2');
        assert.strictEqual(folderOf((await resolver.findMemberInNamedStructure('OneOnly', 'WidgetClass', fx().docA))?.file), 'dir1');
    });

    test('interface members come from the copy each project binds to', async () => {
        const locator = new MemberLocatorService();
        assert.deepStrictEqual(await locator.enumerateInterfaceMembers('IWidget', fx().docB), ['TwoI']);
        assert.deepStrictEqual(await locator.enumerateInterfaceMembers('IWidget', fx().docA), ['OneI']);
    });

});

defineSuite('The include-chain walk resolves INCLUDE through the document\'s project (#571)', true, fx => {
    test('precondition: the index names two declaring file names, so completion walks the include chain', () => {
        const names = new Set(StructureDeclarationIndexer.getInstance().find('WidgetClass', fx().projB).map(i => path.basename(i.filePath)));
        assert.deepStrictEqual([...names].sort(), ['extra.inc', 'widget.inc']);
    });

    test('INCLUDE(\'widget.inc\') in each project reaches the copy its redirection lists first', async () => {
        assert.strictEqual(await memberNames(fx().docB), 'TwoOnly');
        assert.strictEqual(await memberNames(fx().docA), 'OneOnly');
    });
});
