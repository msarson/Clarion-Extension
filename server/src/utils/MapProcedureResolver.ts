/**
 * Resolves MAP procedure definitions and implementations
 * Uses DocumentStructure as single source of truth for MAP/PROCEDURE relationships
 */

import { Location, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("MapProcedureResolver");

export class MapProcedureResolver {
    /**
     * Finds MAP procedure declaration for a PROCEDURE implementation
     * Searches for MapProcedure tokens or Function tokens inside MAP blocks
     */
    public findMapDeclaration(procName: string, tokens: Token[], document: TextDocument): Location | null {
        logger.info(`Looking for MAP declaration for procedure: ${procName}`);

        // Find all MAP structures
        const mapStructures = tokens.filter(t => 
            t.type === TokenType.Structure && 
            t.value.toUpperCase() === 'MAP'
        );

        if (mapStructures.length === 0) {
            logger.info(`No MAP blocks found`);
            return null;
        }

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
                if ((t.subType === TokenType.MapProcedure && 
                     (t.label?.toLowerCase() === procName.toLowerCase() || 
                      t.value.toLowerCase().startsWith(procName.toLowerCase()))) ||
                    (t.type === TokenType.Function && 
                     t.value.toLowerCase() === procName.toLowerCase())) {
                    logger.info(`Found MAP declaration for ${procName} at line ${t.line}`);
                    return Location.create(document.uri, {
                        start: { line: t.line, character: 0 },
                        end: { line: t.line, character: t.value.length }
                    });
                }
            }
        }

        logger.info(`No MAP declaration found for ${procName}`);
        return null;
    }

    /**
     * Finds PROCEDURE implementation for a MAP declaration
     * Position must be inside a MAP block
     */
    public findProcedureImplementation(procName: string, tokens: Token[], document: TextDocument, position: Position): Location | null {
        logger.info(`Looking for implementation of ${procName} from position ${position.line}`);

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

        // Find GlobalProcedure implementation
        const implementations = tokens.filter(t =>
            t.subType === TokenType.GlobalProcedure &&
            t.label?.toLowerCase() === procName.toLowerCase()
        );

        if (implementations.length === 0) {
            logger.info(`No implementation found for ${procName}`);
            return null;
        }

        const impl = implementations[0];
        logger.info(`Found implementation for ${procName} at line ${impl.line}`);
        
        return Location.create(document.uri, {
            start: { line: impl.line, character: 0 },
            end: { line: impl.line, character: impl.value.length }
        });
    }
}
