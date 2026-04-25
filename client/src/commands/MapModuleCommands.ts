import * as vscode from 'vscode';
import { getLanguageClient } from '../LanguageClientManager';
import { SolutionCache } from '../SolutionCache';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger('MapModuleCommands');
logger.setLevel('error');

interface AddMapModuleArgs {
    documentUri: string;
    mapEndLine: number;
    firstClwFile: string;
    projectGuid: string;
    isLocalMap?: boolean;
}

interface AddProcedureToModuleArgs {
    documentUri: string;
    moduleEndLine: number;
    referencedFile: string;
    projectGuid: string;
}

interface AddProcedureFromMapArgs {
    documentUri: string;
    mapEndLine: number;
}

/**
 * Returns the editor indent string based on VS Code configuration.
 * Respects editor.insertSpaces and editor.tabSize.
 */
function getIndentString(uri?: vscode.Uri): string {
    const config = vscode.workspace.getConfiguration('editor', uri);
    const insertSpaces = config.get<boolean>('insertSpaces', true);
    const tabSize = config.get<number>('tabSize', 4);
    return insertSpaces ? ' '.repeat(tabSize) : '\t';
}

/**
 * Handles the 'clarion.addMapModule' command triggered by the MAP code action.
 */
async function addMapModule(...args: any[]): Promise<void> {
    // The command args are passed as a single object by the LSP Command
    const params: AddMapModuleArgs = args[0] ?? args;

    if (!params || typeof params.mapEndLine !== 'number') {
        vscode.window.showErrorMessage('Add MODULE: missing command arguments.');
        return;
    }

    try {
        // 1. Prompt for the CLW filename
        const moduleName = await vscode.window.showInputBox({
            prompt: 'New CLW module filename',
            placeHolder: 'MyModule.clw',
            validateInput: (v) => {
                if (!v) return 'Filename is required';
                if (!v.toLowerCase().endsWith('.clw')) return 'Filename must end with .clw';
                return null;
            }
        });
        if (!moduleName) return;

        // 2. Prompt for the procedure name
        const procedureName = await vscode.window.showInputBox({
            prompt: 'Procedure name',
            placeHolder: 'MyProcedure',
            validateInput: (v) => {
                if (!v) return 'Procedure name is required';
                if (!/^[a-zA-Z_][a-zA-Z0-9_:]*$/.test(v)) return 'Invalid identifier';
                return null;
            }
        });
        if (!procedureName) return;

        const client = getLanguageClient();
        if (!client) {
            vscode.window.showErrorMessage('Language server not available.');
            return;
        }

        // 3. Resolve project GUID — fall back to first project if not provided
        let projectGuid = params.projectGuid;
        if (!projectGuid) {
            const solution = SolutionCache.getInstance().getSolutionInfo();
            const projects = solution?.projects ?? [];
            if (projects.length === 0) {
                vscode.window.showErrorMessage('No Clarion project found.');
                return;
            }
            if (projects.length === 1) {
                projectGuid = projects[0].guid;
            } else {
                const pick = await vscode.window.showQuickPick(
                    projects.map(p => ({ label: p.name, description: p.path, guid: p.guid })),
                    { placeHolder: 'Select target project' }
                );
                if (!pick) return;
                projectGuid = pick.guid;
            }
        }

        // 4. Get candidate directories from the RED file
        const dirs = await client.sendRequest<{ label: string; dir: string; section: string }[]>(
            'clarion/getClwDirectories',
            { projectGuid }
        );

        let targetDir: string;
        if (!dirs || dirs.length === 0) {
            vscode.window.showErrorMessage('No CLW directories found in redirection file.');
            return;
        } else if (dirs.length === 1) {
            targetDir = dirs[0].dir;
        } else {
            const pick = await vscode.window.showQuickPick(
                dirs.map(d => ({ label: d.label, dir: d.dir })),
                { placeHolder: 'Select directory for new CLW file' }
            );
            if (!pick) return;
            targetDir = pick.dir;
        }

        // 5. Determine indent string from the active editor config
        const activeUri = vscode.window.activeTextEditor?.document.uri;
        const indentString = getIndentString(activeUri);

        // 6. Create the file and update the project
        const result = await client.sendRequest<{ success: boolean; filePath: string }>(
            'clarion/addModuleWithProcedure',
            {
                projectGuid,
                moduleName,
                procedureName,
                targetDir,
                firstClwFile: params.firstClwFile,
                indentString,
                isLocalMap: params.isLocalMap ?? false
            }
        );

        if (!result?.success) {
            vscode.window.showErrorMessage(`Failed to create ${moduleName}.`);
            return;
        }

        // 7. Insert MODULE block into the MAP before its closing END
        const docUri = vscode.Uri.parse(params.documentUri);
        const edit = new vscode.WorkspaceEdit();
        const insertPos = new vscode.Position(params.mapEndLine, 0);
        const moduleText =
            `${indentString}MODULE('${moduleName}')\n` +
            `${procedureName} PROCEDURE()\n` +
            `${indentString}END\n`;
        edit.insert(docUri, insertPos, moduleText);
        await vscode.workspace.applyEdit(edit);

        // 8. Open the new file
        const newFileUri = vscode.Uri.file(result.filePath);
        await vscode.window.showTextDocument(newFileUri, { preview: false });

        // 9. Refresh the solution tree
        await SolutionCache.getInstance().refresh();

        vscode.window.showInformationMessage(`Created ${moduleName} with procedure ${procedureName}.`);
    } catch (error) {
        logger.error(`❌ addMapModule command failed: ${error instanceof Error ? error.message : String(error)}`);
        vscode.window.showErrorMessage(`Add MODULE failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Handles the 'clarion.addProcedureToModule' command triggered when cursor is inside a MODULE block.
 */
async function addProcedureToModule(...args: any[]): Promise<void> {
    const params: AddProcedureToModuleArgs = args[0] ?? args;

    if (!params || typeof params.moduleEndLine !== 'number' || !params.referencedFile) {
        vscode.window.showErrorMessage('Add PROCEDURE: missing command arguments.');
        return;
    }

    try {
        // 1. Prompt for procedure name
        const procedureName = await vscode.window.showInputBox({
            prompt: 'Procedure name',
            placeHolder: 'MyProcedure',
            validateInput: (v) => {
                if (!v) return 'Procedure name is required';
                if (!/^[a-zA-Z_][a-zA-Z0-9_:]*$/.test(v)) return 'Invalid identifier';
                return null;
            }
        });
        if (!procedureName) return;

        const client = getLanguageClient();
        if (!client) {
            vscode.window.showErrorMessage('Language server not available.');
            return;
        }

        // 2. Resolve the CLW file path via the server
        const resolved = await client.sendRequest<{ clwFilePath: string } | null>(
            'clarion/resolveModuleClwPath',
            { referencedFile: params.referencedFile, projectGuid: params.projectGuid }
        );

        if (!resolved?.clwFilePath) {
            vscode.window.showErrorMessage(`Cannot resolve CLW file for module '${params.referencedFile}'.`);
            return;
        }

        const activeUri = vscode.window.activeTextEditor?.document.uri;
        const indentString = getIndentString(activeUri);

        // 3. Open the CLW document to get its live line count
        const clwUri = vscode.Uri.file(resolved.clwFilePath);
        const clwDoc = await vscode.workspace.openTextDocument(clwUri);
        const clwInsertLine = clwDoc.lineCount;

        // 4. Build both edits
        const edit = new vscode.WorkspaceEdit();

        // Insert procedure declaration into the MODULE block (before END)
        const mapUri = vscode.Uri.parse(params.documentUri);
        edit.insert(mapUri, new vscode.Position(params.moduleEndLine, 0), `${procedureName} PROCEDURE()\n`);

        // Append procedure implementation to the CLW file
        const padding = ' '.repeat(Math.max(1, 16 - procedureName.length));
        const clwStub =
            `\r\n${procedureName}${padding}PROCEDURE()\r\n` +
            `${indentString}CODE\r\n`;
        edit.insert(clwUri, new vscode.Position(clwInsertLine, 0), clwStub);

        await vscode.workspace.applyEdit(edit);

        // 5. Show the CLW file at the new procedure
        await vscode.window.showTextDocument(clwDoc, { preview: false });
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const procLine = clwInsertLine + 1; // after the blank separator line
            const pos = new vscode.Position(procLine, 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos));
        }

        vscode.window.showInformationMessage(`Added procedure '${procedureName}' to ${params.referencedFile}.`);
    } catch (error) {
        logger.error(`❌ addProcedureToModule failed: ${error instanceof Error ? error.message : String(error)}`);
        vscode.window.showErrorMessage(`Add PROCEDURE failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Handles 'clarion.addProcedureFromMap' — adds a procedure to the current file
 * when the cursor is in a MAP block (outside any MODULE block).
 */
async function addProcedureFromMap(...args: any[]): Promise<void> {
    const params: AddProcedureFromMapArgs = args[0] ?? args;

    if (!params || typeof params.mapEndLine !== 'number') {
        vscode.window.showErrorMessage('Add PROCEDURE: missing command arguments.');
        return;
    }

    try {
        const procedureName = await vscode.window.showInputBox({
            prompt: 'Procedure name',
            placeHolder: 'MyProcedure',
            validateInput: (v) => {
                if (!v) return 'Procedure name is required';
                if (!/^[a-zA-Z_][a-zA-Z0-9_:]*$/.test(v)) return 'Invalid identifier';
                return null;
            }
        });
        if (!procedureName) return;

        const fileUri = vscode.Uri.parse(params.documentUri);
        const indentString = getIndentString(fileUri);
        const padding = ' '.repeat(Math.max(1, 16 - procedureName.length));

        // Open the current file to get its live line count
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const insertLine = doc.lineCount;

        const edit = new vscode.WorkspaceEdit();
        // Declaration directly in the MAP (before its END)
        edit.insert(fileUri, new vscode.Position(params.mapEndLine, 0), `${procedureName} PROCEDURE()\n`);
        // Implementation appended at end of file
        const stub = `\r\n${procedureName}${padding}PROCEDURE()\r\n${indentString}CODE\r\n`;
        edit.insert(fileUri, new vscode.Position(insertLine, 0), stub);
        await vscode.workspace.applyEdit(edit);

        // Navigate to the new procedure
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        const procLine = insertLine + 1;
        const pos = new vscode.Position(procLine, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos));

        vscode.window.showInformationMessage(`Added procedure '${procedureName}'.`);
    } catch (error) {
        logger.error(`❌ addProcedureFromMap failed: ${error instanceof Error ? error.message : String(error)}`);
        vscode.window.showErrorMessage(`Add PROCEDURE failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Registers the MAP module command
 */
export function registerMapModuleCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand('clarion.addMapModule', addMapModule),
        vscode.commands.registerCommand('clarion.addProcedureToModule', addProcedureToModule),
        vscode.commands.registerCommand('clarion.addProcedureFromMap', addProcedureFromMap)
    ];
}
