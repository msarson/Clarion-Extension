import { 
    SemanticTokens, 
    SemanticTokensBuilder,
    SemanticTokensLegend 
} from 'vscode-languageserver';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("SemanticTokensProvider");
logger.setLevel("error");

/**
 * Semantic token types for Clarion language
 * These map to VS Code's semantic token types and can be themed
 */
enum SemanticTokenTypes {
    keyword = 0,
    keywordControl,
    keywordStructure,
    keywordOop,
    keywordWindow,
    type,
    variable,
    function,
    class,
    property,
    comment,
    string,
    number,
}

/**
 * Semantic token modifiers for Clarion language
 * These provide additional context that themes can use
 */
enum SemanticTokenModifiers {
    declaration = 0,
    definition,
    readonly,
    endStructure,      // END closing a data structure (GROUP, RECORD, etc.)
    endOop,           // END closing CLASS/INTERFACE
    endWindow,        // END closing WINDOW/REPORT
    endControl,       // END closing IF/LOOP/CASE
}

/**
 * ClarionSemanticTokensProvider generates context-aware semantic tokens
 * that override TextMate grammar highlighting with semantic information
 * 
 * Key feature: END keywords are colored based on what they close
 */
export class ClarionSemanticTokensProvider {
    private legend: SemanticTokensLegend;
    
    constructor() {
        this.legend = this.createLegend();
    }
    
    /**
     * Generate semantic tokens for a document
     */
    public provideSemanticTokens(tokens: Token[]): SemanticTokens {
        const perfStart = performance.now();
        const builder = new SemanticTokensBuilder();
        
        let encodedCount = 0;
        for (const token of tokens) {
            if (this.shouldEncodeToken(token)) {
                this.encodeToken(token, builder);
                encodedCount++;
            }
        }
        
        const result = builder.build();
        const perfTime = performance.now() - perfStart;
        
        logger.info(`Generated ${encodedCount} semantic tokens from ${tokens.length} total tokens in ${perfTime.toFixed(2)}ms`);
        
        return result;
    }
    
    /**
     * Determine if a token should be encoded as a semantic token
     * We only encode tokens that need context-aware highlighting
     */
    private shouldEncodeToken(token: Token): boolean {
        // Always encode END statements (context-aware)
        if (token.type === TokenType.EndStatement) {
            return true;
        }
        
        // Encode structure keywords (includes CLASS, INTERFACE, GROUP, QUEUE, etc.)
        if (token.type === TokenType.Structure) {
            return true;
        }
        
        // Encode control flow keywords that might need special handling
        if (token.type === TokenType.Keyword) {
            const upperValue = token.value.toUpperCase();
            if (['IF', 'ELSIF', 'ELSE', 'CASE', 'OF', 'OROF', 'LOOP', 'WHILE', 'UNTIL', 'TIMES'].includes(upperValue)) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Encode a single token with its semantic type
     */
    private encodeToken(token: Token, builder: SemanticTokensBuilder): void {
        // Special handling for END keywords - the main feature!
        if (token.type === TokenType.EndStatement) {
            this.encodeEndToken(token, builder);
            return;
        }
        
        // Handle structure keywords (includes CLASS, INTERFACE, GROUP, QUEUE, etc.)
        if (token.type === TokenType.Structure) {
            this.encodeStructureToken(token, builder);
            return;
        }
        
        // Handle control flow keywords
        if (token.type === TokenType.Keyword) {
            const upperValue = token.value.toUpperCase();
            if (['IF', 'ELSIF', 'ELSE', 'CASE', 'OF', 'OROF', 'LOOP', 'WHILE', 'UNTIL', 'TIMES'].includes(upperValue)) {
                builder.push(
                    token.line,
                    token.start,
                    token.value.length,
                    SemanticTokenTypes.keywordControl,
                    0
                );
            }
        }
    }
    
    /**
     * Encode structure keywords with appropriate semantic type
     */
    private encodeStructureToken(token: Token, builder: SemanticTokensBuilder): void {
        const upperValue = token.value.toUpperCase();
        let tokenType = SemanticTokenTypes.keyword;
        
        // OOP structures
        if (['CLASS', 'INTERFACE'].includes(upperValue)) {
            tokenType = SemanticTokenTypes.keywordOop;
        }
        // Data structures
        else if (['GROUP', 'RECORD', 'QUEUE', 'FILE', 'VIEW', 'TABLE'].includes(upperValue)) {
            tokenType = SemanticTokenTypes.keywordStructure;
        }
        // UI structures
        else if (['WINDOW', 'REPORT', 'MENU', 'MENUBAR', 'TOOLBAR', 'SHEET', 'APPLICATION'].includes(upperValue)) {
            tokenType = SemanticTokenTypes.keywordWindow;
        }
        
        builder.push(
            token.line,
            token.start,
            token.value.length,
            tokenType,
            0
        );
    }
    
    /**
     * Context-aware encoding for END keywords
     * Uses parent structure to determine the appropriate semantic token
     * This is the key feature that makes END match its opening keyword color
     */
    private encodeEndToken(token: Token, builder: SemanticTokensBuilder): void {
        let tokenType = SemanticTokenTypes.keyword;
        let modifiers = 0;
        
        // Determine what this END closes by looking at parent structure
        if (token.parent) {
            const parentType = token.parent.value.toUpperCase();
            
            logger.info(`END at line ${token.line} closes ${parentType}`);
            
            // Classify based on what END closes
            if (['GROUP', 'RECORD', 'QUEUE', 'FILE', 'VIEW', 'TABLE'].includes(parentType)) {
                // Data structure END - use same color as GROUP/RECORD/etc
                tokenType = SemanticTokenTypes.keywordStructure;
                modifiers = this.getModifierMask(SemanticTokenModifiers.endStructure);
            } 
            else if (['CLASS', 'INTERFACE'].includes(parentType)) {
                // OOP END - use same color as CLASS/INTERFACE
                tokenType = SemanticTokenTypes.keywordOop;
                modifiers = this.getModifierMask(SemanticTokenModifiers.endOop);
            }
            else if (['WINDOW', 'REPORT', 'MENU', 'MENUBAR', 'TOOLBAR', 'SHEET', 'APPLICATION'].includes(parentType)) {
                // UI structure END - use same color as WINDOW/REPORT
                tokenType = SemanticTokenTypes.keywordWindow;
                modifiers = this.getModifierMask(SemanticTokenModifiers.endWindow);
            }
            else if (['IF', 'LOOP', 'CASE', 'WHILE', 'TIMES', 'CHOOSE', 'EXECUTE'].includes(parentType)) {
                // Control flow END - keep control flow color
                tokenType = SemanticTokenTypes.keywordControl;
                modifiers = this.getModifierMask(SemanticTokenModifiers.endControl);
            }
            else {
                // Unknown parent - use generic keyword color
                logger.info(`END at line ${token.line} has unknown parent type: ${parentType}`);
            }
        } else {
            // No parent - use generic keyword color
            logger.info(`END at line ${token.line} has no parent (orphaned END)`);
        }
        
        builder.push(
            token.line,
            token.start,
            token.value.length,
            tokenType,
            modifiers
        );
    }
    
    /**
     * Create the semantic tokens legend
     * This defines the available token types and modifiers
     */
    private createLegend(): SemanticTokensLegend {
        return {
            tokenTypes: [
                'keyword',
                'keywordControl',
                'keywordStructure',
                'keywordOop',
                'keywordWindow',
                'type',
                'variable',
                'function',
                'class',
                'property',
                'comment',
                'string',
                'number',
            ],
            tokenModifiers: [
                'declaration',
                'definition',
                'readonly',
                'endStructure',
                'endOop',
                'endWindow',
                'endControl',
            ]
        };
    }
    
    /**
     * Get the bitmask for a modifier
     */
    private getModifierMask(modifier: SemanticTokenModifiers): number {
        return 1 << modifier;
    }
    
    /**
     * Get the legend for capability advertisement
     */
    public getLegend(): SemanticTokensLegend {
        return this.legend;
    }
}
