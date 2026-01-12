import { Position, Range } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../../ClarionTokenizer';
import { TokenCache } from '../../TokenCache';
import { TokenHelper } from '../../utils/TokenHelper';
import { OmitCompileDetector } from '../../utils/OmitCompileDetector';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger("HoverContextBuilder");
logger.setLevel("error");

/**
 * Context information for hover resolution
 */
export interface HoverContext {
    // Basic info
    word: string;
    wordRange: Range;
    position: Position;
    document: TextDocument;
    line: string;
    tokens: Token[];
    currentLineTokens: Token[];
    
    // Document structure
    documentStructure: any;
    currentScope: Token | null;
    
    // Context flags
    isInOmitBlock: boolean;
    isInMapBlock: boolean;
    isInWindowContext: boolean;
    isInClassBlock: boolean;
    hasLabelBefore: boolean;
}

/**
 * Builds hover context information from document and position
 */
export class HoverContextBuilder {
    private tokenCache = TokenCache.getInstance();

    /**
     * Build complete hover context for a position
     * Returns null if no word found or position is in OMIT block
     */
    public async build(document: TextDocument, position: Position): Promise<HoverContext | null> {
        logger.info(`Building hover context for position ${position.line}:${position.character}`);

        // Get tokens first for OMIT/COMPILE detection
        const tokens = this.tokenCache.getTokens(document);
        
        // Check if the line is inside an OMIT or COMPILE block
        const isInOmitBlock = OmitCompileDetector.isLineOmitted(position.line, tokens, document);
        if (isInOmitBlock) {
            logger.info(`Line ${position.line} is inside OMIT/COMPILE block - skipping hover`);
            return null;
        }
        
        // Get DocumentStructure for MAP block detection
        const documentStructure = this.tokenCache.getStructure(document);
        
        // Get the word at the current position
        const wordRange = TokenHelper.getWordRangeAtPosition(document, position);
        if (!wordRange) {
            logger.info('No word found at position');
            return null;
        }

        const word = document.getText(wordRange);
        logger.info(`Found word: "${word}" at position`);

        // Get the line to check context
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_VALUE }
        });

        // Get tokens on current line
        const currentLineTokens = tokens.filter(t => t.line === position.line);
        
        // Check if there's a Label token before the current word (indicates data declaration)
        const hasLabelBefore = currentLineTokens.some(t => 
            t.type === TokenType.Label && 
            t.start < wordRange.start.character
        );
        
        // Check if we're in a WINDOW/REPORT/APPLICATION structure (indicates control context)
        const isInWindowContext = documentStructure.isInWindowStructure(position.line);
        
        // Check if we're in a MAP block (for MODULE keyword detection)
        const isInMapBlock = documentStructure.isInMapBlock(position.line);
        
        // Check if we're in a CLASS block
        const isInClassBlock = documentStructure.isInClassBlock(position.line);
        
        // Get current scope
        const currentScope = TokenHelper.getInnermostScopeAtLine(documentStructure, position.line) || null; // 🚀 PERFORMANCE: O(log n) vs O(n)
        
        logger.info(`Context: hasLabelBefore=${hasLabelBefore}, isInWindowContext=${isInWindowContext}, isInMapBlock=${isInMapBlock}, isInClassBlock=${isInClassBlock}`);

        return {
            word,
            wordRange,
            position,
            document,
            line,
            tokens,
            currentLineTokens,
            documentStructure,
            currentScope,
            isInOmitBlock,
            isInMapBlock,
            isInWindowContext,
            isInClassBlock,
            hasLabelBefore
        };
    }
}
