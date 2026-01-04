import { Hover, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token } from '../../ClarionTokenizer';
import { TokenCache } from '../../TokenCache';
import { TokenHelper } from '../../utils/TokenHelper';
import { HoverFormatter } from './HoverFormatter';
import { MethodHoverResolver } from './MethodHoverResolver';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger("StructureFieldResolver");

/**
 * Resolves hover information for structure field access (e.g., MyGroup.MyVar)
 */
export class StructureFieldResolver {
    private tokenCache = TokenCache.getInstance();
    
    constructor(
        private formatter: HoverFormatter,
        private methodResolver: MethodHoverResolver,
        private findLocalVariableInfo: (word: string, tokens: Token[], currentScope: Token, document: TextDocument, originalWord?: string) => { type: string; line: number } | null
    ) {}

    /**
     * Resolves hover for structure.field notation (e.g., MyGroup.MyVar)
     */
    async resolveStructureAccess(
        word: string,
        line: string,
        position: Position,
        document: TextDocument
    ): Promise<Hover | null> {
        // Check if this is a structure/group name followed by a dot (e.g., hovering over "MyGroup" in "MyGroup.MyVar")
        // BUT: Skip SELF.member - those are class method calls handled separately
        const wordStartInLine = line.indexOf(word, Math.max(0, position.character - word.length));
        const dotIndex = line.indexOf('.', wordStartInLine);
        
        const isSelfMember = word.toUpperCase().startsWith('SELF.');
        
        if (dotIndex > wordStartInLine && dotIndex < wordStartInLine + word.length + 5 && !isSelfMember) {
            // There's a dot right after the word - this looks like structure.field notation
            logger.info(`Detected dot notation for word: ${word}, dotIndex: ${dotIndex}`);
            
            const tokens = this.tokenCache.getTokens(document);
            const currentScope = TokenHelper.getInnermostScopeAtLine(tokens, position.line);
            if (currentScope) {
                // Look for the GROUP/QUEUE/etc definition
                const structureInfo = this.findLocalVariableInfo(word, tokens, currentScope, document, word);
                if (structureInfo) {
                    logger.info(`✅ Found structure info for ${word}`);
                    return this.formatter.formatVariable(word, structureInfo, currentScope, document);
                } else {
                    logger.info(`❌ Could not find structure info for ${word}`);
                }
            }
        }
        
        return null;
    }

    /**
     * Resolves hover for field access after dot (e.g., hovering on "MyVar" in "MyGroup.MyVar")
     */
    async resolveFieldAccess(
        word: string,
        line: string,
        position: Position,
        document: TextDocument,
        countParametersInCall: (line: string, methodName: string) => number | null
    ): Promise<Hover | null> {
        // Check if this is a class member access (self.member or variable.member)
        const dotBeforeIndex = line.lastIndexOf('.', position.character - 1);
        if (dotBeforeIndex <= 0) {
            return null;
        }

        const beforeDot = line.substring(0, dotBeforeIndex).trim();
        const afterDot = line.substring(dotBeforeIndex + 1).trim();
        const fieldMatch = afterDot.match(/^(\w+)/);
        
        // Extract field name from word (in case TokenHelper returned "prefix.field")
        const fieldName = word.includes('.') ? word.split('.').pop()! : word;
        
        if (!fieldMatch || fieldMatch[1].toLowerCase() !== fieldName.toLowerCase()) {
            return null;
        }

        // Check if this is a method call (has parentheses)
        const hasParentheses = afterDot.includes('(') || line.substring(position.character).trimStart().startsWith('(');
        
        // This is a member access (hovering over the field after the dot)
        if (beforeDot.toLowerCase() === 'self' || beforeDot.toLowerCase().endsWith(' self')) {
            // self.member - class member
            // If it's a method call, count parameters
            let paramCount: number | undefined;
            if (hasParentheses) {
                paramCount = countParametersInCall(line, fieldName) ?? undefined;
                logger.info(`Method call detected with ${paramCount} parameters`);
            }
            
            return await this.methodResolver.resolveMethodCall(fieldName, document, position, line, paramCount);
        } else {
            // variable.member - structure field access (e.g., MyGroup.MyVar)
            const structureNameMatch = beforeDot.match(/(\w+)\s*$/);
            if (structureNameMatch) {
                const structureName = structureNameMatch[1];
                logger.info(`Detected structure field access: ${structureName}.${word}`);
                
                const tokens = this.tokenCache.getTokens(document);
                const currentScope = TokenHelper.getInnermostScopeAtLine(tokens, position.line);
                if (currentScope) {
                    // Try to find the structure field using dot notation reference
                    const fullReference = `${structureName}.${word}`;
                    const variableInfo = this.findLocalVariableInfo(word, tokens, currentScope, document, fullReference);
                    if (variableInfo) {
                        logger.info(`✅ Found structure field info for ${fullReference}`);
                        return this.formatter.formatVariable(fullReference, variableInfo, currentScope, document);
                    }
                }
            }
        }
        
        return null;
    }
}
