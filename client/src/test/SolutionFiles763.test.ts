import * as assert from 'assert';
import { buildCwprojContent, buildSlnContent } from '../solution/SolutionFiles';

/**
 * #763 — a solution built from a folder of sources has one project per program, each an EXE or a
 * DLL. Type is <OutputType>: Library for a DLL (with <Model>Dll, as every generated DLL project
 * has), Exe otherwise. Compile paths are escaped for MSBuild ($ is %24 in a real project) and XML.
 */
const A = '{AAAAAAAA-0000-0000-0000-000000000001}';
const B = '{BBBBBBBB-0000-0000-0000-000000000002}';

suite('Solution and project files for a folder of sources (#763)', () => {
    test('the .sln lists every project with both configurations', () => {
        const sln = buildSlnContent([{ name: 'App', guid: A }, { name: 'Lib', guid: B }]);
        assert.ok(sln.startsWith('﻿'));
        assert.ok(sln.includes(`Project("{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}") = "App", "App.cwproj", "${A}"\r\nEndProject`));
        assert.ok(sln.includes(`Project("{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}") = "Lib", "Lib.cwproj", "${B}"\r\nEndProject`));
        for (const g of [A, B]) for (const c of ['Debug', 'Release']) {
            assert.ok(sln.includes(`\t\t${g}.${c}|Win32.Build.0 = ${c}|Win32`));
            assert.ok(sln.includes(`\t\t${g}.${c}|Win32.ActiveCfg = ${c}|Win32`));
        }
    });

    test('an EXE project: OutputType Exe, its Compile items in order', () => {
        const p = buildCwprojContent({ name: 'App', guid: A, compile: ['App.clw', 'src\\App001.clw'], kind: 'exe' });
        assert.ok(p.includes('<OutputType>Exe</OutputType>'));
        assert.ok(!p.includes('<Model>'));
        assert.ok(p.includes('    <Compile Include="App.clw" />\r\n    <Compile Include="src\\App001.clw" />'));
        assert.ok(p.includes(`<ProjectGuid>${A}</ProjectGuid>`));
    });

    test('a DLL project: OutputType Library with Model Dll', () => {
        const p = buildCwprojContent({ name: 'Lib', guid: B, compile: ['Lib.clw'], kind: 'dll' });
        assert.ok(p.includes('<OutputType>Library</OutputType>'));
        assert.ok(p.includes('<Model>Dll</Model>'));
    });

    test('file names are escaped for MSBuild and XML', () => {
        const p = buildCwprojContent({ name: 'A&B', guid: A, compile: ["IBSC$TAG.clw", "50%_R&D's.clw"], kind: 'exe' });
        assert.ok(p.includes('<Compile Include="IBSC%24TAG.clw" />'));
        assert.ok(p.includes('<Compile Include="50%25_R&amp;D%27s.clw" />'));
        assert.ok(p.includes('<OutputName>A&amp;B</OutputName>'));
    });
});
