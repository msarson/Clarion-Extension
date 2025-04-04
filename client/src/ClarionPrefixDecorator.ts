import * as vscode from 'vscode';
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("ClarionPrefixDecorator");
logger.setLevel("error");


/**
 * Provides text decorations for Clarion variables with user-defined prefixes.
 * This uses the editor decoration API for direct control over styling.
 */
export class ClarionPrefixDecorator {
    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    private enabled: boolean = true;
    private prefixRegexCache: RegExp | null = null;
    private activeEditor: vscode.TextEditor | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        // Initial load of settings
        this.updateFromSettings();
        
        // Watch for settings changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('clarion.prefixHighlighting')) {
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
        
        // Watch for document changes
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (this.activeEditor && event.document === this.activeEditor.document) {
                    this.updateDecorations();
                }
            })
        );
        
        // Set initial active editor
        this.activeEditor = vscode.window.activeTextEditor;
        this.updateDecorations();
    }
    
    /**
     * Updates the decorator's state based on current user settings
     */
    private updateFromSettings(): void {
        // Check if the feature is enabled
        this.enabled = vscode.workspace.getConfiguration().get<boolean>('clarion.prefixHighlighting.enabled', true);
        
        if (!this.enabled) {
            logger.info('Prefix highlighting is disabled');
            this.clearDecorations();
            return;
        }
        
        // Get the prefix configuration
        const prefixConfig = vscode.workspace.getConfiguration().get<Record<string, string>>('clarion.prefixHighlighting', {});
        logger.info('Prefix configuration:', prefixConfig);
        
        // Dispose old decoration types
        this.decorationTypes.forEach(decorationType => decorationType.dispose());
        this.decorationTypes.clear();
        
        // Create new decoration types for each prefix
        Object.keys(prefixConfig).forEach(prefix => {
            // Skip the 'enabled' property - it's not a prefix
            if (prefix === 'enabled') {
                logger.info(`Skipping 'enabled' property - it's not a prefix`);
                return;
            }
            
            const color = prefixConfig[prefix];
            logger.info(`Creating decoration type for prefix: ${prefix}, color: ${color}`);
            
            // Create a decoration type with the specified color
            const decorationType = vscode.window.createTextEditorDecorationType({
                color: color
                // Optional: add other styling as needed
                // fontWeight: 'bold',
            });
            
            this.decorationTypes.set(prefix, decorationType);
        });
        
        // Build a regex that matches any of the configured prefixes
        if (Object.keys(prefixConfig).length > 0) {
            // Filter out the 'enabled' property
            const prefixPattern = Object.keys(prefixConfig)
                .filter(prefix => prefix !== 'enabled')
                .map(prefix => prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // Escape regex special chars
                .join('|');
            
            // Match PREFIX:Identifier pattern
            this.prefixRegexCache = new RegExp(`\\b(${prefixPattern}):(\\w+)\\b`, 'g');
            logger.info(`Created regex pattern: \\b(${prefixPattern}):(\\w+)\\b`);
        } else {
            this.prefixRegexCache = null;
            logger.info('No prefixes configured, regex pattern is null');
        }
    }
    
    /**
     * Updates the decorations in the active editor
     */
    private updateDecorations(): void {
        if (!this.activeEditor || !this.enabled || !this.prefixRegexCache) {
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
        
        logger.info(`Processing document for decorations: ${document.uri.toString()}`);
        
        // Create a map to collect ranges for each prefix
        const decorationRanges: Map<string, vscode.Range[]> = new Map();
        this.decorationTypes.forEach((_, prefix) => {
            decorationRanges.set(prefix, []);
        });
        
        // Process the document text
        const text = document.getText();
        this.prefixRegexCache.lastIndex = 0;
        
        let match: RegExpExecArray | null;
        while ((match = this.prefixRegexCache.exec(text)) !== null) {
            const [fullMatch, prefix, identifier] = match;
            const startPos = match.index;
            const endPos = startPos + fullMatch.length;
            
            // Convert position to VS Code Range
            const startPosition = document.positionAt(startPos);
            const endPosition = document.positionAt(endPos);
            const range = new vscode.Range(startPosition, endPosition);
            
            // Add the range to the appropriate prefix
            const ranges = decorationRanges.get(prefix);
            if (ranges) {
                ranges.push(range);
                logger.info(`Found ${prefix}:${identifier} at ${startPosition.line}:${startPosition.character}`);
            }
        }
        
        // Apply decorations for each prefix
        decorationRanges.forEach((ranges, prefix) => {
            const decorationType = this.decorationTypes.get(prefix);
            if (decorationType) {
                this.activeEditor!.setDecorations(decorationType, ranges);
                logger.info(`Applied ${ranges.length} decorations for prefix ${prefix}`);
            }
        });
    }
    
    /**
     * Clears all decorations
     */
    private clearDecorations(): void {
        this.decorationTypes.forEach(decorationType => {
            if (this.activeEditor) {
                this.activeEditor.setDecorations(decorationType, []);
            }
        });
    }
    
    /**
     * Disposes all resources
     */
    public dispose(): void {
        this.decorationTypes.forEach(decorationType => decorationType.dispose());
        this.decorationTypes.clear();
        
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
    }
}