import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';

interface ClassConstant {
    name: string;
    type: 'Link' | 'DLL';
    relatedFile?: string;
}

interface AddConstantsArgs {
    className: string;
    projectPath: string;
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
 * Adds class constants to the project file
 */
async function addClassConstantsToProject(args: AddConstantsArgs): Promise<void> {
    const { className, projectPath, constants, mode } = args;

    // If mode is provided (from Code Action), use it directly
    let useLinkMode: boolean;
    
    if (mode) {
        useLinkMode = mode === 'link';
    } else {
        // Ask user which mode they want
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
        return; // User cancelled
    }
    
    useLinkMode = modeSelection.value === 'link';
    }

    // Generate constant definitions
    const definitions = generateConstantDefinitions(constants, useLinkMode);
    
    console.log(`Generated definitions: ${definitions}`);
    console.log(`Encoded for XML: ${encodeForXml(definitions)}`);

    // Find .cwproj file
    const projectFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(projectPath, '*.cwproj'),
        null,
        1
    );

    if (projectFiles.length === 0) {
        throw new Error('No .cwproj file found in project directory');
    }

    const projectFile = projectFiles[0];

    // Read and parse project file
    const content = await fs.promises.readFile(projectFile.fsPath, 'utf-8');
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(content);

    // Find DefineConstants in PropertyGroup
    const project = result.Project;
    if (!project || !project.PropertyGroup) {
        throw new Error('Invalid project file structure');
    }

    const propertyGroups = Array.isArray(project.PropertyGroup)
        ? project.PropertyGroup
        : [project.PropertyGroup];

    let updated = false;

    for (const group of propertyGroups) {
        if (group.DefineConstants) {
            // Decode existing constants
            const existing = decodeXmlEntities(group.DefineConstants[0]);

            // Append new constants (with a semicolon if existing doesn't end with one)
            const separator = existing.endsWith(';') ? '' : ';';
            const newConstants = existing + separator + definitions;

            // Encode for XML
            group.DefineConstants[0] = encodeForXml(newConstants);
            updated = true;
            break;
        }
    }

    if (!updated) {
        // No DefineConstants found, add to first PropertyGroup
        if (propertyGroups.length > 0) {
            propertyGroups[0].DefineConstants = [encodeForXml(definitions)];
            updated = true;
        }
    }

    if (!updated) {
        throw new Error('Could not update DefineConstants in project file');
    }

    // Build XML back
    const builder = new xml2js.Builder({
        xmldec: { version: '1.0', encoding: 'utf-8' }
    });
    const xml = builder.buildObject(result);

    // Create workspace edit
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(Number.MAX_SAFE_INTEGER, 0)
    );
    edit.replace(projectFile, fullRange, xml);

    // Apply edit
    const success = await vscode.workspace.applyEdit(edit);

    if (success) {
        // Show success message with details
        const constantList = constants.map(c => c.name).join(', ');
        const modeDesc = useLinkMode ? 'Link Mode (static)' : 'DLL Mode (dynamic)';
        
        vscode.window.showInformationMessage(
            `✅ Added ${className} constants (${modeDesc}): ${constantList}`
        );

        // Save the file
        const doc = await vscode.workspace.openTextDocument(projectFile);
        await doc.save();
    } else {
        throw new Error('Failed to apply workspace edit');
    }
}

/**
 * Generates constant definitions string
 * Format: {value}%3b{constantName}=&gt;{value}%3b{constantName}=&gt;
 * Example: 1%3bStringTheoryLinkMode=&gt;0%3bStringTheoryDllMode=&gt;
 */
function generateConstantDefinitions(constants: ClassConstant[], useLinkMode: boolean): string {
    const definitions: string[] = [];

    for (const constant of constants) {
        let value: string;
        
        if (constant.type === 'Link') {
            value = useLinkMode ? '1' : '0';
        } else if (constant.type === 'DLL') {
            value = useLinkMode ? '0' : '1';
        } else {
            continue;
        }
        
        // Format: {value}%3b{constantName}=&gt;
        definitions.push(`${value}%3b${constant.name}=>`);
    }

    return definitions.join('');
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
