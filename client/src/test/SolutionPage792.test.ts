import * as assert from 'assert';
import { buildSolutionPageState, newProjectError, projectsInSln, projectSummary, settleChoice, SolutionPageInput } from '../solution/SolutionPage';

/**
 * #792 stages 3 and 4 — the Solution page. One page shows what a solution builds with (the Clarion
 * installation, compiler version and configuration), its startup project and its projects. Opened
 * from the Solution View it changes them in place; Open Solution shows it instead of a run of quick
 * picks whenever something cannot be settled from what was remembered, with everything on one page.
 */
const SLN = [
    'Microsoft Visual Studio Solution File, Format Version 11.00',
    'Project("{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}") = "Sales", "Sales.cwproj", "{11111111-1111-1111-1111-111111111111}"',
    'EndProject',
    'Project("{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}") = "Common", "lib\\Common.cwproj", "{22222222-2222-2222-2222-222222222222}"',
    'EndProject',
    'Project("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "Docs", "Docs", "{33333333-3333-3333-3333-333333333333}"',
    'EndProject',
    'Global',
    '\tGlobalSection(SolutionConfigurationPlatforms) = preSolution',
    '\t\tDebug|Win32 = Debug|Win32',
    '\t\tRelease|Win32 = Release|Win32',
    '\tEndGlobalSection',
    'EndGlobal',
].join('\r\n');

const C12 = { propertiesFile: 'C:\\Users\\a\\AppData\\Roaming\\SoftVelocity\\Clarion\\12.0\\ClarionProperties.xml', ideVersion: '12.0', compilers: ['Clarion 12.0.14373'] };
const C10 = { propertiesFile: 'C:\\Users\\a\\AppData\\Roaming\\SoftVelocity\\Clarion\\10.0\\ClarionProperties.xml', ideVersion: '10.0', compilers: ['Clarion 10.0.12799', 'Clarion 10.0 (legacy)'] };

const input = (over: Partial<SolutionPageInput> = {}): SolutionPageInput => ({
    mode: 'open',
    solutionFile: 'C:\\Apps\\Sales\\Sales.sln',
    installations: [C12, C10],
    choice: {},
    configurations: ['Debug|Win32', 'Release|Win32'],
    projects: [
        { name: 'Sales', guid: '{11111111-1111-1111-1111-111111111111}', cwproj: 'C:\\Apps\\Sales\\Sales.cwproj', kind: 'EXE', references: ['Common'] },
        { name: 'Common', guid: '{22222222-2222-2222-2222-222222222222}', cwproj: 'C:\\Apps\\Sales\\lib\\Common.cwproj', kind: 'DLL', references: [], exp: 'C:\\Apps\\Sales\\genFiles\\exp\\Common.exp' },
    ],
    ...over,
});

suite('Solution page: what a solution builds with (#792)', () => {
    test('the projects a .sln lists, solution folders left out', () => {
        assert.deepStrictEqual(projectsInSln(SLN), [
            { name: 'Sales', path: 'Sales.cwproj', guid: '{11111111-1111-1111-1111-111111111111}' },
            { name: 'Common', path: 'lib\\Common.cwproj', guid: '{22222222-2222-2222-2222-222222222222}' },
        ]);
    });

    test('a project is an EXE, DLL or LIB by its OutputType, with the projects it references', () => {
        const cwproj = (type: string) => `<Project>\r\n  <PropertyGroup>\r\n    <OutputType>${type}</OutputType>\r\n    <OutputName>Sales</OutputName>\r\n  </PropertyGroup>\r\n  <ItemGroup>\r\n    <ProjectReference Include="lib\\Common.cwproj">\r\n      <Name>Common</Name>\r\n    </ProjectReference>\r\n    <ProjectReference Include="Reports.cwproj" />\r\n  </ItemGroup>\r\n  <!-- <ItemGroup><ProjectReference Include="Old.cwproj" /></ItemGroup> -->\r\n</Project>`;
        assert.deepStrictEqual(projectSummary(cwproj('WinExe')), { kind: 'EXE', outputName: 'Sales', references: ['Common', 'Reports'] });
        assert.strictEqual(projectSummary(cwproj('Library')).kind, 'DLL');
        assert.strictEqual(projectSummary(cwproj('Lib')).kind, 'LIB');
    });

    test('what is remembered and still valid is kept; a lone option is taken; the rest must be chosen', () => {
        assert.deepStrictEqual(settleChoice([C12, C10], { propertiesFile: C10.propertiesFile.toLowerCase(), version: 'Clarion 10.0.12799', configuration: 'Release|Win32' }, ['Debug|Win32', 'Release|Win32']),
            { propertiesFile: C10.propertiesFile, version: 'Clarion 10.0.12799', configuration: 'Release|Win32', complete: true });
        // C10 offers two compilers and nothing names one; two installations and nothing names one.
        assert.deepStrictEqual(settleChoice([C12, C10], { propertiesFile: C10.propertiesFile }, ['Debug|Win32']),
            { propertiesFile: C10.propertiesFile, version: undefined, configuration: 'Debug|Win32', complete: false });
        assert.deepStrictEqual(settleChoice([C12], { version: 'Clarion 11.1.13855' }, ['Debug|Win32', 'Release|Win32']),
            { propertiesFile: C12.propertiesFile, version: 'Clarion 12.0.14373', configuration: undefined, complete: false });
        // A configuration remembered by name only matches the .sln's own entry.
        assert.strictEqual(settleChoice([C12], { configuration: 'release' }, ['Debug|Win32', 'Release|Win32']).configuration, 'Release|Win32');
    });

    test('opening: the fields still to choose are marked, and Open waits for them', () => {
        const state = buildSolutionPageState(input({ reason: 'It was last opened with Clarion 11.1, which is not installed here.' }));
        assert.strictEqual(state.title, 'Sales');
        assert.strictEqual(state.mode, 'open');
        assert.strictEqual(state.ready, false);
        assert.ok(state.reason?.includes('Clarion 11.1'));
        assert.deepStrictEqual([state.installation.needs, state.version.needs, state.configuration.needs], [true, true, true]);
        assert.deepStrictEqual(state.installation.options.map(o => o.label), ['Clarion 12.0', 'Clarion 10.0']);
        assert.deepStrictEqual(state.configuration.options, [{ value: 'Debug|Win32', label: 'Debug' }, { value: 'Release|Win32', label: 'Release' }]);

        const chosen = buildSolutionPageState(input({ choice: { propertiesFile: C12.propertiesFile, configuration: 'Debug|Win32' } }));
        assert.deepStrictEqual([chosen.installation.needs, chosen.version.needs, chosen.configuration.needs], [false, false, false]);
        assert.strictEqual(chosen.version.value, 'Clarion 12.0.14373', 'the installation\'s only compiler');
        assert.strictEqual(chosen.ready, true);
    });

    test('the project table: type, references, export file, startup', () => {
        const state = buildSolutionPageState(input({ startupGuid: '11111111-1111-1111-1111-111111111111' }));
        assert.deepStrictEqual(state.projects.map(p => [p.name, p.kind, p.references, p.startup]), [
            ['Sales', 'EXE', 'Common', true],
            ['Common', 'DLL', '—', false],
        ]);
        assert.deepStrictEqual(state.projects.map(p => [p.exp.text, p.exp.tone]), [
            ['Not needed for an EXE', 'none'],
            ['Found: genFiles\\exp\\Common.exp', 'good'],
        ]);
        const missing = buildSolutionPageState(input({ projects: [{ ...input().projects[1], exp: null }] }));
        assert.strictEqual(missing.projects[0].exp.tone, 'bad');
        assert.ok(/Missing/.test(missing.projects[0].exp.text));
        const unknown = buildSolutionPageState(input({ choice: { propertiesFile: C12.propertiesFile }, projects: [{ ...input().projects[1], exp: undefined }] }));
        assert.deepStrictEqual(unknown.projects[0].exp, { text: 'Looking…', tone: 'none' }, 'being looked up');
        // Redirection depends on the compiler version: before one is chosen there is nothing to look for.
        const unchosen = buildSolutionPageState(input({ projects: [{ ...input().projects[1], exp: undefined }] }));
        assert.deepStrictEqual(unchosen.projects[0].exp, { text: 'Found once a compiler version is chosen', tone: 'none' });
        assert.deepStrictEqual(state.startup.options.map(o => o.label), ['Sales'], 'only a program can be started');
        assert.strictEqual(state.startup.value, '11111111-1111-1111-1111-111111111111');
    });

    test('configurations that share a name are offered once, as the .sln\'s first entry', () => {
        const state = buildSolutionPageState(input({ configurations: ['Debug|Win32', 'Debug|Any CPU', 'Release|Win32'] }));
        assert.deepStrictEqual(state.configuration.options, [{ value: 'Debug|Win32', label: 'Debug' }, { value: 'Release|Win32', label: 'Release' }]);
    });

    test('an installation whose ClarionProperties.xml is outside %APPDATA% says where it is (#479)', () => {
        const tree = { propertiesFile: 'D:\\Apps\\Sales\\ide\\ClarionProperties.xml', ideVersion: '12.0', compilers: ['Clarion 12.0.14373'] };
        const appData = 'C:\\Users\\a\\AppData\\Roaming';
        assert.strictEqual(buildSolutionPageState(input({ installations: [tree], appData })).installation.configDir, 'D:\\Apps\\Sales\\ide');
        assert.strictEqual(buildSolutionPageState(input({ installations: [C12], appData })).installation.configDir, undefined);
    });

    test('properties: the page shows the current choice and the build settings, and is always ready', () => {
        const state = buildSolutionPageState(input({
            mode: 'properties',
            choice: { propertiesFile: C10.propertiesFile, version: 'Clarion 10.0 (legacy)', configuration: 'Release|Win32' },
            build: { keepLog: true, lastLog: 'C:\\Apps\\Sales\\build_20261024.log', runCommand: '' },
            graph: '412 files, 1,920 edges',
        }));
        assert.strictEqual(state.ready, true);
        assert.deepStrictEqual([state.installation.value, state.version.value, state.configuration.value], [C10.propertiesFile, 'Clarion 10.0 (legacy)', 'Release|Win32']);
        assert.deepStrictEqual(state.version.options.map(o => o.value), C10.compilers);
        assert.strictEqual(state.build?.log, 'Kept: build_20261024.log');
        assert.strictEqual(state.build?.run, 'The startup project\'s program');
        assert.strictEqual(state.graph, '412 files, 1,920 edges');
    });
});

suite('Solution Properties: a new project is checked before anything is written (#795)', () => {
    const projects = [{ name: 'Sales' }, { name: 'Common' }];
    test('a name and a .clw main file are needed', () => {
        assert.strictEqual(newProjectError('Orders', 'Orders.clw', projects), undefined);
        assert.match(newProjectError('', 'Orders.clw', projects) ?? '', /empty/);
        assert.match(newProjectError('Or:ders', 'Orders.clw', projects) ?? '', /invalid/);
        assert.match(newProjectError('Orders', 'Orders.txt', projects) ?? '', /\.clw/);
    });
    test('a name the solution already has is refused', () => {
        assert.match(newProjectError('common', 'common.clw', projects) ?? '', /already/);
    });
});
