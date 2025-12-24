import { commands, window, workspace, Uri, Disposable, ExtensionContext } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("ClassCreationCommands");
logger.setLevel("error");

/**
 * Options for creating a new Clarion class
 */
interface CreateClassOptions {
    className: string;
    incFileName: string;
    clwFileName: string;
    addConstruct: boolean;
    addDestruct: boolean;
    targetFolder: string;
}

/**
 * Validates a Clarion identifier
 */
function isValidClarionIdentifier(name: string): boolean {
    // Must start with letter or underscore, followed by letters, numbers, or underscores
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * Gets the indentation string based on editor configuration
 */
function getIndentString(uri?: Uri): string {
    const config = workspace.getConfiguration('editor', uri);
    const insertSpaces = config.get<boolean>('insertSpaces', false);
    const tabSize = config.get<number>('tabSize', 4);
    return insertSpaces ? ' '.repeat(tabSize) : '\t';
}

/**
 * Generates the .inc file content
 */
function generateIncFileContent(className: string, addConstruct: boolean, addDestruct: boolean, clwFileName: string): string {
    const lines: string[] = [];
    
    // Class definition with proper alignment
    lines.push(`${className}${' '.repeat(Math.max(1, 18 - className.length))}CLASS,TYPE,MODULE('${clwFileName}'),LINK('${clwFileName}')`);
    
    // Add methods if requested
    if (addConstruct) {
        lines.push(`Construct${' '.repeat(9)}PROCEDURE()`);
    }
    if (addDestruct) {
        lines.push(`Destruct${' '.repeat(10)}PROCEDURE()`);
    }
    
    // Add placeholder for additional methods
    lines.push('');
    
    // Close class
    lines.push(`${' '.repeat(18)}END`);
    
    return lines.join('\n');
}

/**
 * Generates the .clw file content
 */
function generateClwFileContent(className: string, addConstruct: boolean, addDestruct: boolean, incFileName: string, indent: string): string {
    const lines: string[] = [];
    
    // MEMBER declaration
    lines.push(`${indent}MEMBER()`);
    lines.push('');
    
    // INCLUDE statement
    lines.push(`${indent}INCLUDE('${incFileName}'),ONCE`);
    lines.push('');
    
    // MAP section
    lines.push(`${indent}MAP`);
    lines.push(`${indent}END`);
    lines.push('');
    lines.push('');
    
    // Constructor implementation
    if (addConstruct) {
        lines.push(`${className}.Construct${' '.repeat(Math.max(1, 10 - className.length))}PROCEDURE()`);
        lines.push('');
        lines.push(`${indent}CODE`);
        lines.push('');
    }
    
    // Destructor implementation
    if (addDestruct) {
        lines.push(`${className}.Destruct${' '.repeat(Math.max(1, 11 - className.length))}PROCEDURE()`);
        lines.push('');
        lines.push(`${indent}CODE`);
        lines.push('');
    }
    
    return lines.join('\n');
}

/**
 * Shows input dialog to collect class creation options
 */
async function showCreateClassDialog(): Promise<CreateClassOptions | undefined> {
    // Step 1: Get class name
    const className = await window.showInputBox({
        prompt: 'Enter the class name',
        placeHolder: 'MyClass',
        validateInput: (value) => {
            if (!value) {
                return 'Class name is required';
            }
            if (!isValidClarionIdentifier(value)) {
                return 'Invalid class name. Must be a valid Clarion identifier (alphanumeric and underscore only)';
            }
            return null;
        }
    });
    
    if (!className) {
        return undefined; // User cancelled
    }
    
    // Step 2: Get include filename (with default)
    const incFileName = await window.showInputBox({
        prompt: 'Enter the include filename',
        value: `${className}.inc`,
        validateInput: (value) => {
            if (!value) {
                return 'Include filename is required';
            }
            if (!value.toLowerCase().endsWith('.inc')) {
                return 'Include filename must end with .inc';
            }
            if (value.includes('/') || value.includes('\\')) {
                return 'Filename only, no path separators allowed';
            }
            return null;
        }
    });
    
    if (!incFileName) {
        return undefined; // User cancelled
    }
    
    // Step 3: Get source filename (with default)
    const clwFileName = await window.showInputBox({
        prompt: 'Enter the source filename',
        value: `${className}.clw`,
        validateInput: (value) => {
            if (!value) {
                return 'Source filename is required';
            }
            if (!value.toLowerCase().endsWith('.clw')) {
                return 'Source filename must end with .clw';
            }
            if (value.includes('/') || value.includes('\\')) {
                return 'Filename only, no path separators allowed';
            }
            if (value.toLowerCase() === incFileName?.toLowerCase()) {
                return 'Source filename must be different from include filename';
            }
            return null;
        }
    });
    
    if (!clwFileName) {
        return undefined; // User cancelled
    }
    
    // Step 4: Ask about Constructor
    const constructChoice = await window.showQuickPick(
        [
            { label: 'Yes', description: 'Add Construct method', value: true },
            { label: 'No', description: 'Skip Construct method', value: false }
        ],
        { placeHolder: 'Add Construct method?' }
    );
    
    if (constructChoice === undefined) {
        return undefined; // User cancelled
    }
    
    // Step 5: Ask about Destructor
    const destructChoice = await window.showQuickPick(
        [
            { label: 'Yes', description: 'Add Destruct method', value: true },
            { label: 'No', description: 'Skip Destruct method', value: false }
        ],
        { placeHolder: 'Add Destruct method?' }
    );
    
    if (destructChoice === undefined) {
        return undefined; // User cancelled
    }
    
    // Step 6: Choose location
    const locationChoice = await window.showQuickPick(
        [
            { label: 'Current Folder', description: 'Create in the folder of the active document', value: 'current' },
            { label: 'Choose Folder...', description: 'Browse for a folder', value: 'choose' }
        ],
        { placeHolder: 'Where should the files be created?' }
    );
    
    if (!locationChoice) {
        return undefined; // User cancelled
    }
    
    let targetFolder: string;
    
    if (locationChoice.value === 'current') {
        // Use current document's folder
        const activeEditor = window.activeTextEditor;
        if (activeEditor && activeEditor.document.uri.scheme === 'file') {
            targetFolder = path.dirname(activeEditor.document.uri.fsPath);
        } else if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
            targetFolder = workspace.workspaceFolders[0].uri.fsPath;
        } else {
            window.showErrorMessage('No folder available. Please open a folder or file first.');
            return undefined;
        }
    } else {
        // Let user choose folder
        const folderUri = await window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Folder',
            title: 'Select folder for class files'
        });
        
        if (!folderUri || folderUri.length === 0) {
            return undefined; // User cancelled
        }
        
        targetFolder = folderUri[0].fsPath;
    }
    
    return {
        className,
        incFileName,
        clwFileName,
        addConstruct: constructChoice.value,
        addDestruct: destructChoice.value,
        targetFolder
    };
}

/**
 * Creates a new Clarion class with .inc and .clw files
 */
async function createClarionClass(): Promise<void> {
    try {
        // Collect options from user
        const options = await showCreateClassDialog();
        
        if (!options) {
            return; // User cancelled
        }
        
        const incFilePath = path.join(options.targetFolder, options.incFileName);
        const clwFilePath = path.join(options.targetFolder, options.clwFileName);
        
        // Check if files already exist
        if (fs.existsSync(incFilePath)) {
            window.showErrorMessage(`File already exists: ${options.incFileName}`, { modal: true });
            return;
        }
        
        if (fs.existsSync(clwFilePath)) {
            window.showErrorMessage(`File already exists: ${options.clwFileName}`, { modal: true });
            return;
        }
        
        // Get indentation preference
        const indent = getIndentString();
        
        // Generate file contents
        const incContent = generateIncFileContent(
            options.className,
            options.addConstruct,
            options.addDestruct,
            options.clwFileName
        );
        
        const clwContent = generateClwFileContent(
            options.className,
            options.addConstruct,
            options.addDestruct,
            options.incFileName,
            indent
        );
        
        // Write files
        fs.writeFileSync(incFilePath, incContent, 'utf8');
        fs.writeFileSync(clwFilePath, clwContent, 'utf8');
        
        logger.info(`Created class files: ${options.incFileName} and ${options.clwFileName}`);
        
        // Open both files in editor
        const incUri = Uri.file(incFilePath);
        const clwUri = Uri.file(clwFilePath);
        
        await window.showTextDocument(incUri, { preview: false });
        await window.showTextDocument(clwUri, { preview: false, viewColumn: 2 });
        
        window.showInformationMessage(`Class ${options.className} created successfully!`);
        
    } catch (error) {
        logger.error('Error creating Clarion class:', error);
        window.showErrorMessage(`Failed to create class: ${error}`);
    }
}

/**
 * Registers class creation commands
 * @param context - Extension context
 * @returns Array of disposables for the registered commands
 */
export function registerClassCreationCommands(context: ExtensionContext): Disposable[] {
    const disposables: Disposable[] = [];
    
    // Register create class command
    const createClassCmd = commands.registerCommand('clarion.createClass', async () => {
        try {
            await createClarionClass();
        } catch (error) {
            logger.error('Error in createClass command:', error);
            window.showErrorMessage(`Failed to create class: ${error}`);
        }
    });
    
    context.subscriptions.push(createClassCmd);
    disposables.push(createClassCmd);
    
    return disposables;
}
