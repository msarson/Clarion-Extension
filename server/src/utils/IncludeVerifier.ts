import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import LoggerManager from '../logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = LoggerManager.getLogger('IncludeVerifier');
logger.setLevel('info');

/**
 * Represents a parsed INCLUDE statement
 */
interface IncludeStatement {
    fileName: string;      // e.g., "StringTheory.inc"
    hasOnce: boolean;      // Whether it has ,ONCE modifier
    lineNumber: number;    // Line where INCLUDE was found
}

/**
 * Cache entry for a file's includes
 */
interface IncludeCache {
    includes: IncludeStatement[];
    timestamp: number;
}

/**
 * Verifies if a class definition file is accessible via INCLUDE statements
 * in the current file or its MEMBER parent
 */
export class IncludeVerifier {
    private tokenCache = TokenCache.getInstance();
    private includeCache = new Map<string, IncludeCache>(); // URI -> IncludeCache
    private static readonly CACHE_DURATION = 60000; // 60 seconds

    /**
     * Verifies if a class file is included and accessible in the given document
     * @param classFileName The class definition filename (e.g., "StringTheory.inc")
     * @param document The document to check
     * @returns true if the class file is included, false otherwise
     */
    async isClassIncluded(classFileName: string, document: TextDocument): Promise<boolean> {
        try {
            logger.info(`Checking if ${classFileName} is included in ${document.uri}`);

            // Get includes from current file
            const currentIncludes = await this.getIncludesForFile(document);
            logger.info(`Found ${currentIncludes.length} includes in current file`);
            currentIncludes.forEach(inc => logger.info(`  - ${inc.fileName} at line ${inc.lineNumber}`));
            
            // Check if class file is in current file's includes
            if (this.hasInclude(classFileName, currentIncludes)) {
                logger.info(`✅ Found ${classFileName} in current file`);
                return true;
            }

            // Not found in current file - check MEMBER parent
            logger.info(`${classFileName} not in current file - checking MEMBER parent`);
            const memberParent = await this.getMemberParentDocument(document);
            
            if (memberParent) {
                const parentIncludes = await this.getIncludesForFile(memberParent);
                logger.info(`Found ${parentIncludes.length} includes in MEMBER parent`);
                parentIncludes.forEach(inc => logger.info(`  - ${inc.fileName} at line ${inc.lineNumber}`));
                
                if (this.hasInclude(classFileName, parentIncludes)) {
                    logger.info(`✅ Found ${classFileName} in MEMBER parent`);
                    return true;
                }
            }

            logger.info(`❌ ${classFileName} not found in any accessible scope`);
            return false;

        } catch (error) {
            logger.error(`Error verifying include: ${error instanceof Error ? error.message : String(error)}`);
            return false; // Fail safe - don't show hover if we can't verify
        }
    }

    /**
     * Gets all INCLUDE statements for a file (from cache or by parsing)
     * @param document The document to get includes for
     * @returns Array of include statements
     */
    private async getIncludesForFile(document: TextDocument): Promise<IncludeStatement[]> {
        const cached = this.includeCache.get(document.uri);
        const now = Date.now();

        // Return cached if still valid
        if (cached && (now - cached.timestamp) < IncludeVerifier.CACHE_DURATION) {
            logger.info(`Using cached includes for ${document.uri} (${cached.includes.length} includes)`);
            return cached.includes;
        }

        // Parse and cache
        logger.info(`Parsing includes for ${document.uri}`);
        const includes = await this.parseIncludes(document);
        
        this.includeCache.set(document.uri, {
            includes,
            timestamp: now
        });

        logger.info(`Cached ${includes.length} includes for ${document.uri}`);
        return includes;
    }

    /**
     * Parses INCLUDE statements from a document
     * Only looks in module scope (outside MAP, before first PROCEDURE)
     * @param document The document to parse
     * @returns Array of include statements
     */
    private async parseIncludes(document: TextDocument): Promise<IncludeStatement[]> {
        const includes: IncludeStatement[] = [];
        const tokens = this.tokenCache.getTokens(document);

        // Find boundaries: first MAP block and first PROCEDURE
        let mapStartLine = Number.MAX_SAFE_INTEGER;
        let mapEndLine = -1;
        let firstProcedureLine = Number.MAX_SAFE_INTEGER;

        // Find MAP block boundaries
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            // Find MAP keyword at column 0
            if (token.type === TokenType.Keyword && 
                token.value.toUpperCase() === 'MAP' && 
                token.start === 0) {
                mapStartLine = token.line;
                
                // Find corresponding END
                for (let j = i + 1; j < tokens.length; j++) {
                    const endToken = tokens[j];
                    if (endToken.type === TokenType.Keyword && 
                        endToken.value.toUpperCase() === 'END' && 
                        endToken.start === 0) {
                        mapEndLine = endToken.line;
                        break;
                    }
                }
                break;
            }
        }

        // Find first PROCEDURE at column 0
        for (const token of tokens) {
            if (token.type === TokenType.Label && 
                token.subType === TokenType.Procedure && 
                token.start === 0) {
                firstProcedureLine = token.line;
                break;
            }
        }

        logger.info(`Boundaries: MAP=${mapStartLine}-${mapEndLine}, FirstProc=${firstProcedureLine}`);

        // Scan for INCLUDE statements in module scope
        const lines = document.getText().split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Stop at first PROCEDURE
            if (i >= firstProcedureLine) {
                logger.info(`Stopped at first PROCEDURE at line ${i}`);
                break;
            }

            // Skip if inside MAP block
            if (i >= mapStartLine && i <= mapEndLine) {
                continue;
            }

            // Look for INCLUDE statement
            // Pattern: INCLUDE('filename.ext'),ONCE or INCLUDE('filename.ext')
            const includeMatch = line.match(/INCLUDE\s*\(\s*['"]([^'"]+)['"]\s*\)(\s*,\s*ONCE)?/i);
            
            if (includeMatch) {
                const fileName = includeMatch[1].trim(); // Trim whitespace from filename
                const hasOnce = !!includeMatch[2];
                
                includes.push({
                    fileName: path.basename(fileName), // Just filename, ignore path
                    hasOnce,
                    lineNumber: i + 1
                });
                
                logger.info(`Found INCLUDE: ${fileName} at line ${i + 1}${hasOnce ? ' (ONCE)' : ''}`);
            }
        }

        return includes;
    }

    /**
     * Checks if a class filename is in the list of includes
     * @param classFileName The class file to look for
     * @param includes The list of includes to search
     * @returns true if found, false otherwise
     */
    private hasInclude(classFileName: string, includes: IncludeStatement[]): boolean {
        const searchName = path.basename(classFileName).toLowerCase();
        
        for (const include of includes) {
            if (include.fileName.toLowerCase() === searchName) {
                logger.info(`Matched: ${classFileName} with ${include.fileName} at line ${include.lineNumber}`);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Gets the MEMBER parent document if it exists
     * @param document The current document
     * @returns The parent document or null if no MEMBER found
     */
    private async getMemberParentDocument(document: TextDocument): Promise<TextDocument | null> {
        try {
            const tokens = this.tokenCache.getTokens(document);
            
            // Look for MEMBER statement in first 5 lines
            const memberToken = tokens.find(t =>
                t.value && 
                t.value.toUpperCase() === 'MEMBER' &&
                t.line < 5 &&
                t.referencedFile
            );

            if (!memberToken || !memberToken.referencedFile) {
                logger.info('No MEMBER statement found');
                return null;
            }

            logger.info(`Found MEMBER: ${memberToken.referencedFile}`);

            // Resolve path relative to current document
            const currentFilePath = document.uri.replace('file:///', '').replace(/\//g, '\\');
            const currentFileDir = path.dirname(currentFilePath);
            const resolvedPath = path.resolve(currentFileDir, memberToken.referencedFile);

            if (!fs.existsSync(resolvedPath)) {
                logger.warn(`MEMBER file not found: ${resolvedPath}`);
                return null;
            }

            // Read and create document
            const parentContents = await fs.promises.readFile(resolvedPath, 'utf-8');
            const parentDoc = TextDocument.create(
                `file:///${resolvedPath.replace(/\\/g, '/')}`,
                'clarion',
                1,
                parentContents
            );

            // Check for empty member (has MEMBER or CODE keyword)
            const parentTokens = this.tokenCache.getTokens(parentDoc);
            const hasEmptyMemberMarker = parentTokens.some(t =>
                t.start === 0 && 
                t.type === TokenType.Keyword &&
                (t.value.toUpperCase() === 'MEMBER' || t.value.toUpperCase() === 'CODE')
            );

            if (hasEmptyMemberMarker) {
                logger.info('MEMBER parent has empty member marker - skipping include scan');
                return null;
            }

            return parentDoc;

        } catch (error) {
            logger.error(`Error getting MEMBER parent: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Clears the include cache for a specific document or all documents
     * @param uri Optional document URI to clear, or clears all if not provided
     */
    clearCache(uri?: string): void {
        if (uri) {
            this.includeCache.delete(uri);
            logger.info(`Cleared include cache for ${uri}`);
        } else {
            this.includeCache.clear();
            logger.info('Cleared all include caches');
        }
    }
}
