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
                indentString
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
 * Registers the MAP module command
 */
export function registerMapModuleCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand('clarion.addMapModule', addMapModule)
    ];
}
