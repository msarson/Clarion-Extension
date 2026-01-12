/**
 * Resolves symbol and label definitions within the current scope
 * Handles labels, parameters, local variables, and routine references
 * Includes complex prefix validation logic for structure fields
 */

import { Location, Position, Range, DocumentSymbol } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenHelper } from './TokenHelper';
import { ClarionDocumentSymbolProvider } from '../providers/ClarionDocumentSymbolProvider';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("SymbolDefinitionResolver");
logger.setLevel("error");

export class SymbolDefinitionResolver {
    private symbolProvider = new ClarionDocumentSymbolProvider();

    /**
     * Finds ALL label definitions matching the word (no scope filtering)
     * Returns all candidates - caller should filter by scope using ScopeAnalyzer
     * Handles prefixed labels (e.g., LOC:SomeField) with validation logic
     */
    public findAllLabelCandidates(word: string, document: TextDocument, tokens: Token[]): Location[] {
        logger.info(`Finding all label candidates for: ${word}`);

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

        // Look for ALL label tokens that match the word (labels are at column 0)
        // IMPORTANT: Search for both the extracted field name AND the full word
        // This handles cases like LOC:SMTPbccAddress where the colon is part of the variable name
        const labelTokens = tokens.filter(token =>
            token.type === TokenType.Label &&
            (token.value.toLowerCase() === searchWord.toLowerCase() ||
             token.value.toLowerCase() === word.toLowerCase()) &&
            token.start === 0
        );

        if (labelTokens.length === 0) {
            logger.info(`No label tokens found for ${searchWord}`);
            return [];
        }

        logger.info(`Found ${labelTokens.length} label tokens for ${searchWord}`);
        const candidates: Location[] = [];
        const symbols = this.symbolProvider.provideDocumentSymbols(tokens, document.uri);

        // Check each label token for prefix validation
        for (const token of labelTokens) {
            // Check if this is a structure field that requires a prefix
            const symbol = this.findSymbolAtLine(symbols, token.line, searchWord);
            
            if (symbol && (symbol as any)._possibleReferences) {
                const possibleRefs = (symbol as any)._possibleReferences as string[];
                logger.info(`PREFIX-VALIDATION: Token "${token.value}" at line ${token.line} has possible references: ${possibleRefs.join(', ')}`);
                
                // Check if the search word matches any of the possible references (case-insensitive)
                const matchesReference = possibleRefs.some(ref =>
                    ref.toUpperCase() === word.toUpperCase()
                );
                
                // Explicitly check if trying to access with unprefixed name - REJECT
                const isUnprefixedMatch = token.value.toUpperCase() === searchWord.toUpperCase();
                
                if (!matchesReference || (isUnprefixedMatch && !hasPrefix)) {
                    if (isUnprefixedMatch && !hasPrefix) {
                        logger.info(`❌ PREFIX-REJECT: Cannot access structure field "${token.value}" with unprefixed name - must use ${possibleRefs.join(' or ')}`);
                    } else {
                        logger.info(`❌ PREFIX-VALIDATION: Search word "${word}" not in possible references - skipping`);
                    }
                    continue;
                }
                logger.info(`✅ PREFIX-VALIDATION: Search word "${word}" matches a valid reference`);
            }

            // This label passed validation (or doesn't have _possibleReferences)
            candidates.push(Location.create(document.uri, {
                start: { line: token.line, character: 0 },
                end: { line: token.line, character: token.value.length }
            }));
        }

        logger.info(`Returning ${candidates.length} label candidates (before scope filtering)`);
        return candidates;
    }

    /**
     * Finds the definition of a label in the current document
     * @deprecated Use findAllLabelCandidates() + ScopeAnalyzer.canAccess() instead
     * Handles prefixed labels (e.g., LOC:SomeField) with full validation logic
     */
    public findLabelDefinition(word: string, document: TextDocument, position: Position, tokens: Token[]): Location | null {
        // Get all candidates
        const candidates = this.findAllLabelCandidates(word, document, tokens);
        
        if (candidates.length === 0) {
            return null;
        }
        
        // Return first candidate (no scope filtering - this is deprecated behavior)
        // TODO: Callers should use findAllLabelCandidates() + ScopeAnalyzer instead
        return candidates[0];
    }

    /**
     * Helper: Finds a symbol at a specific line with matching variable name
     */
    private findSymbolAtLine(symbols: DocumentSymbol[], line: number, varName: string): DocumentSymbol | undefined {
        for (const symbol of symbols) {
            // Check if this symbol is at the given line
            if (symbol.range.start.line === line) {
                const symbolVarName = (symbol as any)._clarionVarName || symbol.name.match(/^([^\s]+)/)?.[1] || symbol.name;
                if (symbolVarName.toUpperCase() === varName.toUpperCase()) {
                    return symbol;
                }
            }
            
            // Recursively search children
            if (symbol.children && symbol.children.length > 0) {
                const found = this.findSymbolAtLine(symbol.children, line, varName);
                if (found) return found;
            }
        }
        return undefined;
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
