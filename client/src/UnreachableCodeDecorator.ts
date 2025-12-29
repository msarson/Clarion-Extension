import * as vscode from 'vscode';
import LoggerManager from './utils/LoggerManager';
import { LanguageClient } from 'vscode-languageclient/node';

const logger = LoggerManager.getLogger("UnreachableCodeDecorator");
logger.setLevel("error");

/**
 * Detects and visually dims unreachable code in Clarion procedures and methods.
 * 
 * Uses server-side token analysis with finishesAt properties for accurate detection.
 * - Detects code after unconditional RETURN/EXIT/HALT at top execution level
 * - Uses token finishesAt to determine if terminators are inside control structures
 * - ROUTINE blocks are always reachable
 * - STOP is NOT treated as a terminator
 */
export class UnreachableCodeDecorator {
    private decorationType: vscode.TextEditorDecorationType;
    private enabled: boolean = true;
    private activeEditor: vscode.TextEditor | undefined;
    private disposables: vscode.Disposable[] = [];
    private client: LanguageClient;

    constructor(client: LanguageClient) {
        this.client = client;
        
        // Create decoration type for dimming unreachable code
        this.decorationType = vscode.window.createTextEditorDecorationType({
            opacity: '0.4',
            textDecoration: 'none; opacity: 0.4'
        });

        // Initial load of settings
        this.updateFromSettings();
        
        // Watch for settings changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('clarion.unreachableCode')) {
                    this.updateFromSettings();
                    this.updateDecorations();
                }
            })
        );
        
        // Watch for active editor changes
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                this.activeEditor = editor;
                this.updateDecorations();
            })
        );
        
        // Watch for document changes (debounced)
        let timeout: NodeJS.Timeout | undefined;
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (this.activeEditor && event.document === this.activeEditor.document) {
                    // Debounce updates to avoid too frequent requests
                    if (timeout) {
                        clearTimeout(timeout);
                    }
                    timeout = setTimeout(() => {
                        this.updateDecorations();
                    }, 500);
                }
            })
        );
        
        // Set initial active editor
        this.activeEditor = vscode.window.activeTextEditor;
        this.updateDecorations();
    }
    
    private updateFromSettings(): void {
        this.enabled = vscode.workspace.getConfiguration().get<boolean>('clarion.unreachableCode.enabled', true);
        
        if (!this.enabled) {
            logger.info('Unreachable code detection is disabled');
            this.clearDecorations();
        }
    }
    
    private async updateDecorations(): Promise<void> {
        if (!this.activeEditor || !this.enabled) {
            return;
        }
        
        const document = this.activeEditor.document;
        
        // Skip non-Clarion files
        if (document.languageId !== 'clarion' && 
            !document.fileName.toLowerCase().endsWith('.clw') &&
            !document.fileName.toLowerCase().endsWith('.inc') &&
            !document.fileName.toLowerCase().endsWith('.equ') &&
            !document.fileName.toLowerCase().endsWith('.eq') &&
            !document.fileName.toLowerCase().endsWith('.int')) {
            return;
        }
        
        try {
            // Request unreachable ranges from language server
            const ranges = await this.client.sendRequest<any[]>('clarion/unreachableRanges', {
                textDocument: { uri: document.uri.toString() }
            });
            
            if (!ranges || ranges.length === 0) {
                this.clearDecorations();
                return;
            }
            
            // Convert LSP Range objects to VS Code Range objects
            const vscodeRanges = ranges.map(r => 
                new vscode.Range(
                    new vscode.Position(r.start.line, r.start.character),
                    new vscode.Position(r.end.line, r.end.character)
                )
            );
            
            this.activeEditor.setDecorations(this.decorationType, vscodeRanges);
            
            if (vscodeRanges.length > 0) {
                logger.info(`Applied ${vscodeRanges.length} unreachable code decorations`);
            }
        } catch (error) {
            logger.error(`Error requesting unreachable ranges: ${error instanceof Error ? error.message : String(error)}`);
            this.clearDecorations();
        }
    }
    
    private clearDecorations(): void {
        if (this.activeEditor) {
            this.activeEditor.setDecorations(this.decorationType, []);
        }
    }
    
    public dispose(): void {
        this.decorationType.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
