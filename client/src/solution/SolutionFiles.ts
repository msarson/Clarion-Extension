import * as crypto from 'crypto';

/**
 * The .sln and .cwproj files New Solution writes (#763: one project per program, EXE or DLL).
 * No vscode here, so the content is unit-tested on its own.
 */
export interface SlnProject { name: string; guid: string }
export interface CwprojSpec { name: string; guid: string; compile: string[]; kind: 'exe' | 'dll' }

/** Generates an uppercase GUID like {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX} */
export function generateGuid(): string {
    return `{${crypto.randomUUID().toUpperCase()}}`;
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** MSBuild reads % $ @ ' ; ? * in an item path as syntax: write them as %XX, as the Clarion IDE does. */
const msbuildPath = (s: string) => s.replace(/[%$@';?*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));

export function buildSlnContent(projects: SlnProject[]): string {
    return [
        '﻿',
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
        '﻿<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
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
        ...spec.compile.map(f => `    <Compile Include="${xml(msbuildPath(f))}" />`),
        '  </ItemGroup>',
        '  <Import Project="$(ClarionBinPath)\\SoftVelocity.Build.Clarion.targets" />',
        '</Project>'
    ].join('\r\n');
}
