import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface AddIncludeArgs {
    includeFile: string;
    targetFile: string;  // URI or filename
    location: 'current' | 'member';
}

interface AddIncludeAndConstantsArgs {
    includeFile: string;
    targetFile: string;  // URI or filename
    location: 'current' | 'member';
    className: string;
    projectPath: string;
    constants: Array<{ name: string; type: string; relatedFile?: string }>;
    mode: 'link' | 'dll';
}

/**
 * Registers commands related to adding INCLUDE statements to Clarion files
 */
export function registerIncludeStatementCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Command to add INCLUDE statement
    const addIncludeCmd = vscode.commands.registerCommand(
        'clarion.addIncludeStatement',
        async (...args: any[]) => {
            try {
                const argsObject = args[0] as AddIncludeArgs;
                await addIncludeStatementToFile(argsObject);
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to add INCLUDE: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    );

    // Command to add INCLUDE + Constants in one action
    const addIncludeAndConstantsCmd = vscode.commands.registerCommand(
        'clarion.addIncludeAndConstants',
        async (...args: any[]) => {
            try {
                const argsObject = args[0] as AddIncludeAndConstantsArgs;
                // First, add the INCLUDE
                await addIncludeStatementToFile({
                    includeFile: argsObject.includeFile,
                    targetFile: argsObject.targetFile,
                    location: argsObject.location
                });
                
                // Then add the constants (reuse the existing command)
                await vscode.commands.executeCommand('clarion.addClassConstants', {
                    className: argsObject.className,
                    projectPath: argsObject.projectPath,
                    constants: argsObject.constants,
                    mode: argsObject.mode
                });
                
                vscode.window.showInformationMessage(
                    `✅ Added INCLUDE and constants for ${argsObject.className} (${argsObject.mode} mode)`
                );
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to add INCLUDE and constants: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    );

    disposables.push(addIncludeCmd, addIncludeAndConstantsCmd);
    return disposables;
}

/**
 * Adds an INCLUDE statement to a Clarion file
 */
async function addIncludeStatementToFile(args: AddIncludeArgs): Promise<void> {
    const { includeFile, targetFile, location } = args;

    let targetUri: vscode.Uri;

    if (location === 'current') {
        // Target is the current file (already a URI)
        targetUri = vscode.Uri.parse(targetFile);
    } else {
        // Target is a MEMBER file - need to resolve it
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            throw new Error('No active editor');
        }

        const currentDir = path.dirname(activeEditor.document.uri.fsPath);
        const memberPath = path.join(currentDir, targetFile);
        
        if (!fs.existsSync(memberPath)) {
            throw new Error(`MEMBER file not found: ${memberPath}`);
        }

        targetUri = vscode.Uri.file(memberPath);
    }

    // Open the target file
    const doc = await vscode.workspace.openTextDocument(targetUri);
    const text = doc.getText();

    // Find the best position to insert the INCLUDE
    const insertPosition = findIncludeInsertPosition(text);

    if (insertPosition === null) {
        throw new Error('Could not determine where to insert INCLUDE statement');
    }

    // Create the INCLUDE statement
    const includeStatement = `  INCLUDE('${includeFile}'),ONCE\n`;

    // Create workspace edit
    const edit = new vscode.WorkspaceEdit();
    edit.insert(targetUri, insertPosition, includeStatement);

    // Apply edit
    const success = await vscode.workspace.applyEdit(edit);

    if (success) {
        vscode.window.showInformationMessage(
            `✅ Added INCLUDE('${includeFile}'),ONCE to ${path.basename(targetUri.fsPath)}`
        );

        // Save the file
        const updatedDoc = await vscode.workspace.openTextDocument(targetUri);
        await updatedDoc.save();
    } else {
        throw new Error('Failed to apply workspace edit');
    }
}

/**
 * Finds the best position to insert an INCLUDE statement
 * Logic:
 * 1. After PROGRAM/MEMBER line (if exists)
 * 2. After any existing INCLUDE statements
 * 3. Before MAP section (if exists)
 * 4. Before first PROCEDURE (if exists)
 * 5. At start of file
 */
function findIncludeInsertPosition(text: string): vscode.Position | null {
    const lines = text.split('\n');
    
    let programLineIndex = -1;
    let lastIncludeLineIndex = -1;
    let mapLineIndex = -1;
    let firstProcLineIndex = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineUpper = line.toUpperCase();

        // Skip comments
        if (lineUpper.startsWith('!')) {
            continue;
        }

        // Find PROGRAM or MEMBER
        if ((lineUpper.startsWith('PROGRAM') || lineUpper.startsWith('MEMBER')) && programLineIndex === -1) {
            programLineIndex = i;
        }

        // Find INCLUDE statements
        if (lineUpper.startsWith('INCLUDE')) {
            lastIncludeLineIndex = i;
        }

        // Find MAP
        if (lineUpper === 'MAP' && mapLineIndex === -1) {
            mapLineIndex = i;
        }

        // Find first PROCEDURE or FUNCTION
        if ((lineUpper.startsWith('PROCEDURE') || lineUpper.startsWith('FUNCTION')) && firstProcLineIndex === -1) {
            firstProcLineIndex = i;
        }
    }

    // Decide insert position
    let insertLineIndex: number;

    if (lastIncludeLineIndex !== -1) {
        // After last INCLUDE
        insertLineIndex = lastIncludeLineIndex + 1;
    } else if (programLineIndex !== -1) {
        // After PROGRAM/MEMBER
        insertLineIndex = programLineIndex + 1;
    } else if (mapLineIndex !== -1) {
        // Before MAP
        insertLineIndex = mapLineIndex;
    } else if (firstProcLineIndex !== -1) {
        // Before first PROCEDURE
        insertLineIndex = firstProcLineIndex;
    } else {
        // At start
        insertLineIndex = 0;
    }

    return new vscode.Position(insertLineIndex, 0);
}
