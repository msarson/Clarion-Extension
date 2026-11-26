/**
 * #885 — the Solution view's Add Source File (and Add Module, and Remove Source File) rebuilt the
 * whole .cwproj with xml2js: an `<?xml ... standalone="yes"?>` declaration appeared, the BOM went,
 * CRLF became LF, every line was re-indented. Add Source File also gave the new, hand-written file
 * a `<Generated>true</Generated>` child: the project page then showed it as generated and Rename
 * refused it (#548/#549), and the reporter read the open `<Compile Include="x.clw">` as a tag
 * missing its `/`.
 *
 * Each edit now changes only the element concerned, as the Project Properties page's edits do.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClarionProjectServer } from '../solution/clarionProjectServer';

// As the Clarion IDE writes a project: BOM, CRLF, two-space indent, ` />`, a generated item with a child.
const BEFORE = '﻿' + [
    '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
    '  <PropertyGroup>',
    '    <ProjectGuid>{11111111-2222-3333-4444-555555555555}</ProjectGuid>',
    '    <OutputType>WinExe</OutputType>',
    '    <DefineConstants>_ABCDllMode_=&gt;0%3b_ABCLinkMode_=&gt;1</DefineConstants>',
    '  </PropertyGroup>',
    '  <ItemGroup>',
    '    <Compile Include="main.clw">',
    '      <Generated>true</Generated>',
    '    </Compile>',
    '    <Compile Include="hand.clw" />',
    '  </ItemGroup>',
    '  <Import Project="$(ClarionBinPath)\\SoftVelocity.Build.Clarion.targets" />',
    '</Project>',
].join('\r\n');

suite('Project file edits keep the file as written (#885)', () => {
    let dir: string;
    let cwproj: string;
    let project: ClarionProjectServer;

    setup(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce885-'));
        cwproj = path.join(dir, 'probe.cwproj');
        fs.writeFileSync(cwproj, BEFORE, 'utf8');
        fs.writeFileSync(path.join(dir, 'main.clw'), '  PROGRAM\r\n  CODE\r\n');
        fs.writeFileSync(path.join(dir, 'hand.clw'), "  MEMBER('main')\r\n");
        project = new ClarionProjectServer('probe', 'Clarion', dir, '{11111111-2222-3333-4444-555555555555}');
    });
    teardown(() => fs.rmSync(dir, { recursive: true, force: true }));

    const after = () => fs.readFileSync(cwproj, 'utf8');
    /** `text` with `line` inserted after the line holding `anchor`. */
    const withLineAfter = (text: string, anchor: string, line: string) => {
        const i = text.indexOf(anchor);
        const end = text.indexOf('\r\n', i) + 2;
        return text.slice(0, end) + line + '\r\n' + text.slice(end);
    };

    test('Add Source File adds one plain Compile line and changes nothing else', async () => {
        assert.strictEqual(await project.addSourceFile('newfile.clw'), true);
        assert.strictEqual(after(), withLineAfter(BEFORE, '<Compile Include="hand.clw" />', '    <Compile Include="newfile.clw" />'));
    });

    test('Add Source File does not mark the new file Generated', async () => {
        await project.addSourceFile('newfile.clw');
        const entry = after().slice(after().indexOf('newfile.clw') - 20);
        assert.ok(!/newfile\.clw"\s*>\s*<Generated>/.test(entry), `got: ${entry.slice(0, 120)}`);
    });

    test('Add Source File creates the source in the project folder', async () => {
        await project.addSourceFile('newfile.clw');
        assert.ok(fs.existsSync(path.join(dir, 'newfile.clw')));
    });

    test('Add Source File of a file already listed changes nothing', async () => {
        assert.strictEqual(await project.addSourceFile('HAND.clw'), false);
        assert.strictEqual(after(), BEFORE);
    });

    test('Add Module adds one plain Compile line and changes nothing else', async () => {
        const r = await project.addModuleWithProcedure('mod2.clw', 'DoIt', dir, 'main.clw', '  ');
        assert.strictEqual(r.success, true);
        assert.strictEqual(after(), withLineAfter(BEFORE, '<Compile Include="hand.clw" />', '    <Compile Include="mod2.clw" />'));
    });

    test('Remove Source File removes only that item\'s line', async () => {
        assert.strictEqual(await project.removeSourceFile('hand.clw'), true);
        assert.strictEqual(after(), BEFORE.replace('    <Compile Include="hand.clw" />\r\n', ''));
    });

    test('Remove Source File of a generated item takes its children with it, and nothing else', async () => {
        assert.strictEqual(await project.removeSourceFile('main.clw'), true);
        assert.strictEqual(after(), BEFORE.replace(
            '    <Compile Include="main.clw">\r\n      <Generated>true</Generated>\r\n    </Compile>\r\n', ''));
    });

    test('Remove Source File of a file not listed changes nothing', async () => {
        assert.strictEqual(await project.removeSourceFile('nope.clw'), false);
        assert.strictEqual(after(), BEFORE);
    });

    test('Remove Source File matches the name in any case', async () => {
        assert.strictEqual(await project.removeSourceFile('HAND.CLW'), true);
        assert.strictEqual(after(), BEFORE.replace('    <Compile Include="hand.clw" />\r\n', ''));
    });

    test('the new source is a MEMBER of the project\'s first source', async () => {
        await project.addSourceFile('newfile.clw');
        assert.ok(fs.readFileSync(path.join(dir, 'newfile.clw'), 'utf8').includes("MEMBER('main.clw')"));
    });

    test('a name XML must escape is written escaped and read back for the duplicate check', async () => {
        assert.strictEqual(await project.addSourceFile('a&b.clw'), true);
        assert.ok(after().includes('<Compile Include="a&amp;b.clw" />'), `got: ${after()}`);
        assert.strictEqual(await project.addSourceFile('A&B.clw'), false);
    });

    suite('a project file with LF line endings and no BOM', () => {
        const LF = BEFORE.slice(1).replace(/\r\n/g, '\n');
        setup(() => fs.writeFileSync(cwproj, LF, 'utf8'));

        test('add keeps LF and gains no BOM', async () => {
            await project.addSourceFile('newfile.clw');
            const text = after();
            assert.ok(!text.startsWith('﻿') && !text.includes('\r'), 'no BOM, no CR');
            const anchor = '<Compile Include="hand.clw" />\n';
            const i = LF.indexOf(anchor) + anchor.length;
            assert.strictEqual(text, LF.slice(0, i) + '    <Compile Include="newfile.clw" />\n' + LF.slice(i));
        });

        test('remove keeps LF and gains no BOM', async () => {
            await project.removeSourceFile('hand.clw');
            assert.strictEqual(after(), LF.replace('    <Compile Include="hand.clw" />\n', ''));
        });
    });

    test('a project with no Compile items gets one new ItemGroup and nothing else changes', async () => {
        const bare = BEFORE.replace(/  <ItemGroup>[\s\S]*?<\/ItemGroup>\r\n/, '');
        fs.writeFileSync(cwproj, bare, 'utf8');
        assert.strictEqual(await project.addSourceFile('first.clw'), true);
        // CwprojItems.addItem's rule: with no ItemGroup, a new one goes before </Project>.
        const block = '  <ItemGroup>\r\n    <Compile Include="first.clw" />\r\n  </ItemGroup>\r\n';
        const at = bare.indexOf('</Project>');
        assert.strictEqual(after(), bare.slice(0, at) + block + bare.slice(at), `got: ${after()}`);
    });
});
