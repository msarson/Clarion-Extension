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
 * @param indentation - Base indentation to apply to the result
 * @returns Formatted Clarion string
 */
function convertToClarionString(text: string, lineTerminator: LineTerminator, indentation: string): string {
    const lines = text.split(/\r?\n/);
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isLastLine = i === lines.length - 1;
        
        // Escape single quotes by doubling them
        const escapedLine = line.replace(/'/g, "''");
        
        // Build the string line
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
        result.push(indentation + clarionLine);
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
    
    // Read clipboard
    const clipboardText = await env.clipboard.readText();
    if (!clipboardText) {
        window.showWarningMessage('Clipboard is empty');
        return;
    }
    
    // Get current indentation
    const indentation = getIndentation(editor);
    
    // Convert to Clarion string
    const clarionString = convertToClarionString(clipboardText, lineTerminator, indentation);
    
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
