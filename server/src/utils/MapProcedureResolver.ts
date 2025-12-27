/**
 * Resolves MAP procedure definitions and implementations
 * Handles bidirectional navigation between MAP declarations and PROCEDURE implementations
 */

import { Location, Position, Range } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("MapProcedureResolver");

export class MapProcedureResolver {
    /**
     * Checks if line is a MAP procedure implementation (not a method implementation)
     * @param line The line text to check
     * @returns Object with procName if it's a MAP procedure implementation, null otherwise
     */
    public detectProcedureImplementation(line: string): { procName: string } | null {
        // Match PROCEDURE or FUNCTION keyword (not a class method)
        if (!(line.toUpperCase().includes('PROCEDURE') || line.toUpperCase().includes('FUNCTION'))) {
            return null;
        }
        
        // Rule out method implementations (ClassName.MethodName PROCEDURE)
        const methodImplMatch = line.match(/^(\w+)\.(\w+)\s+(PROCEDURE|FUNCTION)/i);
        if (methodImplMatch) {
            return null;
        }
        
        // Try to extract procedure name
        const procImplMatch = line.match(/^\s*(\w+)\s+(PROCEDURE|FUNCTION)/i);
        if (procImplMatch) {
            return { procName: procImplMatch[1] };
        }
        
        return null;
    }

    /**
     * Finds a MAP procedure declaration for a given PROCEDURE implementation
     * (Reverse navigation: PROCEDURE → MAP)
     */
    public findMapDeclaration(procName: string, tokens: Token[], document: TextDocument): Location | null {
        logger.info(`Looking for MAP declaration for procedure: ${procName}`);

        // Get document text and split into lines
        const content = document.getText();
        const lines = content.split('\n');

        // Find MAP blocks by searching for MAP...END
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Found start of MAP block
            if (line.toUpperCase() === 'MAP') {
                logger.info(`Found MAP block starting at line ${i}`);
                
                // Search within this MAP block for the procedure name
                for (let j = i + 1; j < lines.length; j++) {
                    const mapLine = lines[j].trim();
                    
                    // End of MAP block
                    if (mapLine.toUpperCase().startsWith('END')) {
                        logger.info(`End of MAP block at line ${j}`);
                        break;
                    }
                    
                    // Check if this line declares our procedure
                    // Match two formats:
                    // 1. ProcName        PROCEDURE(...) - at column 0 with PROCEDURE keyword
                    // 2.     ProcName(...) - indented without PROCEDURE keyword
                    const procPattern = new RegExp(`^\\s*${procName}\\s*(\\(|PROCEDURE|FUNCTION)`, 'i');
                    if (procPattern.test(lines[j])) {
                        logger.info(`Found MAP declaration for ${procName} at line ${j}`);
                        return Location.create(document.uri, {
                            start: { line: j, character: 0 },
                            end: { line: j, character: lines[j].length }
                        });
                    }
                }
            }
        }

        logger.info(`No MAP declaration found for ${procName}`);
        return null;
    }

    /**
     * Finds a PROCEDURE implementation for a procedure declared in a MAP block
     * (Forward navigation: MAP declaration → PROCEDURE)
     */
    public findProcedureImplementation(procName: string, tokens: Token[], document: TextDocument, position: Position): Location | null {
        logger.info(`Checking if ${procName} is in a MAP block`);

        // Get document text and split into lines
        const content = document.getText();
        const lines = content.split('\n');

        // Check if current position is within a MAP block
        let isInMap = false;
        for (let i = 0; i < lines.length && i <= position.line; i++) {
            const line = lines[i].trim();
            if (line.toUpperCase() === 'MAP') {
                // Found MAP start, check if position is before END
                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].trim().toUpperCase().startsWith('END')) {
                        // If position is between MAP and END, we're in a MAP block
                        if (position.line > i && position.line < j) {
                            isInMap = true;
                            logger.info(`Position is inside MAP block at line ${i}`);
                        }
                        break;
                    }
                }
            }
        }

        if (!isInMap) {
            return null;
        }

        // Find the PROCEDURE implementation (outside MAP blocks)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Skip lines inside MAP blocks
            if (line.trim().toUpperCase() === 'MAP') {
                // Skip to END of this MAP block
                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].trim().toUpperCase().startsWith('END')) {
                        i = j;
                        break;
                    }
                }
                continue;
            }

            // Check if this line is a PROCEDURE implementation
            const procImplPattern = new RegExp(`^\\s*${procName}\\s+(PROCEDURE|FUNCTION)`, 'i');
            if (procImplPattern.test(line)) {
                logger.info(`Found PROCEDURE implementation for ${procName} at line ${i}`);
                return Location.create(document.uri, {
                    start: { line: i, character: 0 },
                    end: { line: i, character: line.length }
                });
            }
        }

        logger.info(`No PROCEDURE implementation found for ${procName}`);
        return null;
    }
}
