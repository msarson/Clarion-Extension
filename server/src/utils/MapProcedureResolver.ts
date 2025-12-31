/**
 * Resolves MAP procedure definitions and implementations
 * Uses DocumentStructure as single source of truth for MAP/PROCEDURE relationships
 * Supports overload resolution based on parameter types
 */

import { Location, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { ProcedureSignatureUtils } from './ProcedureSignatureUtils';
import { DocumentStructure } from '../DocumentStructure';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("MapProcedureResolver");
logger.setLevel("error"); // Production: Only log errors

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
     * @param documentStructure Optional pre-built DocumentStructure (for performance)
     */
    public async findProcedureImplementation(
        procName: string, 
        tokens: Token[], 
        document: TextDocument, 
        position: Position,
        declarationSignature?: string,
        documentStructure?: DocumentStructure
    ): Promise<Location | null> {
        logger.info(`Looking for implementation of ${procName} from position ${position.line}`);

        if (!tokens || tokens.length === 0) {
            logger.info(`No tokens available`);
            return null;
        }

        // Check if we're inside a PROCEDURE/ROUTINE/PROGRAM block - if so, skip MAP logic
        // (we're in actual code, not in a MAP declaration section)
        const procedureBlocks = tokens.filter(t =>
            (t.subType === TokenType.GlobalProcedure || t.type === TokenType.ClarionDocument) &&
            t.line < position.line &&
            t.finishesAt !== undefined &&
            t.finishesAt >= position.line
        );

        logger.info(`Checking if position ${position.line} is inside PROCEDURE/PROGRAM block. Found ${procedureBlocks.length} blocks containing this position`);
        if (procedureBlocks.length > 0) {
            logger.info(`Position ${position.line} is inside a PROCEDURE/ROUTINE/PROGRAM block (line ${procedureBlocks[0].line}-${procedureBlocks[0].finishesAt}), not a MAP declaration`);
            return null;
        }

        // Check if position is inside a MAP block using DocumentStructure
        // Use provided structure or create new one (for tests)
        const docStructure = documentStructure || new DocumentStructure(tokens);
        if (!docStructure.isInMapBlock(position.line)) {
            logger.info(`Position ${position.line} is not inside a MAP block`);
            return null;
        }

        // Get MAP blocks for MODULE lookup
        const mapBlocks = docStructure.getMapBlocks();
        const mapBlock = mapBlocks.find(m =>
            m.line < position.line &&
            m.finishesAt !== undefined &&
            m.finishesAt > position.line
        );

        if (!mapBlock) {
            logger.info(`Could not find MAP block containing position ${position.line}`);
            return null;
        }
        
        // Find the MODULE block that contains the current position
        // MODULE blocks are Structure tokens with value='MODULE' or 'Module'
        const moduleBlocks = tokens.filter(t =>
            t.type === TokenType.Structure &&
            t.value.toUpperCase() === 'MODULE' &&
            t.line > mapBlock.line &&
            t.line < (mapBlock.finishesAt || Infinity) &&
            t.line < position.line &&  // MODULE must be before position
            t.finishesAt !== undefined &&
            t.finishesAt > position.line  // MODULE must extend past position
        );
        
        // If position is inside a MODULE block, find the MODULE token with referencedFile
        if (moduleBlocks.length > 0) {
            const containingModule = moduleBlocks[0];
            logger.info(`Position is inside MODULE block at line ${containingModule.line}`);
            
            // Find the MODULE keyword token (with referencedFile) on that line
            const moduleToken = tokens.find(t =>
                t.line === containingModule.line &&
                t.value.toUpperCase() === 'MODULE' &&
                t.referencedFile
            );
            
            if (moduleToken?.referencedFile) {
                logger.info(`MAP contains MODULE('${moduleToken.referencedFile}'), searching external file`);
                const externalImpl = await this.findImplementationInModuleFile(
                    procName, 
                    moduleToken.referencedFile,
                    document,
                    declarationSignature
                );
                if (externalImpl) {
                    return externalImpl;
                }
                logger.info(`No implementation found in MODULE file, searching current file`);
            } else {
                logger.info(`MODULE block found but no referencedFile (probably Windows API)`);
            }
        } else {
            logger.info(`Position not inside any MODULE block, procedure is in MAP without MODULE`);
        }

        // Find all GlobalProcedure implementations with matching name in current file
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

    /**
     * Search for procedure implementation in external MODULE file
     * Uses RedirectionParser to resolve file path
     * @param procName Procedure name to find
     * @param moduleFile Filename from MODULE('filename')
     * @param document Current document (for path resolution context)
     * @param declarationSignature Optional signature for overload matching
     */
    private async findImplementationInModuleFile(
        procName: string,
        moduleFile: string,
        document: TextDocument,
        declarationSignature?: string
    ): Promise<Location | null> {
        try {
            const fs = await import('fs');
            const path = await import('path');
            
            // Try to resolve the file path using redirection
            const SolutionManager = (await import('../solution/solutionManager')).SolutionManager;
            const solutionManager = SolutionManager.getInstance();
            
            let resolvedPath: string | null = null;
            
            // Try solution-wide redirection first
            if (solutionManager && solutionManager.solution) {
                for (const project of solutionManager.solution.projects) {
                    const redirectionParser = project.getRedirectionParser();
                    const resolved = redirectionParser.findFile(moduleFile);
                    logger.info(`RedirectionParser.findFile('${moduleFile}') returned:`, resolved);
                    if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                        resolvedPath = resolved.path;
                        logger.info(`✅ Resolved MODULE file via redirection: ${resolvedPath}`);
                        logger.info(`   fs.existsSync check: ${fs.existsSync(resolvedPath)}`);
                        break;
                    }
                }
            }
            
            // Fallback to relative path from current document
            if (!resolvedPath) {
                const currentDir = path.dirname(decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\'));
                const relativePath = path.join(currentDir, moduleFile);
                if (fs.existsSync(relativePath)) {
                    resolvedPath = path.resolve(relativePath);
                    logger.info(`✅ Resolved MODULE file via relative path: ${resolvedPath}`);
                }
            }
            
            if (!resolvedPath) {
                logger.info(`❌ Could not resolve MODULE file: ${moduleFile}`);
                return null;
            }
            
            // Read and tokenize the MODULE file
            const content = fs.readFileSync(resolvedPath, 'utf8');
            const ClarionTokenizer = (await import('../ClarionTokenizer')).ClarionTokenizer;
            const tokenizer = new ClarionTokenizer(content);
            const moduleTokens = tokenizer.tokenize();
            
            // Find GlobalProcedure implementations
            const implementations = moduleTokens.filter(t =>
                t.subType === TokenType.GlobalProcedure &&
                t.label?.toLowerCase() === procName.toLowerCase()
            );
            
            if (implementations.length === 0) {
                logger.info(`No implementation found in MODULE file for ${procName}`);
                return null;
            }
            
            // If only one, return it
            if (implementations.length === 1) {
                const impl = implementations[0];
                logger.info(`✅ Found implementation in MODULE file at line ${impl.line}`);
                return Location.create(`file:///${resolvedPath.replace(/\\/g, '/')}`, {
                    start: { line: impl.line, character: 0 },
                    end: { line: impl.line, character: impl.value.length }
                });
            }
            
            // Multiple implementations - try overload resolution
            logger.info(`Found ${implementations.length} overloaded implementations in MODULE file`);
            
            if (declarationSignature) {
                const lines = content.split('\n');
                const declParams = ProcedureSignatureUtils.extractParameterTypes(declarationSignature);
                
                for (const impl of implementations) {
                    const signature = lines[impl.line].trim();
                    const implParams = ProcedureSignatureUtils.extractParameterTypes(signature);
                    
                    if (ProcedureSignatureUtils.parametersMatch(declParams, implParams)) {
                        logger.info(`✅ Found exact type match in MODULE file at line ${impl.line}`);
                        return Location.create(`file:///${resolvedPath.replace(/\\/g, '/')}`, {
                            start: { line: impl.line, character: 0 },
                            end: { line: impl.line, character: impl.value.length }
                        });
                    }
                }
            }
            
            // Fallback to first implementation
            const impl = implementations[0];
            logger.info(`Returning first implementation from MODULE file at line ${impl.line}`);
            return Location.create(`file:///${resolvedPath.replace(/\\/g, '/')}`, {
                start: { line: impl.line, character: 0 },
                end: { line: impl.line, character: impl.value.length }
            });
            
        } catch (error) {
            logger.error(`Error searching MODULE file: ${error}`);
            return null;
        }
    }
}
