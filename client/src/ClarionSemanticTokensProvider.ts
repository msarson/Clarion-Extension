import * as vscode from 'vscode';

/**
 * Provides semantic tokens for Clarion variables with user-defined prefixes.
 * This provider scans documents for variables with prefixes like LOCS:Variable, GLOS:Customer, etc.
 * and applies semantic highlighting based on user configuration.
 */
export class ClarionSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    private tokenTypes = new Map<string, number>();
    private tokenModifiers = new Map<string, number>();
    private legend: vscode.SemanticTokensLegend;
    private prefixCache: Map<string, string> = new Map();
    private prefixRegexCache: RegExp | null = null;
    private enabled: boolean = true;

    constructor() {
        // Initialize with the base token type
        this.tokenTypes.set('variable', 0);
        
        // Create the legend with just the variable type initially
        // Modifiers will be added dynamically based on user settings
        this.legend = new vscode.SemanticTokensLegend(
            ['variable'],
            []
        );
        
        // Initial load of settings
        this.updateFromSettings().catch(error => {
            console.error('Error in initial settings update:', error);
        });
        
        // Watch for settings changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('clarion.prefixHighlighting')) {
                this.updateFromSettings().catch(error => {
                    console.error('Error updating settings after configuration change:', error);
                });
            }
        });
    }

    /**
     * Updates the provider's state based on current user settings
     */
    private async updateFromSettings(): Promise<void> {
        // Check if the feature is enabled
        this.enabled = vscode.workspace.getConfiguration().get<boolean>('clarion.prefixHighlighting.enabled', true);
        
        if (!this.enabled) {
            console.log('Prefix highlighting is disabled');
            return;
        }
        
        // Get the prefix configuration
        const prefixConfig = vscode.workspace.getConfiguration().get<Record<string, string>>('clarion.prefixHighlighting', {});
        console.log('Prefix configuration:', prefixConfig);
        
        // Clear existing caches
        this.prefixCache.clear();
        this.tokenModifiers.clear();
        
        // Build a new list of modifiers
        const modifiers: string[] = [];
        
        // Build semantic token color customizations rules
        const semanticTokenRules: Record<string, { foreground: string }> = {};
        
        // Process each prefix (excluding the 'enabled' property which is not a prefix)
        Object.keys(prefixConfig).forEach((prefix, index) => {
            // Skip the 'enabled' property - it's not a prefix
            if (prefix === 'enabled') {
                console.log(`Skipping 'enabled' property - it's not a prefix`);
                return;
            }
            
            const color = prefixConfig[prefix];
            const modifierName = `clarionPrefix.${prefix}`;
            
            console.log(`Adding prefix: ${prefix}, color: ${color}, modifier: ${modifierName}, index: ${index}`);
            
            // Store in our caches
            this.prefixCache.set(prefix, color);
            this.tokenModifiers.set(modifierName, modifiers.length); // Use modifiers.length instead of index to ensure consecutive indices
            
            // Add to modifiers list
            modifiers.push(modifierName);
            
            // Add to semantic token rules
            semanticTokenRules[`variable.${modifierName}`] = { foreground: color };
        });
        
        console.log('Final modifiers list:', modifiers);
        
        // Update the legend with new modifiers
        this.legend = new vscode.SemanticTokensLegend(
            ['variable'],
            modifiers
        );
        
        console.log('Updated semantic tokens legend:', {
            tokenTypes: ['variable'],
            tokenModifiers: modifiers
        });
        
        // Automatically update the editor.semanticTokenColorCustomizations setting
        try {
            console.log('Updating editor.semanticTokenColorCustomizations with rules:', semanticTokenRules);
            
            // Get the current semantic token color customizations
            const editorConfig = vscode.workspace.getConfiguration('editor');
            const currentCustomizations = editorConfig.get('semanticTokenColorCustomizations') || {};
            
            // Create a new customizations object with our rules
            const newCustomizations = {
                ...currentCustomizations,
                rules: {
                    ...((currentCustomizations as any).rules || {}),
                    ...semanticTokenRules
                },
                enabled: true
            };
            
            // Update the setting
            await editorConfig.update('semanticTokenColorCustomizations', newCustomizations, vscode.ConfigurationTarget.Workspace);
            console.log('Successfully updated editor.semanticTokenColorCustomizations');
        } catch (error) {
            console.error('Error updating editor.semanticTokenColorCustomizations:', error);
        }
        
        // Build a regex that matches any of the configured prefixes
        if (Object.keys(prefixConfig).length > 0) {
            // Filter out the 'enabled' property
            const prefixPattern = Object.keys(prefixConfig)
                .filter(prefix => prefix !== 'enabled')
                .map(prefix => prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // Escape regex special chars
                .join('|');
            
            // Match PREFIX:Identifier pattern
            this.prefixRegexCache = new RegExp(`\\b(${prefixPattern}):(\\w+)\\b`, 'g');
            console.log(`Created regex pattern: \\b(${prefixPattern}):(\\w+)\\b`);
        } else {
            this.prefixRegexCache = null;
            console.log('No prefixes configured, regex pattern is null');
        }
    }

    /**
     * Returns the semantic tokens legend used by this provider
     */
    public getLegend(): vscode.SemanticTokensLegend {
        return this.legend;
    }

    /**
     * Provides semantic tokens for a document
     */
    public provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SemanticTokens> {
        // If disabled or no prefixes configured, return empty tokens
        if (!this.enabled || !this.prefixRegexCache) {
            console.log('Semantic token provider is disabled or no prefixes configured');
            return new vscode.SemanticTokens(new Uint32Array(0));
        }
        
        console.log(`Processing document: ${document.uri.toString()}, line count: ${document.lineCount}`);
        
        const builder = new vscode.SemanticTokensBuilder(this.legend);
        
        // Process each line of the document
        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            const line = document.lineAt(lineIndex);
            const text = line.text;
            
            // Reset regex for each line
            this.prefixRegexCache.lastIndex = 0;
            
            // Find all matches in the line
            let match: RegExpExecArray | null;
            while ((match = this.prefixRegexCache.exec(text)) !== null) {
                const [fullMatch, prefix, identifier] = match;
                const startPos = match.index;
                const length = fullMatch.length;
                
                // Get the modifier index for this prefix
                const modifierName = `clarionPrefix.${prefix}`;
                const modifierIndex = this.tokenModifiers.get(modifierName);
                
                if (modifierIndex !== undefined) {
                    // Add a token with the variable type and the appropriate modifier
                    // The bit mask is created by shifting 1 to the left by the modifier index
                    const modifierBitmask = 1 << modifierIndex;
                    
                    // Get the color for this prefix
                    const color = this.prefixCache.get(prefix);
                    
                    // Log for debugging
                    console.log(`Found ${prefix}:${identifier} at line ${lineIndex}, pos ${startPos} - Using modifier: ${modifierName} (index: ${modifierIndex}, bitmask: ${modifierBitmask}, color: ${color})`);
                    
                    builder.push(
                        lineIndex,           // line
                        startPos,            // character
                        length,              // length
                        0,                   // tokenType (0 = variable)
                        modifierBitmask      // tokenModifiers bit mask
                    );
                } else {
                    console.log(`Warning: Found ${prefix}:${identifier} but no modifier index for ${modifierName}`);
                }
            }
        }
        
        const tokens = builder.build();
        console.log(`Built semantic tokens: ${tokens.data.length / 5} tokens found`);
        return tokens;
    }
}