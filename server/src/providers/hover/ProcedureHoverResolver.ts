import { Hover, Location, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../../ClarionTokenizer';
import { TokenCache } from '../../TokenCache';
import { MapProcedureResolver } from '../../utils/MapProcedureResolver';
import { CrossFileResolver } from '../../utils/CrossFileResolver';
import { HoverFormatter } from './HoverFormatter';
import { ClarionPatterns } from '../../utils/ClarionPatterns';
import { ProcedureCallDetector } from '../utils/ProcedureCallDetector';
import LoggerManager from '../../logger';
import * as fs from 'fs';

const logger = LoggerManager.getLogger("ProcedureHoverResolver");
logger.setLevel("error");

/**
 * Resolves hover information for procedures (MAP declarations and implementations)
 */
export class ProcedureHoverResolver {
    private tokenCache = TokenCache.getInstance();
    private mapResolver: MapProcedureResolver;
    private crossFileResolver: CrossFileResolver;
    private formatter: HoverFormatter;

    constructor(
        mapResolver: MapProcedureResolver,
        crossFileResolver: CrossFileResolver,
        formatter: HoverFormatter
    ) {
        this.mapResolver = mapResolver;
        this.crossFileResolver = crossFileResolver;
        this.formatter = formatter;
    }

    /**
     * Resolves hover for a procedure call (e.g., MyProc() or START(MyProc))
     */
    async resolveProcedureCall(
        word: string,
        document: TextDocument,
        position: Position,
        wordRange: any,
        line: string
    ): Promise<Hover | null> {
        const detection = ProcedureCallDetector.isProcedureCallOrReference(document, position, wordRange);
        const isSelfMethodCall = word.toUpperCase().includes('SELF.') && /\w+\.\w+/.test(word);
        
        if (!detection.isProcedure || isSelfMethodCall) {
            return null;
        }

        logger.info(`Detected procedure ${ProcedureCallDetector.getDetectionMessage(word, detection.isStartCall)}`);
        
        // Get tokens for parameter counting
        const tokens = this.tokenCache.getTokens(document);
        
        // Find MAP declaration first
        const mapDecl = this.mapResolver.findMapDeclaration(word, tokens, document, line);
        logger.info(`MAP declaration found: ${!!mapDecl}`);
        
        let procImpl = null;
        if (mapDecl) {
            // Check if MAP declaration is from an INCLUDE file
            const mapDeclUri = mapDecl.uri;
            const isFromInclude = mapDeclUri !== document.uri;
            
            logger.info(`MAP from INCLUDE: ${isFromInclude}, mapUri: ${mapDeclUri}`);
            
            if (isFromInclude) {
                logger.info(`MAP declaration is from INCLUDE file: ${mapDeclUri}`);
                // Load the INCLUDE file and its tokens
                try {
                    const decodedPath = decodeURIComponent(mapDeclUri.replace('file:///', ''));
                    const includeContent = fs.readFileSync(decodedPath, 'utf-8');
                    const includeDoc = TextDocument.create(mapDeclUri, 'clarion', 1, includeContent);
                    const includeTokens = this.tokenCache.getTokens(includeDoc);
                    
                    // Find implementation using INCLUDE file's document and tokens
                    const mapPosition: Position = { line: mapDecl.range.start.line, character: 0 };
                    procImpl = await this.mapResolver.findProcedureImplementation(
                        word,
                        includeTokens,
                        includeDoc,
                        mapPosition,
                        line
                    );
                } catch (error) {
                    logger.info(`Error loading INCLUDE file: ${error}`);
                }
            } else {
                // Find implementation using MAP declaration position in current document
                logger.info(`Looking for implementation in current document at MAP line ${mapDecl.range.start.line}`);
                const mapPosition: Position = { line: mapDecl.range.start.line, character: 0 };
                procImpl = await this.mapResolver.findProcedureImplementation(
                    word,
                    tokens,
                    document,
                    mapPosition,
                    line
                );
                logger.info(`Implementation found in current document: ${!!procImpl}`);
            }
        }
        
        logger.info(`Final result: mapDecl=${!!mapDecl}, procImpl=${!!procImpl}`);
        
        if (mapDecl || procImpl) {
            return this.formatter.formatProcedure(word, mapDecl, procImpl, document, position);
        }
        
        return null;
    }

    /**
     * Resolves hover for a procedure implementation (e.g., hovering on "MyProc PROCEDURE")
     */
    async resolveProcedureImplementation(
        document: TextDocument,
        position: Position,
        line: string,
        documentStructure: any
    ): Promise<Hover | null> {
        const mapProcMatch = line.match(ClarionPatterns.PROCEDURE_IMPLEMENTATION);
        logger.info(`MAP procedure regex test: line="${line}", match=${!!mapProcMatch}, inMapBlock=${documentStructure.isInMapBlock(position.line)}`);
        
        if (!mapProcMatch || documentStructure.isInMapBlock(position.line)) {
            return null;
        }

        const procName = mapProcMatch[2]; // [1] is whitespace, [2] is name, [3] is keyword
        const procNameStart = line.indexOf(procName);
        const procNameEnd = procNameStart + procName.length;
        
        // Check if cursor is on the procedure name
        if (position.character < procNameStart || position.character > procNameEnd) {
            return null;
        }

        // Determine scope for this procedure implementation
        const tokens = this.tokenCache.getTokens(document);
        const firstNonCommentToken = tokens.find(t => t.type !== TokenType.Comment);
        const isProgramFile = firstNonCommentToken?.type === TokenType.ClarionDocument && 
                             firstNonCommentToken.value.toUpperCase() === 'PROGRAM';
        const isMemberFile = firstNonCommentToken?.type === TokenType.ClarionDocument && 
                            (firstNonCommentToken.value.toUpperCase() === 'MEMBER' || 
                             firstNonCommentToken.value.toUpperCase().startsWith('MEMBER('));
        
        // Find the MAP declaration for this procedure using resolver
        const mapLocation = this.mapResolver.findMapDeclaration(procName, tokens, document, line);
        
        if (!mapLocation) {
            // Not found in current file, check for MEMBER
            logger.info(`MAP declaration not found in current file, checking for MEMBER...`);
            const memberToken = tokens.find(t => 
                t.line < 5 && 
                t.value.toUpperCase() === 'MEMBER' &&
                t.referencedFile
            );
            
            if (memberToken?.referencedFile) {
                logger.info(`Found MEMBER('${memberToken.referencedFile}'), searching parent for MAP declaration`);
                
                // Use CrossFileResolver to find MAP declaration
                const memberMapResult = await this.crossFileResolver.findMapDeclarationInMemberFile(
                    procName,
                    memberToken.referencedFile,
                    document,
                    line
                );
                
                if (memberMapResult) {
                    // Found MAP in parent file - use it
                    const implLocation: Location = {
                        uri: document.uri,
                        range: {
                            start: { line: position.line, character: procNameStart },
                            end: { line: position.line, character: procNameEnd }
                        }
                    };
                    
                    return this.formatter.formatProcedure(procName, memberMapResult.location, implLocation, document, position);
                }
            }
        } else {
            // Found MAP in current file
            const implLocation: Location = {
                uri: document.uri,
                range: {
                    start: { line: position.line, character: procNameStart },
                    end: { line: position.line, character: procNameEnd }
                }
            };
            
            return this.formatter.formatProcedure(procName, mapLocation, implLocation, document, position);
        }
        
        return null;
    }

    /**
     * Resolves hover for a MAP declaration (e.g., hovering on procedure name in MAP block)
     */
    async resolveMapDeclaration(
        document: TextDocument,
        position: Position,
        line: string,
        documentStructure: any
    ): Promise<Hover | null> {
        if (!documentStructure.isInMapBlock(position.line)) {
            return null;
        }

        logger.info(`Inside MAP block at line ${position.line}`);
        
        // MAP declarations have two formats:
        // 1. Indented: "    MyProc(params)" - no PROCEDURE/FUNCTION keyword
        // 2. Column 0: "MyProc    PROCEDURE(params)" or "MyProc    FUNCTION(params)" - with keyword
        const mapDeclMatch = line.match(ClarionPatterns.MAP_PROCEDURE_DECLARATION);
        logger.info(`MAP declaration regex match: ${mapDeclMatch ? 'YES' : 'NO'}, line="${line}"`);
        
        if (!mapDeclMatch) {
            return null;
        }

        const procName = mapDeclMatch[1];
        const procNameStart = line.indexOf(procName);
        const procNameEnd = procNameStart + procName.length;
        
        logger.info(`Procedure name: "${procName}", range: ${procNameStart}-${procNameEnd}, cursor at: ${position.character}`);
        
        // Check if cursor is on the procedure name
        if (position.character < procNameStart || position.character > procNameEnd) {
            logger.info(`Cursor NOT on procedure name (cursor at ${position.character}, name range ${procNameStart}-${procNameEnd})`);
            return null;
        }

        logger.info(`Cursor is on procedure name, searching for implementation with overload resolution...`);
        
        // Use MapProcedureResolver for overload resolution
        const tokens = this.tokenCache.getTokens(document);
        const implLocation = await this.mapResolver.findProcedureImplementation(
            procName, 
            tokens, 
            document, 
            position, 
            line,
            documentStructure
        );
        
        // Use the standard procedure hover construction
        const mapDecl: Location = {
            uri: document.uri,
            range: {
                start: { line: position.line, character: procNameStart },
                end: { line: position.line, character: procNameEnd }
            }
        };
        
        return this.formatter.formatProcedure(procName, mapDecl, implLocation, document, position);
    }
}
