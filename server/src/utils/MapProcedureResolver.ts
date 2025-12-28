/**
 * Resolves MAP procedure definitions and implementations
 * Uses DocumentStructure as single source of truth for MAP/PROCEDURE relationships
 * Supports overload resolution based on parameter types
 */

import { Location, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { ProcedureSignatureUtils } from './ProcedureSignatureUtils';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("MapProcedureResolver");

export class MapProcedureResolver {
    /**
     * Finds MAP procedure declaration for a PROCEDURE implementation
     * Searches for MapProcedure tokens or Function tokens inside MAP blocks
     * Supports overload resolution based on parameter types
     * @param procName Procedure name
     * @param tokens Document tokens
     * @param document Text document
     * @param implementationSignature Optional implementation signature for overload matching
     */
    public findMapDeclaration(
        procName: string, 
        tokens: Token[], 
        document: TextDocument,
        implementationSignature?: string
    ): Location | null {
        logger.info(`Looking for MAP declaration for procedure: ${procName}`);

        if (!tokens || tokens.length === 0) {
            logger.info(`No tokens available`);
            return null;
        }

        // Find all MAP structures
        const mapStructures = tokens.filter(t => 
            t.type === TokenType.Structure && 
            t.value.toUpperCase() === 'MAP'
        );

        if (mapStructures.length === 0) {
            logger.info(`No MAP blocks found`);
            return null;
        }

        // Collect all candidate declarations
        const candidates: Array<{ token: Token, signature: string }> = [];

        // Search inside each MAP block
        for (const mapToken of mapStructures) {
            const mapStartLine = mapToken.line;
            const mapEndLine = mapToken.finishesAt;
            
            if (mapEndLine === undefined) continue;

            // Find all tokens between MAP and END
            const tokensInMap = tokens.filter(t =>
                t.line > mapStartLine && t.line < mapEndLine
            );

            // Look for MapProcedure tokens or Function tokens matching our procedure name
            for (const t of tokensInMap) {
                const isMatch = (t.subType === TokenType.MapProcedure && 
                                 (t.label?.toLowerCase() === procName.toLowerCase() || 
                                  t.value.toLowerCase().startsWith(procName.toLowerCase()))) ||
                                (t.type === TokenType.Function && 
                                 t.value.toLowerCase() === procName.toLowerCase());
                
                if (isMatch) {
                    // Get the full line as signature
                    const content = document.getText();
                    const lines = content.split('\n');
                    const signature = lines[t.line].trim();
                    
                    candidates.push({ token: t, signature });
                    logger.info(`Found MAP declaration candidate at line ${t.line}: ${signature}`);
                }
            }
        }

        if (candidates.length === 0) {
            logger.info(`No MAP declaration found for ${procName}`);
            return null;
        }

        // If only one candidate, return it
        if (candidates.length === 1) {
            logger.info(`Found single MAP declaration for ${procName} at line ${candidates[0].token.line}`);
            return Location.create(document.uri, {
                start: { line: candidates[0].token.line, character: 0 },
                end: { line: candidates[0].token.line, character: candidates[0].token.value.length }
            });
        }

        // Multiple candidates - use overload resolution
        logger.info(`Found ${candidates.length} overloaded MAP declarations for ${procName}`);
        
        // If implementation signature provided, try type matching
        if (implementationSignature) {
            const implParams = ProcedureSignatureUtils.extractParameterTypes(implementationSignature);
            logger.info(`Implementation parameter types: [${implParams.join(', ')}]`);
            
            for (const candidate of candidates) {
                const declParams = ProcedureSignatureUtils.extractParameterTypes(candidate.signature);
                logger.info(`Declaration at line ${candidate.token.line} parameter types: [${declParams.join(', ')}]`);
                
                if (ProcedureSignatureUtils.parametersMatch(implParams, declParams)) {
                    logger.info(`✅ Found exact type match at line ${candidate.token.line}`);
                    return Location.create(document.uri, {
                        start: { line: candidate.token.line, character: 0 },
                        end: { line: candidate.token.line, character: candidate.token.value.length }
                    });
                }
            }
            
            logger.info(`No exact type match found, returning first candidate`);
        }

        // Fallback to first candidate
        const firstCandidate = candidates[0];
        logger.info(`Returning first MAP declaration at line ${firstCandidate.token.line}`);
        return Location.create(document.uri, {
            start: { line: firstCandidate.token.line, character: 0 },
            end: { line: firstCandidate.token.line, character: firstCandidate.token.value.length }
        });
    }

    /**
     * Finds PROCEDURE implementation for a MAP declaration
     * Position must be inside a MAP block
     * Supports overload resolution based on parameter types
     * @param procName Procedure name
     * @param tokens Document tokens
     * @param document Text document
     * @param position Position in MAP declaration
     * @param declarationSignature Optional declaration signature for overload matching
     */
    public findProcedureImplementation(
        procName: string, 
        tokens: Token[], 
        document: TextDocument, 
        position: Position,
        declarationSignature?: string
    ): Location | null {
        logger.info(`Looking for implementation of ${procName} from position ${position.line}`);

        if (!tokens || tokens.length === 0) {
            logger.info(`No tokens available`);
            return null;
        }

        // Check if position is inside a MAP block
        const mapStructures = tokens.filter(t =>
            t.type === TokenType.Structure && 
            t.value.toUpperCase() === 'MAP' &&
            t.line < position.line &&
            t.finishesAt !== undefined &&
            t.finishesAt > position.line
        );

        if (mapStructures.length === 0) {
            logger.info(`Position ${position.line} is not inside a MAP block`);
            return null;
        }

        // Find all GlobalProcedure implementations with matching name
        const candidates: Array<{ token: Token, signature: string }> = [];
        
        const implementations = tokens.filter(t =>
            t.subType === TokenType.GlobalProcedure &&
            t.label?.toLowerCase() === procName.toLowerCase()
        );

        if (implementations.length === 0) {
            logger.info(`No implementation found for ${procName}`);
            return null;
        }

        // Collect signatures for all implementations
        const content = document.getText();
        const lines = content.split('\n');
        
        for (const impl of implementations) {
            const signature = lines[impl.line].trim();
            candidates.push({ token: impl, signature });
            logger.info(`Found implementation candidate at line ${impl.line}: ${signature}`);
        }

        // If only one candidate, return it
        if (candidates.length === 1) {
            const impl = candidates[0].token;
            logger.info(`Found single implementation for ${procName} at line ${impl.line}`);
            return Location.create(document.uri, {
                start: { line: impl.line, character: 0 },
                end: { line: impl.line, character: impl.value.length }
            });
        }

        // Multiple candidates - use overload resolution
        logger.info(`Found ${candidates.length} overloaded implementations for ${procName}`);
        
        // If declaration signature provided, try type matching
        if (declarationSignature) {
            const declParams = ProcedureSignatureUtils.extractParameterTypes(declarationSignature);
            logger.info(`Declaration parameter types: [${declParams.join(', ')}]`);
            
            for (const candidate of candidates) {
                const implParams = ProcedureSignatureUtils.extractParameterTypes(candidate.signature);
                logger.info(`Implementation at line ${candidate.token.line} parameter types: [${implParams.join(', ')}]`);
                
                if (ProcedureSignatureUtils.parametersMatch(declParams, implParams)) {
                    logger.info(`✅ Found exact type match at line ${candidate.token.line}`);
                    return Location.create(document.uri, {
                        start: { line: candidate.token.line, character: 0 },
                        end: { line: candidate.token.line, character: candidate.token.value.length }
                    });
                }
            }
            
            logger.info(`No exact type match found, returning first candidate`);
        }

        // Fallback to first candidate
        const impl = candidates[0].token;
        logger.info(`Returning first implementation at line ${impl.line}`);
        return Location.create(document.uri, {
            start: { line: impl.line, character: 0 },
            end: { line: impl.line, character: impl.value.length }
        });
    }
}
