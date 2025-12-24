import { commands, window, workspace, Uri, Position, Range, Selection, TextEditor, Disposable, ExtensionContext } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("ImplementationCommands");
logger.setLevel("error");

/**
 * Information about a method declaration
 */
interface MethodDeclaration {
    methodName: string;
    fullSignature: string;
    parameters: string;
    returnType: string | null;
    parameterCount: number;
}

/**
 * Information about a class context
 */
interface ClassContext {
    className: string;
    moduleFile: string | null;
}

/**
 * Extracts method declaration from current line
 */
function parseMethodDeclaration(line: string): MethodDeclaration | null {
    // Match: MethodName      PROCEDURE(params)  or  MethodName PROCEDURE(params),returnType
    const match = line.match(/^(\w+)\s+PROCEDURE\s*\(([^)]*)\)\s*(,\s*\w+\s*)?/i);
    
    if (!match) {
        return null;
    }
    
    const methodName = match[1].trim();
    const parameters = match[2].trim();
    const returnType = match[3] ? match[3].trim() : null;
    const parameterCount = countParameters(parameters);
    
    return {
        methodName,
        fullSignature: line.trim(),
        parameters,
        returnType,
        parameterCount
    };
}

/**
 * Counts parameters in a parameter list
 * Handles commas inside nested parentheses
 */
function countParameters(paramList: string): number {
    if (!paramList || paramList.trim() === '') {
        return 0;
    }
    
    let depth = 0;
    let commaCount = 0;
    
    for (const char of paramList) {
        if (char === '(') {
            depth++;
        } else if (char === ')') {
            depth--;
        } else if (char === ',' && depth === 0) {
            commaCount++;
        }
    }
    
    // Parameter count = commas + 1
    return commaCount + 1;
}

/**
 * Finds the class context by searching upward from current line
 */
function findClassContext(document: any, currentLine: number): ClassContext | null {
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    
    // Search upward for CLASS declaration
    for (let i = currentLine; i >= 0; i--) {
        const line = lines[i];
        
        // Match: ClassName    CLASS,TYPE,MODULE('file.clw'),LINK('file.clw')
        const classMatch = line.match(/^(\w+)\s+CLASS.*?MODULE\s*\(\s*'([^']+)'\s*\)/i);
        
        if (classMatch) {
            return {
                className: classMatch[1],
                moduleFile: classMatch[2]
            };
        }
        
        // Also check for CLASS without MODULE (implementation in same file)
        const classNoModuleMatch = line.match(/^(\w+)\s+CLASS/i);
        if (classNoModuleMatch) {
            return {
                className: classNoModuleMatch[1],
                moduleFile: null
            };
        }
    }
    
    return null;
}

/**
 * Resolves the full path to a module file
 */
async function resolveModuleFilePath(moduleFileName: string, currentFilePath: string): Promise<string | null> {
    // Try current directory first
    const currentDir = path.dirname(currentFilePath);
    const localPath = path.join(currentDir, moduleFileName);
    
    if (fs.existsSync(localPath)) {
        return localPath;
    }
    
    // Try workspace folders
    const workspaceFolders = workspace.workspaceFolders;
    if (workspaceFolders) {
        for (const folder of workspaceFolders) {
            const wsPath = path.join(folder.uri.fsPath, moduleFileName);
            if (fs.existsSync(wsPath)) {
                return wsPath;
            }
        }
    }
    
    return null;
}

/**
 * Searches for existing implementation in .clw file
 * Returns line number if found, null otherwise
 */
function findExistingImplementation(
    clwContent: string,
    className: string,
    methodName: string,
    parameterCount: number
): number | null {
    const lines = clwContent.split(/\r?\n/);
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Match: ClassName.MethodName    PROCEDURE(params)
        const pattern = new RegExp(
            `^${className}\\.${methodName}\\s+PROCEDURE\\s*\\(([^)]*)\\)`,
            'i'
        );
        
        const match = line.match(pattern);
        if (match) {
            // Check parameter count matches
            const implParamCount = countParameters(match[1]);
            if (implParamCount === parameterCount) {
                return i;
            }
        }
    }
    
    return null;
}

/**
 * Generates implementation code for a method
 */
function generateImplementation(
    className: string,
    methodDecl: MethodDeclaration,
    indent: string
): string {
    const lines: string[] = [];
    
    // Method signature with alignment
    // Return type should be added as a comment: !,returnType
    let methodLine = `${className}.${methodDecl.methodName}${' '.repeat(Math.max(1, 12 - methodDecl.methodName.length))}PROCEDURE(${methodDecl.parameters})`;
    if (methodDecl.returnType) {
        methodLine += `  !${methodDecl.returnType}`;
    }
    lines.push(methodLine);
    lines.push('');
    lines.push(`${indent}CODE`);
    lines.push('');
    
    return lines.join('\n');
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
 * Adds implementation for a method declaration
 */
async function addMethodImplementation(editor: TextEditor): Promise<void> {
    const document = editor.document;
    const currentLine = editor.selection.active.line;
    const lineText = document.lineAt(currentLine).text;
    
    // Parse method declaration
    const methodDecl = parseMethodDeclaration(lineText);
    if (!methodDecl) {
        window.showErrorMessage('Cursor is not on a method declaration line.');
        return;
    }
    
    logger.info(`Parsed method: ${methodDecl.methodName} with ${methodDecl.parameterCount} parameters`);
    
    // Find class context
    const classContext = findClassContext(document, currentLine);
    if (!classContext) {
        window.showErrorMessage('Could not find class declaration. Make sure cursor is inside a CLASS block.');
        return;
    }
    
    logger.info(`Found class: ${classContext.className}, module: ${classContext.moduleFile || '(same file)'}`);
    
    // Determine target file
    let targetFilePath: string;
    
    if (classContext.moduleFile) {
        // Resolve MODULE file path
        const resolvedPath = await resolveModuleFilePath(classContext.moduleFile, document.uri.fsPath);
        
        if (!resolvedPath || !fs.existsSync(resolvedPath)) {
            window.showErrorMessage(`Could not find MODULE file: ${classContext.moduleFile}`);
            return;
        }
        
        targetFilePath = resolvedPath;
    } else {
        // Implementation in same file (no MODULE)
        targetFilePath = document.uri.fsPath;
    }
    
    logger.info(`Target file: ${targetFilePath}`);
    
    // Read target file
    const clwContent = fs.readFileSync(targetFilePath, 'utf8');
    
    // Check if implementation already exists
    const existingLine = findExistingImplementation(
        clwContent,
        classContext.className,
        methodDecl.methodName,
        methodDecl.parameterCount
    );
    
    if (existingLine !== null) {
        // Implementation exists - jump to it
        logger.info(`Implementation found at line ${existingLine}, jumping to it`);
        
        const targetUri = Uri.file(targetFilePath);
        const targetDoc = await workspace.openTextDocument(targetUri);
        const targetEditor = await window.showTextDocument(targetDoc);
        
        const position = new Position(existingLine, 0);
        targetEditor.selection = new Selection(position, position);
        targetEditor.revealRange(new Range(position, position));
        
        window.showInformationMessage(`Implementation already exists for ${classContext.className}.${methodDecl.methodName}`);
        return;
    }
    
    // Generate implementation
    const indent = getIndentString(Uri.file(targetFilePath));
    const implementation = generateImplementation(classContext.className, methodDecl, indent);
    
    // Append to end of file
    const targetUri = Uri.file(targetFilePath);
    const targetDoc = await workspace.openTextDocument(targetUri);
    const lastLine = targetDoc.lineCount - 1;
    const lastLineText = targetDoc.lineAt(lastLine).text;
    
    // Add newlines if file doesn't end with blank line
    const prefix = lastLineText.trim() === '' ? '' : '\n';
    const fullImplementation = prefix + implementation;
    
    // Open and edit target file
    const targetEditor = await window.showTextDocument(targetDoc);
    const success = await targetEditor.edit(editBuilder => {
        const endPosition = new Position(lastLine, lastLineText.length);
        editBuilder.insert(endPosition, fullImplementation);
    });
    
    if (success) {
        // Jump to the newly added implementation
        const newMethodLine = lastLine + (prefix ? 1 : 0);
        const position = new Position(newMethodLine, 0);
        targetEditor.selection = new Selection(position, position);
        targetEditor.revealRange(new Range(position, position));
        
        window.showInformationMessage(`Added implementation for ${classContext.className}.${methodDecl.methodName}`);
        logger.info(`Successfully added implementation at line ${newMethodLine}`);
    } else {
        window.showErrorMessage('Failed to add implementation to file.');
    }
}

/**
 * Registers implementation commands
 * @param context - Extension context
 * @returns Array of disposables for the registered commands
 */
export function registerImplementationCommands(context: ExtensionContext): Disposable[] {
    const disposables: Disposable[] = [];
    
    // Register add implementation command
    const addImplCmd = commands.registerCommand('clarion.addImplementation', async () => {
        try {
            const editor = window.activeTextEditor;
            if (!editor) {
                window.showWarningMessage('No active text editor');
                return;
            }
            
            // Check if we're in a Clarion file
            if (editor.document.languageId !== 'clarion') {
                window.showWarningMessage('This command only works in Clarion files (.inc)');
                return;
            }
            
            await addMethodImplementation(editor);
        } catch (error) {
            logger.error('Error in addImplementation command:', error);
            window.showErrorMessage(`Failed to add implementation: ${error}`);
        }
    });
    
    context.subscriptions.push(addImplCmd);
    disposables.push(addImplCmd);
    
    return disposables;
}
