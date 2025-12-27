/**
 * Resolves symbol and label definitions within the current scope
 * Handles labels, parameters, local variables, and routine references
 */

import { Location, Position, Range } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenHelper } from './TokenHelper';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("SymbolDefinitionResolver");

export class SymbolDefinitionResolver {
    /**
     * Finds the definition of a label in the current document
     * Handles prefixed labels (e.g., LOC:SomeField)
     */
    public findLabelDefinition(word: string, document: TextDocument, position: Position, tokens: Token[]): Location | null {
        logger.info(`Looking for label definition: ${word}`);

        // Check if the word contains a colon (prefix notation like LOC:SomeField)
        // or a dot (structure field notation like MyGroup.MyVar)
        const colonIndex = word.lastIndexOf(':');
        const dotIndex = word.lastIndexOf('.');
        let searchWord = word;
        let hasPrefix = false;
        
        if (colonIndex > 0) {
            // Extract the field name after the colon
            searchWord = word.substring(colonIndex + 1);
            hasPrefix = true;
            logger.info(`Detected prefixed label reference: ${word}, searching for field: ${searchWord}`);
        } else if (dotIndex > 0) {
            // Extract the field name after the dot
            searchWord = word.substring(dotIndex + 1);
            hasPrefix = true;
            logger.info(`Detected dot notation label reference: ${word}, searching for field: ${searchWord}`);
        }

        // Look for a label token that matches the word (labels are in column 1)
        const labelTokens = tokens.filter(token =>
            token.type === TokenType.Label &&
            (token.value.toLowerCase() === searchWord.toLowerCase() ||
             token.value.toLowerCase() === word.toLowerCase()) &&
            token.start === 0
        );

        if (labelTokens.length > 0) {
            logger.info(`Found ${labelTokens.length} label tokens for ${searchWord}`);
            
            // Get the current scope to filter labels
            const currentScope = TokenHelper.getInnermostScopeAtLine(tokens, position.line);
            logger.info(`Current scope: ${currentScope?.value || 'global'} (line ${currentScope?.line ?? -1})`);

            // Filter labels that are in the current scope
            const labelsInScope = labelTokens.filter(labelToken => {
                // Labels in the same scope as the reference
                if (!currentScope) {
                    return true; // Global scope
                }
                
                // Check if label is within the current scope
                const labelScope = TokenHelper.getInnermostScopeAtLine(tokens, labelToken.line);
                if (!labelScope) {
                    return false; // Label is global, reference is in scope
                }
                
                // Same scope or parent scope
                return labelScope.line === currentScope.line || 
                       this.isParentScope(tokens, currentScope, labelScope);
            });

            logger.info(`Found ${labelsInScope.length} labels in current scope`);

            if (labelsInScope.length > 0) {
                // Return the first match
                const label = labelsInScope[0];
                logger.info(`Returning label at line ${label.line}`);
                return Location.create(document.uri, {
                    start: { line: label.line, character: 0 },
                    end: { line: label.line, character: label.value.length }
                });
            }
        }

        logger.info(`No label definition found for ${word}`);
        return null;
    }

    /**
     * Finds parameter definition within the current procedure/method scope
     */
    public findParameterDefinition(word: string, document: TextDocument, currentScope: Token): Location | null {
        if (!currentScope) {
            return null;
        }

        logger.info(`Looking for parameter ${word} in scope ${currentScope.value}`);

        // Get the line with the procedure/method signature
        const content = document.getText();
        const lines = content.split('\n');
        const scopeLine = lines[currentScope.line];

        // Extract parameters from the signature
        const paramMatch = scopeLine.match(/\((.*?)\)/);
        if (!paramMatch) {
            return null;
        }

        const paramList = paramMatch[1];
        const params = paramList.split(',').map(p => p.trim());

        // Check if word matches any parameter name
        for (const param of params) {
            // Extract just the parameter name (might have type annotations)
            const paramName = param.split(/\s+/)[0];
            if (paramName.toLowerCase() === word.toLowerCase()) {
                logger.info(`Found parameter ${word} in procedure signature`);
                // Return location pointing to the procedure signature line
                return Location.create(document.uri, {
                    start: { line: currentScope.line, character: 0 },
                    end: { line: currentScope.line, character: scopeLine.length }
                });
            }
        }

        return null;
    }

    /**
     * Checks if one scope is a parent of another
     */
    private isParentScope(tokens: Token[], childScope: Token, potentialParent: Token): boolean {
        if (!childScope.parent) {
            return false;
        }
        
        if (childScope.parent === potentialParent) {
            return true;
        }
        
        return this.isParentScope(tokens, childScope.parent, potentialParent);
    }

    /**
     * Finds the enclosing scope for a given token
     */
    public findEnclosingScope(tokens: Token[], inner: Token): Token | undefined {
        // Find the innermost scope that contains the given token
        for (let i = tokens.length - 1; i >= 0; i--) {
            const token = tokens[i];
            
            // Check if this is a scope-defining token (procedure, routine, etc.)
            if ((token.type === TokenType.Procedure || 
                 token.subType === TokenType.Routine) &&
                token.line < inner.line &&
                (!token.finishesAt || token.finishesAt > inner.line)) {
                return token;
            }
        }
        
        return undefined;
    }
}
