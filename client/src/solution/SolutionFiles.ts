import * as crypto from 'crypto';

/**
 * The .sln and .cwproj files New Solution writes (#763: one project per program, EXE or DLL).
 * No vscode here, so the content is unit-tested on its own.
 */
export interface SlnProject { name: string; guid: string }
export interface CwprojSpec {
    name: string; guid: string; compile: string[]; kind: 'exe' | 'dll'; references?: SlnProject[];
    /** #811: a legacy .prj/.pr the project includes (Projects to include), relative to the .cwproj. */
    legacyProject?: string;
}

/**
 * #763 — the export file of a DLL whose prototypes mark their exports with EXPORT: the linker
 * needs <name>.exp to build a DLL at all, and with EXPORT on the prototypes an empty EXPORTS list
 * is enough (compiler-verified on Clarion 10). The name is in capitals, as the generator writes it.
 */
export function buildMinimalExpContent(name: string): string {
    return `LIBRARY '${name.toUpperCase()}' GUI\r\nEXPORTS\r\n`;
}

/** Generates an uppercase GUID like {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX} */
export function generateGuid(): string {
    return `{${crypto.randomUUID().toUpperCase()}}`;
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** MSBuild reads % $ @ ' ; ? * in an item path as syntax: write them as %XX, as the Clarion IDE does. */
const msbuildPath = (s: string) => s.replace(/[%$@';?*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));

export function buildSlnContent(projects: SlnProject[]): string {
    return [
        '\uFEFF',
        'Microsoft Visual Studio Solution File, Format Version 12.00',
        '# Visual Studio 2012',
        '# Clarion 2.1.0.2447',
        ...projects.flatMap(p => [
            `Project("{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}") = "${p.name}", "${p.name}.cwproj", "${p.guid}"`,
            'EndProject',
        ]),
        'Global',
        '\tGlobalSection(SolutionConfigurationPlatforms) = preSolution',
        '\t\tDebug|Win32 = Debug|Win32',
        '\t\tRelease|Win32 = Release|Win32',
        '\tEndGlobalSection',
        '\tGlobalSection(ProjectConfigurationPlatforms) = postSolution',
        ...projects.flatMap(p => [
            `\t\t${p.guid}.Debug|Win32.Build.0 = Debug|Win32`,
            `\t\t${p.guid}.Debug|Win32.ActiveCfg = Debug|Win32`,
            `\t\t${p.guid}.Release|Win32.Build.0 = Release|Win32`,
            `\t\t${p.guid}.Release|Win32.ActiveCfg = Release|Win32`,
        ]),
        '\tEndGlobalSection',
        'EndGlobal',
        ''
    ].join('\r\n');
}

export function buildCwprojContent(spec: CwprojSpec): string {
    const name = xml(spec.name);
    return [
        '\uFEFF<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
        '  <PropertyGroup>',
        `    <ProjectGuid>${spec.guid}</ProjectGuid>`,
        `    <Configuration Condition=" '$(Configuration)' == '' ">Debug</Configuration>`,
        `    <Platform Condition=" '$(Platform)' == '' ">Win32</Platform>`,
        // A generated DLL project is Library with the runtime in a DLL; <Model> is the runtime, not the output.
        ...(spec.kind === 'dll' ? ['    <OutputType>Library</OutputType>', '    <Model>Dll</Model>'] : ['    <OutputType>Exe</OutputType>']),
        `    <RootNamespace>${name}</RootNamespace>`,
        `    <AssemblyName>${name}</AssemblyName>`,
        `    <OutputName>${name}</OutputName>`,
        '  </PropertyGroup>',
        `  <PropertyGroup Condition=" '$(Configuration)' == 'Debug' ">`,
        '    <DebugSymbols>True</DebugSymbols>',
        '    <DebugType>Full</DebugType>',
        '    <vid>full</vid>',
        '    <check_stack>True</check_stack>',
        '    <check_index>True</check_index>',
        '  </PropertyGroup>',
        `  <PropertyGroup Condition=" '$(Configuration)' == 'Release' ">`,
        '    <DebugSymbols>False</DebugSymbols>',
        '    <DebugType>None</DebugType>',
        '    <vid>off</vid>',
        '    <check_stack>False</check_stack>',
        '    <check_index>False</check_index>',
        '  </PropertyGroup>',
        '  <ItemGroup>',
        // #811: the build runs the .prj's #compile lines (with their own defines) but links only the
        // Compile items, so every source is listed too (compiler-verified on Clarion 10).
        ...(spec.legacyProject ? [`    <Include Include="${xml(msbuildPath(spec.legacyProject))}" />`] : []),
        ...spec.compile.map(f => `    <Compile Include="${xml(msbuildPath(f))}" />`),
        '  </ItemGroup>',
        // #763: the DLLs this project imports from, which also builds them first.
        ...(spec.references?.length ? [
            '  <ItemGroup>',
            ...spec.references.flatMap(r => [
                `    <ProjectReference Include="${xml(msbuildPath(r.name + '.cwproj'))}">`,
                `      <Project>${r.guid}</Project>`,
                `      <Name>${xml(r.name)}</Name>`,
                '    </ProjectReference>',
            ]),
            '  </ItemGroup>',
        ] : []),
        '  <Import Project="$(ClarionBinPath)\\SoftVelocity.Build.Clarion.targets" />',
        '</Project>'
    ].join('\r\n');
}

/**
 * A new program's main source. #795: an EXE's main CODE runs it; a DLL's is empty, as the
 * generator writes it (a DLL's procedures are called, its program never runs). #796: the
 * message's title is the project's name.
 */
export function buildProgramContent(kind: 'exe' | 'dll', name: string): string {
    const title = name.replace(/'/g, "''");
    return [
        '  PROGRAM',
        '',
        '  MAP',
        '  END',
        '',
        '  CODE',
        ...(kind === 'exe' ? [`  MESSAGE('Hello World','${title}')`] : []),
        '',
    ].join('\r\n').replace(/\r\n$/, kind === 'dll' ? '\r\n' : '');
}

/**
 * #795 — the files of a project added from Solution Properties, relative to the solution's
 * folder: its .cwproj, its main program and, for a DLL, the export file it cannot link without.
 * #796: all in `folder` (backslashed, below the solution's folder) when one is given; the
 * .cwproj names its sources from its own folder.
 */
export function newProjectFiles(spec: { name: string; kind: 'exe' | 'dll'; mainFile: string; guid: string; folder?: string }): { path: string; content: string }[] {
    const at = (file: string) => spec.folder ? `${spec.folder}\\${file}` : file;
    const files = [
        { path: at(`${spec.name}.cwproj`), content: buildCwprojContent({ name: spec.name, guid: spec.guid, compile: [spec.mainFile], kind: spec.kind }) },
        { path: at(spec.mainFile), content: buildProgramContent(spec.kind, spec.name) },
    ];
    if (spec.kind === 'dll') files.push({ path: at(`${spec.name}.exp`), content: buildMinimalExpContent(spec.name) });
    return files;
}
