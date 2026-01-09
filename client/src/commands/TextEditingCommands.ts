import { commands, window, TextEditor, Disposable, ExtensionContext, workspace, env } from 'vscode';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("TextEditingCommands");
logger.setLevel("error");

/**
 * Line terminator options for paste as string
 */
type LineTerminator = 'space' | 'crlf' | 'none';

/**
 * Converts clipboard or selected text into Clarion string format
 * @param text - Text to convert
 * @param lineTerminator - How to terminate each line (space, crlf, or none)
 * @param trimLeadingWhitespace - Whether to remove leading whitespace from each line
 * @param baseIndentation - Base indentation for first line
 * @param cursorColumn - Column position where cursor is (for aligning continuation lines)
 * @returns Formatted Clarion string
 */
function convertToClarionString(text: string, lineTerminator: LineTerminator, trimLeadingWhitespace: boolean, baseIndentation: string, cursorColumn: number): string {
    const lines = text.split(/\r?\n/);
    const result: string[] = [];
    
    // For continuation lines, we need to align the opening quote with the first line's opening quote
    // The first line starts at cursorColumn, so continuation lines need the same column position
    const continuationIndent = ' '.repeat(cursorColumn);
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const isLastLine = i === lines.length - 1;
        const isFirstLine = i === 0;
        
        // Optionally trim leading whitespace
        if (trimLeadingWhitespace) {
            line = line.trimStart();
        }
        
        // Convert unicode quotes to ASCII (for Clarion compiler compatibility)
        // then escape single quotes by doubling them
        const escapedLine = line
            .replace(/[\u2018\u2019]/g, "'")  // Convert unicode single quotes to ASCII
            .replace(/[\u201C\u201D]/g, '"')  // Convert unicode double quotes to ASCII
            .replace(/'/g, "''");              // Escape ASCII single quotes for Clarion
        
        // Build the string line - preserve the original content exactly
        let clarionLine = `'${escapedLine}`;
        
        // Add line terminator if not the last line
        if (!isLastLine) {
            switch (lineTerminator) {
                case 'space':
                    clarionLine += ' ';
                    break;
                case 'crlf':
                    clarionLine += '<13,10>';
                    break;
                case 'none':
                    // No terminator
                    break;
            }
        }
        
        // Close the quote and add continuation if not last line
        clarionLine += "'";
        if (!isLastLine) {
            clarionLine += ' & |';
        }
        
        // Add indentation
        if (isFirstLine) {
            // First line: no extra indentation (cursor is already positioned)
            result.push(clarionLine);
        } else {
            // Continuation lines: align the opening quote with first line's opening quote
            result.push(continuationIndent + clarionLine);
        }
    }
    
    return result.join('\n');
}

/**
 * Gets the indentation string for the current cursor position
 * @param editor - Active text editor
 * @returns Indentation string (spaces or tabs)
 */
function getIndentation(editor: TextEditor): string {
    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line);
    const lineText = line.text;
    
    // Extract leading whitespace from current line
    const match = lineText.match(/^(\s*)/);
    return match ? match[1] : '';
}

/**
 * Pastes clipboard content as a Clarion string
 */
async function pasteAsClarionString(): Promise<void> {
    const editor = window.activeTextEditor;
    if (!editor) {
        window.showWarningMessage('No active text editor');
        return;
    }
    
    // Check if we're in a Clarion file
    const document = editor.document;
    if (document.languageId !== 'clarion') {
        window.showWarningMessage('This command only works in Clarion files (.clw)');
        return;
    }
    
    // Get configuration for line terminator
    const config = workspace.getConfiguration('clarion');
    const lineTerminator = config.get<LineTerminator>('pasteAsString.lineTerminator', 'space');
    const trimLeadingWhitespace = config.get<boolean>('pasteAsString.trimLeadingWhitespace', true);
    
    // Read clipboard
    const clipboardText = await env.clipboard.readText();
    if (!clipboardText) {
        window.showWarningMessage('Clipboard is empty');
        return;
    }
    
    // Get cursor position (column where the opening quote will appear)
    const position = editor.selection.active;
    const cursorColumn = position.character;
    
    // Get current indentation for reference
    const indentation = getIndentation(editor);
    
    // Convert to Clarion string
    const clarionString = convertToClarionString(clipboardText, lineTerminator, trimLeadingWhitespace, indentation, cursorColumn);
    
    // Insert at cursor position
    await editor.edit(editBuilder => {
        editBuilder.replace(editor.selection, clarionString);
    });
    
    logger.info(`Pasted as Clarion string with ${lineTerminator} terminator`);
}

/**
 * Registers text editing commands (paste as Clarion string)
 * @param context - Extension context
 * @returns Array of disposables for the registered commands
 */
export function registerTextEditingCommands(context: ExtensionContext): Disposable[] {
    const disposables: Disposable[] = [];
    
    // Register paste as Clarion string command
    const pasteCommand = commands.registerCommand('clarion.pasteAsString', async () => {
        try {
            await pasteAsClarionString();
        } catch (error) {
            logger.error('Error in pasteAsString command:', error);
            window.showErrorMessage(`Failed to paste as Clarion string: ${error}`);
        }
    });
    
    context.subscriptions.push(pasteCommand);
    disposables.push(pasteCommand);
    
    return disposables;
}
