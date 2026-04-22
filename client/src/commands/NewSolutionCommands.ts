import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("NewSolutionCommands");
logger.setLevel("error");

/** Generates an uppercase GUID like {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX} */
function generateGuid(): string {
    return `{${crypto.randomUUID().toUpperCase()}}`;
}

function buildSlnContent(name: string, projectGuid: string): string {
    return [
        '\uFEFF',
        'Microsoft Visual Studio Solution File, Format Version 12.00',
        '# Visual Studio 2012',
        '# Clarion 2.1.0.2447',
        `Project("{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}") = "${name}", "${name}.cwproj", "${projectGuid}"`,
        'EndProject',
        'Global',
        '\tGlobalSection(SolutionConfigurationPlatforms) = preSolution',
        '\t\tDebug|Win32 = Debug|Win32',
        '\t\tRelease|Win32 = Release|Win32',
        '\tEndGlobalSection',
        '\tGlobalSection(ProjectConfigurationPlatforms) = postSolution',
        `\t\t${projectGuid}.Debug|Win32.Build.0 = Debug|Win32`,
        `\t\t${projectGuid}.Debug|Win32.ActiveCfg = Debug|Win32`,
        `\t\t${projectGuid}.Release|Win32.Build.0 = Release|Win32`,
        `\t\t${projectGuid}.Release|Win32.ActiveCfg = Release|Win32`,
        '\tEndGlobalSection',
        'EndGlobal',
        ''
    ].join('\r\n');
}

function buildCwprojContent(name: string, projectGuid: string, clwName: string): string {
    return [
        '\uFEFF<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
        '  <PropertyGroup>',
        `    <ProjectGuid>${projectGuid}</ProjectGuid>`,
        `    <Configuration Condition=" '$(Configuration)' == '' ">Debug</Configuration>`,
        `    <Platform Condition=" '$(Platform)' == '' ">Win32</Platform>`,
        '    <OutputType>Exe</OutputType>',
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
        `    <Compile Include="${clwName}" />`,
        '  </ItemGroup>',
        '  <Import Project="$(ClarionBinPath)\\SoftVelocity.Build.Clarion.targets" />',
        '</Project>'
    ].join('\r\n');
}

function buildClwContent(): string {
    return [
        '  PROGRAM',
        '',
        '  MAP',
        '  END',
        '',
        '  CODE',
        "  MESSAGE('Hello World')"
    ].join('\r\n');
}

/**
 * Creates a new Clarion solution (.sln + .cwproj + .clw) in the open workspace folder.
 */
export async function newSolution(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Open a folder first before creating a new Clarion solution.');
        return;
    }

    const folderPath = workspaceFolders[0].uri.fsPath;
    const defaultName = path.basename(folderPath);

    // Prompt for solution name
    const solutionName = await vscode.window.showInputBox({
        prompt: 'Solution name',
        value: defaultName,
        validateInput: (v) => {
            if (!v || v.trim().length === 0) return 'Solution name cannot be empty';
            if (/[\\/:*?"<>|]/.test(v)) return 'Solution name contains invalid characters';
            return undefined;
        }
    });
    if (!solutionName) return;

    const trimmedName = solutionName.trim();

    // Prompt for main CLW filename
    const clwInput = await vscode.window.showInputBox({
        prompt: 'Main source file name',
        value: `${trimmedName}.clw`,
        validateInput: (v) => {
            if (!v || v.trim().length === 0) return 'File name cannot be empty';
            if (!v.trim().toLowerCase().endsWith('.clw')) return 'File must have a .clw extension';
            if (/[\\/:*?"<>|]/.test(v.trim())) return 'File name contains invalid characters';
            return undefined;
        }
    });
    if (!clwInput) return;

    const clwName = clwInput.trim();
    const projectGuid = generateGuid();

    const slnPath = path.join(folderPath, `${trimmedName}.sln`);
    const cwprojPath = path.join(folderPath, `${trimmedName}.cwproj`);
    const clwPath = path.join(folderPath, clwName);

    // Warn if any file already exists
    const existing = [slnPath, cwprojPath, clwPath].filter(f => fs.existsSync(f));
    if (existing.length > 0) {
        const names = existing.map(f => path.basename(f)).join(', ');
        const answer = await vscode.window.showWarningMessage(
            `The following file(s) already exist: ${names}. Overwrite?`,
            { modal: true },
            'Overwrite'
        );
        if (answer !== 'Overwrite') return;
    }

    try {
        const newlyCreated: string[] = [];
        const writeIfNew = (filePath: string, content: string) => {
            if (!fs.existsSync(filePath)) newlyCreated.push(filePath);
            fs.writeFileSync(filePath, content, 'utf8');
        };

        writeIfNew(slnPath, buildSlnContent(trimmedName, projectGuid));
        writeIfNew(cwprojPath, buildCwprojContent(trimmedName, projectGuid, clwName));
        writeIfNew(clwPath, buildClwContent());

        logger.info(`✅ Created new solution: ${trimmedName} in ${folderPath}`);

        // Open the solution — this prompts for Clarion version/config
        const opened = await vscode.commands.executeCommand<boolean>('clarion.openDetectedSolution', slnPath);

        if (!opened) {
            // User cancelled — remove files we just created
            for (const f of newlyCreated) {
                try { fs.unlinkSync(f); } catch { /* ignore */ }
            }
            return;
        }

    } catch (err) {
        logger.error(`❌ Failed to create solution files: ${err}`);
        vscode.window.showErrorMessage(`Failed to create solution: ${err instanceof Error ? err.message : String(err)}`);
    }
}

export function registerNewSolutionCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand('clarion.newSolution', newSolution)
    ];
}
