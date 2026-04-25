import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getLanguageClient } from '../LanguageClientManager';

interface ClassConstant {
    name: string;
    type: 'Link' | 'DLL';
    relatedFile?: string;
}

interface AddConstantsArgs {
    className: string;
    projectPath: string;
    cwprojPath?: string;     // Specific .cwproj file path — avoids wrong-file match when multiple cwprojs share a directory
    constants: ClassConstant[];
    mode?: 'link' | 'dll'; // Optional: if provided, skip the Quick Pick
}

/**
 * Registers commands related to adding class constants to project files
 */
export function registerClassConstantCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Command to add class constants to project file
    const addConstantsCmd = vscode.commands.registerCommand(
        'clarion.addClassConstants',
        async (...args: any[]) => {
            try {
                // VS Code passes command args as array - get first element
                const argsObject = args[0] as AddConstantsArgs;
                await addClassConstantsToProject(argsObject);
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to add constants: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    );

    disposables.push(addConstantsCmd);
    return disposables;
}

/**
 * Adds class constants to the project file using string-based replacement
 * to avoid xml2js round-trip issues (namespace loss, formatting changes, etc.)
 */
async function addClassConstantsToProject(args: AddConstantsArgs): Promise<void> {
    const { className, projectPath, cwprojPath, constants, mode } = args;

    let useLinkMode: boolean;

    if (mode) {
        useLinkMode = mode === 'link';
    } else {
        const modeSelection = await vscode.window.showQuickPick(
            [
                {
                    label: '$(link) Link Mode',
                    description: 'Compile class code into EXE/DLL (static linking)',
                    detail: 'LinkMode=>1, DllMode=>0',
                    value: 'link'
                },
                {
                    label: '$(library) DLL Mode',
                    description: 'Use class from external DLL (dynamic linking)',
                    detail: 'LinkMode=>0, DllMode=>1',
                    value: 'dll'
                }
            ],
            {
                title: `Add Constants for ${className}`,
                placeHolder: 'Select linking mode'
            }
        );

        if (!modeSelection) {
            return;
        }

        useLinkMode = modeSelection.value === 'link';
    }

    const definitions = generateConstantDefinitions(constants, useLinkMode);

    // Resolve .cwproj file — use the specific path if provided (avoids wrong-file match
    // when multiple .cwproj files share the same directory)
    let projectFilePath: string;
    if (cwprojPath) {
        projectFilePath = cwprojPath;
    } else {
        const projectFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(projectPath, '*.cwproj'),
            null,
            1
        );

        if (projectFiles.length === 0) {
            throw new Error(`No .cwproj file found in: ${projectPath}`);
        }

        projectFilePath = projectFiles[0].fsPath;
    }

    let content = await fs.promises.readFile(projectFilePath, 'utf-8');
    // Strip UTF-8 BOM if present — VS Code's TextDocument strips it, so keeping it
    // causes it to be re-inserted as a visible character when writing back via WorkspaceEdit
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);

    // Use string replacement to avoid xml2js round-trip corruption
    const defineConstantsRegex = /<DefineConstants>([\s\S]*?)<\/DefineConstants>/i;
    const existingMatch = defineConstantsRegex.exec(content);

    if (existingMatch) {
        // Append to existing DefineConstants
        const existing = decodeXmlEntities(existingMatch[1]);
        const separator = existing.endsWith(';') ? '' : ';';
        const newConstants = existing + separator + definitions;
        content = content.replace(defineConstantsRegex, `<DefineConstants>${encodeForXml(newConstants)}</DefineConstants>`);
    } else {
        // No DefineConstants — insert into the first (unconditional) PropertyGroup
        // Find indentation by looking at the line before </PropertyGroup>
        const firstPGClose = /^([ \t]*)<\/PropertyGroup>/m.exec(content);
        const indent = firstPGClose ? firstPGClose[1] + '  ' : '    ';
        content = content.replace(
            /(<\/PropertyGroup>)/,
            `${indent}<DefineConstants>${encodeForXml(definitions)}</DefineConstants>\n$1`
        );
    }

    // Write the modified content back, preserving all other XML formatting
    const cwprojUri = vscode.Uri.file(projectFilePath);
    const doc = await vscode.workspace.openTextDocument(cwprojUri);
    const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        doc.lineAt(doc.lineCount - 1).range.end
    );

    const edit = new vscode.WorkspaceEdit();
    edit.replace(cwprojUri, fullRange, content);
    const success = await vscode.workspace.applyEdit(edit);

    if (success) {
        const constantList = constants.map(c => c.name).join(', ');
        const modeDesc = useLinkMode ? 'Link Mode (static)' : 'DLL Mode (dynamic)';
        vscode.window.showInformationMessage(
            `✅ Added ${className} constants (${modeDesc}): ${constantList}`
        );
        const updatedDoc = await vscode.workspace.openTextDocument(cwprojUri);
        await updatedDoc.save();

        // Notify the server that project constants changed so it re-validates
        // all open documents and clears the missing-constants diagnostic immediately.
        const client = getLanguageClient();
        if (client) {
            client.sendNotification('clarion/projectConstantsChanged');
        }
    } else {
        throw new Error('Failed to apply workspace edit');
    }
}

/**
 * Format: {constantName}=>{value};{constantName}=>{value};
 * Example: StringTheoryLinkMode=>1;StringTheoryDllMode=>0;
 */
function generateConstantDefinitions(constants: ClassConstant[], useLinkMode: boolean): string {
    const parts: string[] = [];

    for (const constant of constants) {
        let value: string;
        
        if (constant.type === 'Link') {
            value = useLinkMode ? '1' : '0';
        } else if (constant.type === 'DLL') {
            value = useLinkMode ? '0' : '1';
        } else {
            continue;
        }
        
        // Format: {constantName}=>{value};
        parts.push(`${constant.name}=>${value};`);
    }

    return parts.join('');
}

/**
 * Decodes XML entities
 */
function decodeXmlEntities(encoded: string): string {
    return encoded
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/%3b/gi, ';');
}

/**
 * Encodes constant definitions for XML DefineConstants
 * Note: xml2js will automatically escape XML entities (&gt;, &lt;, etc.)
 * We just need to URL-encode the semicolons
 */
function encodeForXml(definitions: string): string {
    // Only URL-encode semicolons - xml2js will handle XML entity encoding
    return definitions.replace(/;/g, '%3b');
}
