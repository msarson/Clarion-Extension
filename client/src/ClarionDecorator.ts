import * as vscode from 'vscode';
import LoggerManager from './logger';

const logger = LoggerManager.getLogger("ClarionDecorator");

/**
 * Provides text decorations for Clarion code elements:
 * 1. Variables with user-defined prefixes
 * 2. Comment lines with user-defined patterns
 */
export class ClarionDecorator {
    // Prefix highlighting
    private prefixEnabled: boolean = true;
    private prefixCache: Map<string, any> = new Map();
    private prefixDecorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    private prefixRegexCache: RegExp | null = null;
    
    // Comment highlighting
    private commentEnabled: boolean = true;
    private commentCache: Map<string, any> = new Map();
    private commentDecorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    private commentRegexCache: Map<string, RegExp> = new Map();
    
    private activeEditor: vscode.TextEditor | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        // Initial load of settings
        this.updateFromSettings();
        
        // Watch for settings changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('clarion.highlighting')) {
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
        // Check if the global highlighting feature is enabled
        const highlightingEnabled = vscode.workspace.getConfiguration().get<boolean>('clarion.highlighting.enabled', true);
        
        if (!highlightingEnabled) {
            logger.info('All highlighting is disabled');
            this.clearPrefixDecorations();
            this.clearCommentDecorations();
            return;
        }
        
        // Update prefix highlighting settings
        this.updatePrefixSettings();
        
        // Update comment highlighting settings
        this.updateCommentSettings();
    }
    
    /**
     * Updates prefix highlighting settings
     */
    private updatePrefixSettings(): void {
        // Check if the feature is enabled
        this.prefixEnabled = vscode.workspace.getConfiguration().get<boolean>('clarion.highlighting.prefix.enabled', true);
        
        if (!this.prefixEnabled) {
            logger.info('Prefix highlighting is disabled');
            this.clearPrefixDecorations();
            return;
        }
        
        // Get the prefix configuration
        const prefixConfig = vscode.workspace.getConfiguration().get<Record<string, any>>('clarion.highlighting.prefix.patterns', {});
        logger.info('Prefix configuration:', prefixConfig);
        
        // Dispose old decoration types
        this.prefixDecorationTypes.forEach(decorationType => decorationType.dispose());
        this.prefixDecorationTypes.clear();
        
        // Create new decoration types for each prefix
        Object.keys(prefixConfig).forEach(prefix => {
            // Skip the 'enabled' property - it's not a prefix
            if (prefix === 'enabled') {
                logger.info(`Skipping 'enabled' property - it's not a prefix`);
                return;
            }
            
            // Handle both simple color string and complex style object
            let decorationOptions: vscode.DecorationRenderOptions = {};
            
            if (typeof prefixConfig[prefix] === 'string') {
                // Simple color string
                const color = prefixConfig[prefix] as string;
                logger.info(`Creating decoration type for prefix: ${prefix}, color: ${color}`);
                decorationOptions.color = color;
            } else {
                // Complex style object
                const style = prefixConfig[prefix] as any;
                logger.info(`Creating decoration type for prefix: ${prefix}, style:`, style);
                
                // Apply basic styling
                if (style.color) decorationOptions.color = style.color;
                if (style.backgroundColor) decorationOptions.backgroundColor = style.backgroundColor;
                if (style.fontWeight) decorationOptions.fontWeight = style.fontWeight;
                if (style.fontStyle) decorationOptions.fontStyle = style.fontStyle;
                if (style.textDecoration) decorationOptions.textDecoration = style.textDecoration;
                
                // Apply before/after decorations
                if (style.before && style.before.contentText) {
                    decorationOptions.before = {
                        contentText: style.before.contentText,
                        color: style.before.color
                    };
                }
                
                if (style.after && style.after.contentText) {
                    decorationOptions.after = {
                        contentText: style.after.contentText,
                        color: style.after.color
                    };
                }
            }
            
            // Store the style for later use
            this.prefixCache.set(prefix, prefixConfig[prefix]);
            
            // Create a decoration type with the specified options
            const decorationType = vscode.window.createTextEditorDecorationType(decorationOptions);
            
            this.prefixDecorationTypes.set(prefix, decorationType);
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
            logger.info(`Created prefix regex pattern: \\b(${prefixPattern}):(\\w+)\\b`);
        } else {
            this.prefixRegexCache = null;
            logger.info('No prefixes configured, regex pattern is null');
        }
    }
    
    /**
     * Updates comment highlighting settings
     */
    private updateCommentSettings(): void {
        // Check if the feature is enabled
        this.commentEnabled = vscode.workspace.getConfiguration().get<boolean>('clarion.highlighting.comment.enabled', true);
        
        if (!this.commentEnabled) {
            logger.info('Comment highlighting is disabled');
            this.clearCommentDecorations();
            return;
        }
        
        // Get the comment configuration
        const commentConfig = vscode.workspace.getConfiguration().get<Record<string, any>>('clarion.highlighting.comment.patterns', {});
        logger.info('Comment configuration:', commentConfig);
        
        // Dispose old decoration types
        this.commentDecorationTypes.forEach(decorationType => decorationType.dispose());
        this.commentDecorationTypes.clear();
        this.commentRegexCache.clear();
        
        // Create new decoration types for each comment pattern
        Object.keys(commentConfig).forEach(pattern => {
            // Skip the 'enabled' property - it's not a pattern
            if (pattern === 'enabled') {
                logger.info(`Skipping 'enabled' property - it's not a comment pattern`);
                return;
            }
            
            // Handle both simple color string and complex style object
            let decorationOptions: vscode.DecorationRenderOptions = {};
            
            if (typeof commentConfig[pattern] === 'string') {
                // Simple color string
                const color = commentConfig[pattern] as string;
                logger.info(`Creating decoration type for comment pattern: ${pattern}, color: ${color}`);
                decorationOptions.color = color;
            } else {
                // Complex style object
                const style = commentConfig[pattern] as any;
                logger.info(`Creating decoration type for comment pattern: ${pattern}, style:`, style);
                
                // Apply basic styling
                if (style.color) decorationOptions.color = style.color;
                if (style.backgroundColor) decorationOptions.backgroundColor = style.backgroundColor;
                if (style.fontWeight) decorationOptions.fontWeight = style.fontWeight;
                if (style.fontStyle) decorationOptions.fontStyle = style.fontStyle;
                if (style.textDecoration) decorationOptions.textDecoration = style.textDecoration;
                
                // Apply before/after decorations
                if (style.before && style.before.contentText) {
                    decorationOptions.before = {
                        contentText: style.before.contentText,
                        color: style.before.color
                    };
                }
                
                if (style.after && style.after.contentText) {
                    decorationOptions.after = {
                        contentText: style.after.contentText,
                        color: style.after.color
                    };
                }
            }
            
            // Store the style for later use
            this.commentCache.set(pattern, commentConfig[pattern]);
            
            // Create a decoration type with the specified options
            const decorationType = vscode.window.createTextEditorDecorationType(decorationOptions);
            
            this.commentDecorationTypes.set(pattern, decorationType);
            
            // Create a regex for this pattern
            // Match comment lines that start with ! followed by the pattern (with or without space)
            const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`^\\s*!\\s*${escapedPattern}.*$`, 'gm');
            this.commentRegexCache.set(pattern, regex);
            
            logger.info(`Created comment regex pattern for '${pattern}': ${regex}`);
        });
    }
    
    /**
     * Updates the decorations in the active editor
     */
    private updateDecorations(): void {
        if (!this.activeEditor) {
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
        
        // Update prefix decorations
        if (this.prefixEnabled && this.prefixRegexCache) {
            this.updatePrefixDecorations(document);
        }
        
        // Update comment decorations
        if (this.commentEnabled && this.commentRegexCache.size > 0) {
            this.updateCommentDecorations(document);
        }
    }
    
    /**
     * Updates prefix decorations in the document
     */
    private updatePrefixDecorations(document: vscode.TextDocument): void {
        // Create a map to collect ranges for each prefix
        const decorationRanges: Map<string, vscode.Range[]> = new Map();
        this.prefixDecorationTypes.forEach((_, prefix) => {
            decorationRanges.set(prefix, []);
        });
        
        // Process the document text
        const text = document.getText();
        this.prefixRegexCache!.lastIndex = 0;
        
        let match: RegExpExecArray | null;
        while ((match = this.prefixRegexCache!.exec(text)) !== null) {
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
            const decorationType = this.prefixDecorationTypes.get(prefix);
            if (decorationType) {
                this.activeEditor!.setDecorations(decorationType, ranges);
                logger.info(`Applied ${ranges.length} decorations for prefix ${prefix}`);
            }
        });
    }
    
    /**
     * Updates comment decorations in the document
     */
    private updateCommentDecorations(document: vscode.TextDocument): void {
        // Process each comment pattern
        this.commentRegexCache.forEach((regex, pattern) => {
            const ranges: vscode.Range[] = [];
            
            // Process the document text
            const text = document.getText();
            regex.lastIndex = 0;
            
            let match: RegExpExecArray | null;
            while ((match = regex.exec(text)) !== null) {
                const startPos = match.index;
                const endPos = startPos + match[0].length;
                
                // Convert position to VS Code Range
                const startPosition = document.positionAt(startPos);
                const endPosition = document.positionAt(endPos);
                const range = new vscode.Range(startPosition, endPosition);
                
                ranges.push(range);
                logger.info(`Found comment with pattern '${pattern}' at line ${startPosition.line}`);
            }
            
            // Apply decorations for this comment pattern
            const decorationType = this.commentDecorationTypes.get(pattern);
            if (decorationType) {
                this.activeEditor!.setDecorations(decorationType, ranges);
                logger.info(`Applied ${ranges.length} decorations for comment pattern '${pattern}'`);
            }
        });
    }
    
    /**
     * Clears all prefix decorations
     */
    private clearPrefixDecorations(): void {
        this.prefixDecorationTypes.forEach(decorationType => {
            if (this.activeEditor) {
                this.activeEditor.setDecorations(decorationType, []);
            }
        });
    }
    
    /**
     * Clears all comment decorations
     */
    private clearCommentDecorations(): void {
        this.commentDecorationTypes.forEach(decorationType => {
            if (this.activeEditor) {
                this.activeEditor.setDecorations(decorationType, []);
            }
        });
    }
    
    /**
     * Disposes all resources
     */
    public dispose(): void {
        this.prefixDecorationTypes.forEach(decorationType => decorationType.dispose());
        this.prefixDecorationTypes.clear();
        
        this.commentDecorationTypes.forEach(decorationType => decorationType.dispose());
        this.commentDecorationTypes.clear();
        
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
    }
}